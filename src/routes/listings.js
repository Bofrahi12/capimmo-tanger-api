"use strict";
/* GET /api/listings — لائحة عامة بفلترة/ترتيب/ترقيم
 * GET /api/listings/:id — تفاصيل عقار واحد
 * نفس أسماء الحقول في data/listings.js (1:1). */
const express = require("express");
const { rowToListing } = require("../lib/search");

const router = express.Router();
const MAX_LIMIT = 50;

function parseListQuery(q) {
  const out = {};
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
  const num = (v) => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  out.city = str(q.city);
  out.type = str(q.type);
  out.min_price = num(q.min_price);
  out.max_price = num(q.max_price);
  out.min_beds = num(q.min_beds);
  out.min_area = num(q.min_area);
  out.status = ["available", "review"].includes(q.status) ? q.status : null;
  out.q = str(q.q);
  out.sort = ["price-asc", "price-desc", "area-desc", "newest"].includes(q.sort) ? q.sort : "newest";
  out.page = Math.max(1, parseInt(q.page, 10) || 1);
  out.limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit, 10) || 20));
  return out;
}

router.get("/", (req, res) => {
  const db = req.app.locals.db;
  const f = parseListQuery(req.query);
  const where = ["status != 'unavailable'"];
  const params = [];
  if (f.status) { where.push("status = ?"); params.push(f.status); }
  if (f.city) { where.push("city = ?"); params.push(f.city); }
  if (f.type) { where.push("type = ?"); params.push(f.type); }
  if (f.min_price !== null) { where.push("price >= ?"); params.push(f.min_price); }
  if (f.max_price !== null) { where.push("price <= ?"); params.push(f.max_price); }
  if (f.min_beds !== null) { where.push("rooms >= ?"); params.push(f.min_beds); }
  if (f.min_area !== null) { where.push("area >= ?"); params.push(f.min_area); }
  if (f.q) { where.push("(title LIKE ? OR description LIKE ? OR neighborhood LIKE ?)"); params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }

  const order = {
    "price-asc": "price ASC NULLS LAST",
    "price-desc": "price DESC",
    "area-desc": "area DESC",
    "newest": "date_verified DESC, date_added DESC",
  }[f.sort];

  const total = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${where.join(" AND ")}`).get(...params).c;
  const rows = db.prepare(
    `SELECT * FROM listings WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...params, f.limit, (f.page - 1) * f.limit);

  res.json({
    ok: true,
    page: f.page,
    limit: f.limit,
    total,
    pages: Math.ceil(total / f.limit),
    listings: rows.map(rowToListing),
  });
});

router.get("/:id", (req, res) => {
  const db = req.app.locals.db;
  const id = String(req.params.id).slice(0, 120);
  const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(id);
  if (!row || row.status === "unavailable") return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true, listing: rowToListing(row) });
});

module.exports = router;
