"use strict";
/* الأمان: حقن، XSS، مصادقة، حدود الجسم */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, api } = require("./helpers");

let app;
test("setup", async () => { app = await startApp({ env: { RATE_LIMIT_GENERAL: "10000" } }); });

test("حقن SQL في فلتر المدينة — يُعامل كنص حرفي", async () => {
  const { status, json } = await api(app.base, "GET", "/api/listings?city=" + encodeURIComponent("' OR 1=1 --"));
  assert.equal(status, 200);
  assert.equal(json.total, 0, "لا يجب أن يسرّب أي صف");
});

test("XSS في اسم العميل — يُخزَّن كنص خام مقطوع (JSON لا يُنفَّذ)", async () => {
  const evil = "<script>alert(1)</script>".repeat(20);
  const { status, json } = await api(app.base, "POST", "/api/leads", { name: evil, phone: "0612345678" });
  assert.equal(status, 201);
  const row = app.db.prepare("SELECT name FROM leads WHERE id = ?").get(json.id);
  assert.ok(row.name.length <= 120, "الطول مقطوع");
  assert.equal(row.name, evil.slice(0, 120), "يُخزَّن حرفياً دون تحويل");
});

test("مسارات الإدارة بدون رمز → 401", async () => {
  for (const [m, p, b] of [["GET", "/api/admin/leads", undefined], ["POST", "/api/admin/listings", {}], ["DELETE", "/api/admin/listings/x", undefined]]) {
    const r = await api(app.base, m, p, b);
    assert.equal(r.status, 401, p);
  }
});

test("رمز مزيّف → 401", async () => {
  const r = await api(app.base, "GET", "/api/admin/leads", undefined, { Authorization: "Bearer fake.token.here" });
  assert.equal(r.status, 401);
});

test("دخول بكلمة سر خاطئة → 401 دون كشف", async () => {
  const r = await api(app.base, "POST", "/api/auth/login", { login: "0693981822", password: "wrong" });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, "invalid-credentials");
});

test("JSON غير صالح → 400", async () => {
  const res = await fetch(app.base + "/api/leads", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad json",
  });
  assert.equal(res.status, 400);
});

test("جسم ضخم → 413", async () => {
  const res = await fetch(app.base + "/api/ai/parse", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(200 * 1024) }),
  });
  assert.equal(res.status, 413);
});

test("ترويسات أمنية حاضرة", async () => {
  const res = await fetch(app.base + "/api/health");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("teardown", async () => { await app.stop(); });
