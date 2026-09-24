"use strict";
/* البحث في قاعدة البيانات — بنفس منطق الواجهة تماماً.
 * نعيد استعمال searchListings/matchFilters من ملف الواجهة عبر
 * حقن الصفوف في global.LISTINGS مؤقتاً. آمن لأن searchListings
 * متزامن بالكامل: لا يوجد await بين الحقن والاستعادة. */
const path = require("path");

if (typeof global.LISTINGS === "undefined") global.LISTINGS = [];
if (typeof global.SOUQ_CONFIG === "undefined") global.SOUQ_CONFIG = {};
const ai = require(path.join(__dirname, "..", "..", "shared", "ai-assistant.js"));

const BOOL_FIELDS = ["furnished", "parking", "elevator", "negotiable", "photo_real", "agency_direct", "spotlight"];
const BOOL_NOT_NULL = new Set(["photo_real", "agency_direct", "spotlight"]);
const JSON_FIELDS = ["photos", "features"];

function boolOut(v) {
  return v === null || v === undefined ? null : v === 1;
}

/** صف DB → كائن بنفس شكل data/listings.js (أسماء الحقول 1:1) */
function rowToListing(r) {
  const l = { ...r };
  for (const f of BOOL_FIELDS) l[f] = boolOut(r[f]);
  for (const f of JSON_FIELDS) {
    try { l[f] = JSON.parse(r[f] || "[]"); } catch { l[f] = []; }
  }
  delete l.created_at;
  delete l.updated_at;
  return l;
}

/** كائن listings.js → صف DB */
function listingToRow(l) {
  const row = { ...l };
  for (const f of BOOL_FIELDS) {
    if (l[f] === null || l[f] === undefined) row[f] = BOOL_NOT_NULL.has(f) ? 0 : null;
    else row[f] = l[f] ? 1 : 0;
  }
  for (const f of JSON_FIELDS) row[f] = JSON.stringify(l[f] || []);
  delete row.created_at;
  delete row.updated_at;
  return row;
}

/** بحث مرتب — نفس searchListings في الواجهة (ترتيب/تسجيل/بدائل) */
function searchDb(db, filters) {
  const rows = db.prepare("SELECT * FROM listings WHERE status != 'unavailable'").all();
  const listings = rows.map(rowToListing);
  const prev = global.LISTINGS;
  global.LISTINGS = listings;
  try {
    return ai.searchListings(filters);
  } finally {
    global.LISTINGS = prev;
  }
}

/** بدائل مخففة معلنة عند انعدام النتائج — نفس nearMatches */
function nearMatchesDb(db, filters) {
  const rows = db.prepare("SELECT * FROM listings WHERE status != 'unavailable'").all();
  const prev = global.LISTINGS;
  global.LISTINGS = rows.map(rowToListing);
  try {
    return ai.nearMatches(filters);
  } finally {
    global.LISTINGS = prev;
  }
}

function countAvailable(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM listings WHERE status != 'unavailable'").get().c;
}

module.exports = { rowToListing, listingToRow, searchDb, nearMatchesDb, countAvailable, featureMatch: ai.featureMatch };
