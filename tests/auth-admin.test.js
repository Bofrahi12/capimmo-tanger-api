"use strict";
/* المصادقة والإدارة: دورة كاملة — إنشاء مدير → دخول → رمز → CRUD محمي */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startApp, api } = require("./helpers");
const { get, run } = require("../src/db");

let app, token;
test("setup + seed admin", async () => {
  app = await startApp({ env: { TOKEN_SECRET: "test-secret-0123456789abcdef-test", RATE_LIMIT_GENERAL: "10000" } });
  const hash = bcrypt.hashSync("S3cret-Password!", 10);
  await run(app.db, "INSERT INTO users (name, phone, password_hash, role) VALUES (?,?,?,?)",
    ["المدير", "0693981822", hash, "admin"]);
});

test("دخول صحيح → رمز", async () => {
  const { status, json } = await api(app.base, "POST", "/api/auth/login", {
    login: "0693981822", password: "S3cret-Password!",
  });
  assert.equal(status, 200);
  assert.ok(json.token.split(".").length === 2);
  assert.equal(json.role, "admin");
  token = json.token;
});

test("GET /api/admin/leads بالرمز", async () => {
  await api(app.base, "POST", "/api/leads", { name: "سعيد", phone: "0712345678" });
  const { status, json } = await api(app.base, "GET", "/api/admin/leads", undefined, {
    Authorization: "Bearer " + token,
  });
  assert.equal(status, 200);
  assert.ok(json.leads.length >= 1);
});

test("PATCH حالة عميل", async () => {
  const lead = await get(app.db, "SELECT id FROM leads ORDER BY id DESC LIMIT 1");
  const { status } = await api(app.base, "PATCH", "/api/admin/leads/" + lead.id, { status: "contacted" }, {
    Authorization: "Bearer " + token,
  });
  assert.equal(status, 200);
  assert.equal((await get(app.db, "SELECT status FROM leads WHERE id = ?", [lead.id])).status, "contacted");
});

test("إضافة عقار (editor+) ثم أرشفة (admin فقط)", async () => {
  const { status, json } = await api(app.base, "POST", "/api/admin/listings", {
    id: "test-manual-1", title: "شقة تجريبية", city: "طنجة", type: "شقة", price: 500000, status: "review",
  }, { Authorization: "Bearer " + token });
  assert.equal(status, 201);
  assert.equal(json.id, "test-manual-1");

  const del = await api(app.base, "DELETE", "/api/admin/listings/test-manual-1", undefined, {
    Authorization: "Bearer " + token,
  });
  assert.equal(del.status, 200);
  assert.equal(del.json.archived, true);
  // الأرشفة تُخفيه عن العام
  const pub = await api(app.base, "GET", "/api/listings/test-manual-1");
  assert.equal(pub.status, 404);
});

test("محرر لا يستطيع الأرشفة (admin فقط)", async () => {
  const hash = bcrypt.hashSync("pw", 10);
  await run(app.db, "INSERT INTO users (name, phone, password_hash, role) VALUES (?,?,?,?)",
    ["محرر", "0600000000", hash, "editor"]);
  const login = await api(app.base, "POST", "/api/auth/login", { login: "0600000000", password: "pw" });
  const etoken = login.json.token;
  const del = await api(app.base, "DELETE", "/api/admin/listings/agency-malabata-studio", undefined, {
    Authorization: "Bearer " + etoken,
  });
  assert.equal(del.status, 403);
  // لكن يستطيع التعديل
  const put = await api(app.base, "PUT", "/api/admin/listings/agency-malabata-studio", { price: 1650000 }, {
    Authorization: "Bearer " + etoken,
  });
  assert.equal(put.status, 200);
});

test("teardown", async () => { await app.stop(); });
