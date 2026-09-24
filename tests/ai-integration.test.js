"use strict";
/* تكامل الذكاء الاصطناعي: تحليل → بحث DB → رد مؤرَّض.
 * القاعدة الذهبية: لا عقار في الرد إلا وهو في قاعدة البيانات. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp, api } = require("./helpers");

const LISTINGS_FILE = path.join(__dirname, "..", "..", "data", "listings.js");
const EXPECTED = new Function(require("fs").readFileSync(LISTINGS_FILE, "utf8") + "; return LISTINGS;")().length;

let app;
let dbIds;
test("setup", async () => {
  app = await startApp();
  dbIds = new Set(app.db.prepare("SELECT id FROM listings").all().map((r) => r.id));
  assert.equal(dbIds.size, EXPECTED);
});

test("chat: مثال القبول الكامل — نتائج حقيقية فقط", async () => {
  const { status, json } = await api(app.base, "POST", "/api/ai/chat", {
    message: "بغيت شقة فطنجة، 3 غرف، قريبة للبحر، وما تفوتش مليون ونص",
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.grounded, true);
  assert.equal(json.filters.city, "طنجة");
  assert.equal(json.filters.max_price, 1500000);
  for (const l of json.listings) {
    assert.ok(dbIds.has(l.id), "عقار مخترع في الرد: " + l.id);
    assert.ok(l.price == null || l.price <= 1500000);
  }
});

test("chat: بدون مزود LLM — reply null والنتائج حتمية", async () => {
  const { status, json } = await api(app.base, "POST", "/api/ai/chat", {
    message: "villa à Tanger",
  });
  assert.equal(status, 200);
  assert.equal(json.reply, null);
  assert.equal(json.provider, "local-deterministic");
  assert.ok(Array.isArray(json.listings));
});

test("chat: استعلام بلا نتائج — بدائل معلنة أو فراغ صريح", async () => {
  const { status, json } = await api(app.base, "POST", "/api/ai/chat", {
    message: "بغيت قصر فطنجة بمليار درهم",
  });
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.listings));
  for (const l of json.listings) assert.ok(dbIds.has(l.id));
  assert.ok(Array.isArray(json.relaxed_notes));
});

test("chat: history غير صالح يُرفض", async () => {
  const { status } = await api(app.base, "POST", "/api/ai/chat", {
    message: "سلام", history: [{ role: "hacker", text: "x" }],
  });
  assert.equal(status, 400);
});

test("chat: رسالة طويلة تُرفض", async () => {
  const { status } = await api(app.base, "POST", "/api/ai/chat", { message: "x".repeat(2001) });
  assert.equal(status, 400);
});

test("سجل ai_logs يُكتب بدون نص الرسائل", async () => {
  await api(app.base, "POST", "/api/ai/chat", { message: "شقة فطنجة" });
  const log = app.db.prepare("SELECT * FROM ai_logs ORDER BY id DESC LIMIT 1").get();
  assert.ok(log);
  assert.equal(log.provider, "local");
  const cols = Object.keys(log).join(",");
  assert.ok(!cols.includes("message") && !cols.includes("text"));
});

test("teardown", async () => { await app.stop(); });
