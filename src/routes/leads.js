"use strict";
/* POST /api/leads    — استقبال عميل محتمل (عام + حماية سبام)
 * POST /api/viewings — طلب معاينة عقار (عام + حماية سبام) */
const express = require("express");
const { run } = require("../db");
const { validateLead, validateViewing } = require("../lib/validate");
const { ah } = require("../lib/async");

const router = express.Router();

router.post("/leads", ah(async (req, res) => {
  const db = req.app.locals.db;
  const v = validateLead(req.body);
  if (!v.ok) return res.status(v.error === "spam" ? 400 : 422).json({ ok: false, error: v.error });
  const L = v.lead;
  const r = await run(
    db,
    "INSERT INTO leads (name, phone, city, budget, preferences, source) VALUES (?,?,?,?,?,?)",
    [L.name, L.phone, L.city, L.budget, JSON.stringify(L.preferences), L.source]
  );
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
}));

router.post("/viewings", ah(async (req, res) => {
  const db = req.app.locals.db;
  const v = await validateViewing(req.body, db);
  if (!v.ok) {
    const code = v.error === "listing-not-found" ? 404 : v.error === "spam" ? 400 : 422;
    return res.status(code).json({ ok: false, error: v.error });
  }
  const V = v.viewing;
  const r = await run(
    db,
    "INSERT INTO viewing_requests (listing_id, name, phone, preferred_date) VALUES (?,?,?,?)",
    [V.listing_id, V.name, V.phone, V.preferred_date]
  );
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
}));

module.exports = router;
