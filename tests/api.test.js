"use strict";
/* اختبارات API الأساسية: health, listings, search, ai/parse, leads, viewings */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp, api } = require("./helpers");

const LISTINGS_FILE = path.join(__dirname, "..", "..", "data", "listings.js");
const EXPECTED = new Function(require("fs").readFileSync(LISTINGS_FILE, "utf8") + "; return LISTINGS;")().length;

let app;
test("setup", async () => { app = await startApp(); });

test("GET /api/health يعمل ويُظهر المزود وعدد العقارات", async () => {
  const { status, json } = await api(app.base, "GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.service, "capimmo-api");
  assert.equal(json.listings_available, EXPECTED);
  assert.equal(json.provider, "local");
});

test("GET /api/listings ترقيم وفلترة", async () => {
  const { status, json } = await api(app.base, "GET", "/api/listings?limit=5&page=1");
  assert.equal(status, 200);
  assert.equal(json.total, EXPECTED);
  assert.equal(json.listings.length, 5);
  assert.equal(json.pages, Math.ceil(EXPECTED / 5));
  const tangier = await api(app.base, "GET", "/api/listings?city=" + encodeURIComponent("طنجة") + "&limit=50");
  assert.ok(tangier.json.total > 20);
  assert.ok(tangier.json.listings.every((l) => l.city === "طنجة"));
});

test("GET /api/listings/:id — موجود وغير موجود", async () => {
  const { status, json } = await api(app.base, "GET", "/api/listings/agency-malabata-studio");
  assert.equal(status, 200);
  assert.equal(json.listing.id, "agency-malabata-studio");
  assert.equal(json.listing.price, 1650000);
  assert.deepEqual(json.listing.photos.length, 9);
  const nf = await api(app.base, "GET", "/api/listings/no-such-id");
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error, "not-found");
});

test("POST /api/search بنفس منطق الواجهة", async () => {
  const { status, json } = await api(app.base, "POST", "/api/search", {
    filters: { city: "طنجة", property_type: "شقة", max_price: 1500000, min_beds: 3 },
  });
  assert.equal(status, 200);
  assert.ok(json.count > 0);
  assert.ok(json.listings.every((l) => l.city === "طنجة" && (l.price == null || l.price <= 1500000)));
});

test("POST /api/search فلاتر غير صالحة تُرفض", async () => {
  const { status } = await api(app.base, "POST", "/api/search", { filters: "not-an-object" });
  assert.equal(status, 400);
});

test("POST /api/ai/parse — مثال القبول", async () => {
  const { status, json } = await api(app.base, "POST", "/api/ai/parse", {
    text: "بغيت شقة فطنجة، 3 غرف، قريبة للبحر، وما تفوتش مليون ونص",
  });
  assert.equal(status, 200);
  assert.equal(json.filters.city, "طنجة");
  assert.equal(json.filters.property_type, "شقة");
  assert.equal(json.filters.max_price, 1500000);
  assert.equal(json.filters.min_beds, 3);
  assert.ok(json.filters.features.includes("sea"));
});

test("POST /api/ai/parse — نص فارغ/طويل يُرفض", async () => {
  assert.equal((await api(app.base, "POST", "/api/ai/parse", { text: "  " })).status, 400);
  assert.equal((await api(app.base, "POST", "/api/ai/parse", { text: "x".repeat(2001) })).status, 400);
});

test("POST /api/leads — إنشاء وتحقق", async () => {
  const { status, json } = await api(app.base, "POST", "/api/leads", {
    name: "أحمد", phone: "0612345678", city: "طنجة", budget: 1500000, source: "ai",
  });
  assert.equal(status, 201);
  assert.ok(json.id > 0);
  const row = app.db.prepare("SELECT * FROM leads WHERE id = ?").get(json.id);
  assert.equal(row.name, "أحمد");
  assert.equal(row.phone, "0612345678");
  assert.equal(row.source, "ai");
});

test("POST /api/leads — هاتف غير مغربي يُرفض", async () => {
  const { status, json } = await api(app.base, "POST", "/api/leads", { name: "x", phone: "12345" });
  assert.equal(status, 422);
  assert.equal(json.error, "phone-invalid");
});

test("POST /api/leads — honeypot يصطاد السبام", async () => {
  const { status, json } = await api(app.base, "POST", "/api/leads", {
    name: "spam", phone: "0612345678", website: "http://spam.example",
  });
  assert.equal(json.error, "spam");
  assert.equal(status, 400);
});

test("POST /api/viewings — طلب معاينة صالح", async () => {
  const { status, json } = await api(app.base, "POST", "/api/viewings", {
    listing_id: "agency-malabata-studio", name: "فاطمة", phone: "+212712345678",
  });
  assert.equal(status, 201);
  assert.ok(json.id > 0);
});

test("POST /api/viewings — عقار غير موجود → 404", async () => {
  const { status } = await api(app.base, "POST", "/api/viewings", {
    listing_id: "ghost", name: "x", phone: "0612345678",
  });
  assert.equal(status, 404);
});

test("teardown", async () => { await app.stop(); });
