"use strict";
/* تحقق صارم من كل مدخلات الـAPI — نفس قواعد الواجهة. */

const PHONE_RE = /^0[67]\d{8}$/; // مغربي: يبدأ بـ 06 أو 07

function cleanStr(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s === "" ? null : s;
}
function cleanNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validPhone(p) {
  if (typeof p !== "string") return null;
  const digits = p.replace(/[\s\-().]/g, "");
  const norm = digits.startsWith("+212") ? "0" + digits.slice(4) : digits.startsWith("212") && digits.length === 12 ? "0" + digits.slice(3) : digits;
  return PHONE_RE.test(norm) ? norm : null;
}

const LEAD_SOURCES = ["site", "ai", "whatsapp", "phone", "facebook"];
const LEAD_STATUS = ["new", "contacted", "qualified", "won", "lost"];

/** جسم POST /api/leads — يُرجع {ok, lead} أو {ok:false, error} */
function validateLead(b) {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid-body" };
  if (b.website) return { ok: false, error: "spam" }; // honeypot
  const name = cleanStr(b.name, 120);
  if (!name) return { ok: false, error: "name-required" };
  const phone = validPhone(b.phone);
  if (!phone) return { ok: false, error: "phone-invalid" };
  const city = cleanStr(b.city, 80);
  const budget = cleanNum(b.budget);
  if (b.budget !== undefined && b.budget !== null && b.budget !== "" && budget === null)
    return { ok: false, error: "budget-invalid" };
  let preferences = {};
  if (b.preferences !== undefined) {
    if (typeof b.preferences !== "object" || b.preferences === null || Array.isArray(b.preferences))
      return { ok: false, error: "preferences-invalid" };
    preferences = JSON.parse(JSON.stringify(b.preferences).slice(0, 2000));
  }
  const source = LEAD_SOURCES.includes(b.source) ? b.source : "site";
  return { ok: true, lead: { name, phone, city, budget, preferences, source } };
}

function validateViewing(b, db) {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid-body" };
  if (b.website) return { ok: false, error: "spam" };
  const listing_id = cleanStr(b.listing_id, 120);
  if (!listing_id) return { ok: false, error: "listing-required" };
  const exists = db.prepare("SELECT 1 FROM listings WHERE id = ? AND status != 'unavailable'").get(listing_id);
  if (!exists) return { ok: false, error: "listing-not-found" };
  const name = cleanStr(b.name, 120);
  if (!name) return { ok: false, error: "name-required" };
  const phone = validPhone(b.phone);
  if (!phone) return { ok: false, error: "phone-invalid" };
  const preferred_date = cleanStr(b.preferred_date, 30);
  return { ok: true, viewing: { listing_id, name, phone, preferred_date } };
}

const LISTING_STATUS = ["available", "unavailable", "review"];
/** تحقق من جسم عقار (للإدارة) — جزئي للتعديل، كامل للإنشاء */
function validateListingInput(b, partial) {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid-body" };
  const out = {};
  const strFields = ["title", "type", "city", "neighborhood", "address", "ownership", "condition", "description", "source_url", "source_name", "seller_type", "seller_name", "date_added", "date_verified", "verification", "verification_note", "status"];
  const numFields = ["price", "area", "rooms", "bathrooms", "floor"];
  const boolFields = ["furnished", "parking", "elevator", "negotiable", "photo_real", "agency_direct", "spotlight"];
  for (const f of strFields) {
    if (b[f] !== undefined) {
      const v = cleanStr(b[f], f === "description" || f === "verification_note" ? 4000 : 300);
      if (v === null && !partial && ["title"].includes(f)) return { ok: false, error: f + "-required" };
      out[f] = v;
    } else if (!partial && f === "title") return { ok: false, error: "title-required" };
  }
  if (b.status !== undefined && !LISTING_STATUS.includes(b.status)) return { ok: false, error: "status-invalid" };
  for (const f of numFields) {
    if (b[f] !== undefined) {
      const v = cleanNum(b[f]);
      if (v === null && b[f] !== null) return { ok: false, error: f + "-invalid" };
      out[f] = v;
    }
  }
  for (const f of boolFields) {
    if (b[f] !== undefined) {
      if (b[f] !== null && typeof b[f] !== "boolean") return { ok: false, error: f + "-invalid" };
      out[f] = b[f];
    }
  }
  for (const f of ["photos", "features"]) {
    if (b[f] !== undefined) {
      if (!Array.isArray(b[f]) || b[f].some((x) => typeof x !== "string"))
        return { ok: false, error: f + "-invalid" };
      out[f] = b[f].slice(0, 50).map((x) => x.slice(0, 500));
    }
  }
  return { ok: true, listing: out };
}

module.exports = { validPhone, validateLead, validateViewing, validateListingInput, LEAD_STATUS, LISTING_STATUS };
