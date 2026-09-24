"use strict";
/* استيراد العقارات من المصدر الحي (أو ملف) إلى قاعدة البيانات.
 * - Upsert حسب id — الـ IDs لا تتغير أبداً.
 * - عقار غاب عن المصدر: إن كان agency_direct يُحفَظ (قاعدة ملزمة)،
 *   وإلا يُوسم unavailable.
 * - الدفعة الكاملة تُنفَّذ كمعاملة واحدة عبر db.batch().
 * - يُستعمل كـ CLI: node src/import-listings.js [--from-file PATH]
 *   وكدالة من مسار الإدارة POST /api/admin/sync.
 */
const fs = require("fs");
const { config } = require("./config");
const { getDb, all } = require("./db");
const { listingToRow } = require("./lib/search");

const UPSERT_SQL =
  `INSERT INTO listings (id,title,type,city,neighborhood,address,price,area,rooms,bathrooms,floor,furnished,parking,elevator,ownership,negotiable,condition,photos,photo_real,description,features,source_url,source_name,seller_type,seller_name,date_added,date_verified,verification,verification_note,status,agency_direct,spotlight,updated_at)
   VALUES (@id,@title,@type,@city,@neighborhood,@address,@price,@area,@rooms,@bathrooms,@floor,@furnished,@parking,@elevator,@ownership,@negotiable,@condition,@photos,@photo_real,@description,@features,@source_url,@source_name,@seller_type,@seller_name,@date_added,@date_verified,@verification,@verification_note,@status,@agency_direct,@spotlight,datetime('now'))
   ON CONFLICT(id) DO UPDATE SET
     title=excluded.title,type=excluded.type,city=excluded.city,neighborhood=excluded.neighborhood,address=excluded.address,
     price=excluded.price,area=excluded.area,rooms=excluded.rooms,bathrooms=excluded.bathrooms,floor=excluded.floor,
     furnished=excluded.furnished,parking=excluded.parking,elevator=excluded.elevator,ownership=excluded.ownership,
     negotiable=excluded.negotiable,condition=excluded.condition,photos=excluded.photos,photo_real=excluded.photo_real,
     description=excluded.description,features=excluded.features,source_url=excluded.source_url,source_name=excluded.source_name,
     seller_type=excluded.seller_type,seller_name=excluded.seller_name,date_added=excluded.date_added,date_verified=excluded.date_verified,
     verification=excluded.verification,verification_note=excluded.verification_note,status=excluded.status,
     agency_direct=excluded.agency_direct,spotlight=excluded.spotlight,updated_at=datetime('now')`;

function extractListings(jsText) {
  const factory = new Function(jsText + "\nreturn { LISTINGS: (typeof LISTINGS !== 'undefined' ? LISTINGS : null) };");
  const out = factory();
  if (!out || !Array.isArray(out.LISTINGS) || !out.LISTINGS.length)
    throw new Error("المصدر لا يحتوي LISTINGS صالحة");
  return out.LISTINGS;
}

async function fetchSourceText(fromFile) {
  if (fromFile) return fs.readFileSync(fromFile, "utf8");
  const res = await fetch(config.listingsSourceUrl);
  if (!res.ok) throw new Error("فشل جلب المصدر: HTTP " + res.status);
  return await res.text();
}

async function runImport({ db, fromFile } = {}) {
  if (!db) db = await getDb();
  const text = await fetchSourceText(fromFile);
  const listings = extractListings(text);

  const ids = listings.map((l) => l.id);
  if (ids.some((id) => typeof id !== "string" || !id))
    throw new Error("عقار بدون id صالح في المصدر");
  if (new Set(ids).size !== ids.length)
    throw new Error("ids مكررة في المصدر");
  const idSet = new Set(ids);

  const existing = await all(db, "SELECT id, agency_direct, status FROM listings");
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const report = { total_source: listings.length, inserted: 0, updated: 0, marked_unavailable: 0, preserved_agency: 0 };
  const batch = [];
  for (const l of listings) {
    batch.push({ sql: UPSERT_SQL, args: listingToRow(l) });
    if (existingById.has(l.id)) report.updated++; else report.inserted++;
  }
  // الغائبون عن المصدر
  for (const r of existing) {
    if (idSet.has(r.id) || r.status === "unavailable") continue;
    if (r.agency_direct) {
      report.preserved_agency++;
    } else {
      batch.push({
        sql: "UPDATE listings SET status='unavailable', updated_at=datetime('now') WHERE id = ?",
        args: [r.id],
      });
      report.marked_unavailable++;
    }
  }
  if (batch.length) await db.batch(batch);
  report.ids = ids;
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const fi = args.indexOf("--from-file");
  const fromFile = fi !== -1 ? args[fi + 1] : null;
  runImport({ fromFile })
    .then((r) => {
      console.log(JSON.stringify({ ok: true, ...r, ids: r.ids.length }, null, 2));
      console.log("IDs محفوظة:", r.ids.length);
    })
    .catch((e) => { console.error("IMPORT FAILED:", e.message); process.exit(1); });
}

module.exports = runImport;
