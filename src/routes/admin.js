"use strict";
/* مسارات الإدارة — كلها خلف requireAuth.
 * GET    /api/admin/leads            — لائحة العملاء
 * PATCH  /api/admin/leads/:id        — تحديث حالة عميل
 * GET    /api/admin/viewings         — طلبات المعاينة
 * PATCH  /api/admin/viewings/:id     — تحديث حالة معاينة
 * GET    /api/admin/ai-logs          — سجلات الذكاء (بدون نص الرسائل)
 * POST   /api/admin/listings         — إضافة عقار (admin/editor)
 * PUT    /api/admin/listings/:id     — تعديل عقار (admin/editor)
 * DELETE /api/admin/listings/:id     — أرشفة عقار (admin فقط)
 * POST   /api/admin/sync             — مزامنة العقارات من المصدر الحي (admin) */
const express = require("express");
const { all, get, run } = require("../db");
const { verifyToken } = require("../lib/tokens");
const { validateListingInput, LEAD_STATUS } = require("../lib/validate");
const { listingToRow, rowToListing } = require("../lib/search");
const { ah } = require("../lib/async");

const router = express.Router();

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ ok: false, error: "unauthorized" });
  req.user = payload;
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== "admin")
      return res.status(403).json({ ok: false, error: "forbidden" });
    next();
  };
}

router.use(requireAuth);

router.get("/leads", ah(async (req, res) => {
  const db = req.app.locals.db;
  const status = LEAD_STATUS.includes(req.query.status) ? req.query.status : null;
  const rows = status
    ? await all(db, "SELECT * FROM leads WHERE status = ? ORDER BY id DESC LIMIT 200", [status])
    : await all(db, "SELECT * FROM leads ORDER BY id DESC LIMIT 200");
  res.json({ ok: true, leads: rows.map((r) => ({ ...r, preferences: JSON.parse(r.preferences || "{}") })) });
}));

router.patch("/leads/:id", ah(async (req, res) => {
  const db = req.app.locals.db;
  const status = req.body && req.body.status;
  if (!LEAD_STATUS.includes(status)) return res.status(422).json({ ok: false, error: "status-invalid" });
  const r = await run(db, "UPDATE leads SET status = ? WHERE id = ?", [status, req.params.id]);
  if (!r.changes) return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true });
}));

router.get("/viewings", ah(async (req, res) => {
  const db = req.app.locals.db;
  const rows = await all(db, "SELECT * FROM viewing_requests ORDER BY id DESC LIMIT 200");
  res.json({ ok: true, viewings: rows });
}));

router.patch("/viewings/:id", ah(async (req, res) => {
  const db = req.app.locals.db;
  const status = req.body && req.body.status;
  if (!["new", "contacted", "scheduled", "done", "cancelled"].includes(status))
    return res.status(422).json({ ok: false, error: "status-invalid" });
  const r = await run(db, "UPDATE viewing_requests SET status = ? WHERE id = ?", [status, req.params.id]);
  if (!r.changes) return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true });
}));

router.get("/ai-logs", ah(async (req, res) => {
  const db = req.app.locals.db;
  const rows = await all(db, "SELECT * FROM ai_logs ORDER BY id DESC LIMIT 200");
  res.json({ ok: true, logs: rows });
}));

router.post("/listings", requireRole("editor"), ah(async (req, res) => {
  const db = req.app.locals.db;
  const v = validateListingInput(req.body, false);
  if (!v.ok) return res.status(422).json({ ok: false, error: v.error });
  const id = typeof req.body.id === "string" && req.body.id.trim()
    ? req.body.id.trim().slice(0, 120)
    : "manual-" + Date.now().toString(36);
  const exists = await get(db, "SELECT 1 FROM listings WHERE id = ?", [id]);
  if (exists) return res.status(409).json({ ok: false, error: "id-exists" });
  const row = listingToRow({ id, status: "review", ...v.listing });
  const cols = Object.keys(row);
  await run(
    db,
    `INSERT INTO listings (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    cols.map((c) => row[c])
  );
  res.status(201).json({ ok: true, id });
}));

router.put("/listings/:id", requireRole("editor"), ah(async (req, res) => {
  const db = req.app.locals.db;
  const v = validateListingInput(req.body, true);
  if (!v.ok) return res.status(422).json({ ok: false, error: v.error });
  const row = listingToRow(v.listing);
  const cols = Object.keys(row);
  if (!cols.length) return res.status(422).json({ ok: false, error: "nothing-to-update" });
  const r = await run(
    db,
    `UPDATE listings SET ${cols.map((c) => c + " = ?").join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    [...cols.map((c) => row[c]), req.params.id]
  );
  if (!r.changes) return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true });
}));

/* الأرشفة فقط — لا حذف نهائي من API (حماية مخزون الوكالة) */
router.delete("/listings/:id", requireRole("admin"), ah(async (req, res) => {
  const db = req.app.locals.db;
  const r = await run(db, "UPDATE listings SET status = 'unavailable', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  if (!r.changes) return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true, archived: true });
}));

router.get("/listings/:id", ah(async (req, res) => {
  const db = req.app.locals.db;
  const row = await get(db, "SELECT * FROM listings WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ ok: false, error: "not-found" });
  res.json({ ok: true, listing: rowToListing(row) });
}));

router.post("/sync", requireRole("admin"), (req, res) => {
  const runImport = require("../import-listings");
  runImport({ db: req.app.locals.db })
    .then((report) => res.json({ ok: true, sync: report }))
    .catch((e) => res.status(500).json({ ok: false, error: "sync-failed", detail: e.message }));
});

module.exports = router;
