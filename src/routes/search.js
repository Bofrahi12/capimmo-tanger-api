"use strict";
/* POST /api/search — بحث مرتب بنفس منطق الواجهة (searchListings).
 * الجسم: { city?, property_type?, min_price?, max_price?, min_beds?,
 *           min_area?, features?[], sort?, investment? }
 * كل الحقول اختيارية وتُتحقق عبر validateFilters المشترك. */
const express = require("express");
const { validateFilters } = require("../lib/parser");
const { searchDb, nearMatchesDb } = require("../lib/search");
const { ah } = require("../lib/async");

const router = express.Router();

router.post("/", ah(async (req, res) => {
  const db = req.app.locals.db;
  const f = validateFilters(req.body && req.body.filters ? req.body.filters : req.body);
  if (!f) return res.status(400).json({ ok: false, error: "invalid-filters" });

  const results = (await searchDb(db, f)).slice(0, 12);
  let relaxed = null;
  if (results.length === 0) {
    const nm = await nearMatchesDb(db, f);
    relaxed = { listings: nm.list, notes: nm.notes };
  }
  res.json({ ok: true, filters: f, count: results.length, listings: results, relaxed });
}));

module.exports = router;
