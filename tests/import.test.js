"use strict";
/* الاستيراد: كل الـIDs تُحفظ كما هي، والتكرار idempotent */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp, api } = require("./helpers");

const LISTINGS_FILE = path.join(__dirname, "..", "..", "data", "listings.js");
function sourceIds() {
  const src = new Function(require("fs").readFileSync(LISTINGS_FILE, "utf8") + "; return LISTINGS;")();
  return src.map((l) => l.id).sort();
}
const EXPECTED = sourceIds().length;

test("الاستيراد يحفظ كل الـIDs دون تغيير", async () => {
  const app = await startApp({ seedListings: false });
  try {
    const runImport = require("../src/import-listings");
    const report = await runImport({ db: app.db, fromFile: LISTINGS_FILE });
    assert.equal(report.total_source, EXPECTED);
    assert.equal(report.inserted, EXPECTED);
    const dbIds = app.db.prepare("SELECT id FROM listings ORDER BY id").all().map((r) => r.id);
    assert.deepEqual(dbIds, sourceIds());
    // إعادة التشغيل idempotent — تحديث لا إدخال
    const report2 = await runImport({ db: app.db, fromFile: LISTINGS_FILE });
    assert.equal(report2.inserted, 0);
    assert.equal(report2.updated, EXPECTED);
  } finally {
    await app.stop();
  }
});

test("عقار الوكالة المحذوف من المصدر يُحفَظ (لا حذف آلي)", async () => {
  const app = await startApp({ seedListings: false });
  try {
    const runImport = require("../src/import-listings");
    await runImport({ db: app.db, fromFile: LISTINGS_FILE });
    // مصدر فقد عقار وكالة + عقار عادي (نبنيه برمجياً بشكل سليم)
    const fs = require("fs");
    const src = new Function(fs.readFileSync(LISTINGS_FILE, "utf8") + "; return LISTINGS;")();
    const agencyId = src.find((l) => l.agency_direct).id;
    const normalId = src.find((l) => !l.agency_direct).id;
    const hacked = src.filter((l) => l.id !== agencyId && l.id !== normalId);
    const hackedFile = "/tmp/listings-hacked.js";
    fs.writeFileSync(hackedFile, "const LISTINGS = " + JSON.stringify(hacked) + ";");
    const report = await runImport({ db: app.db, fromFile: hackedFile });
    assert.equal(report.preserved_agency, 1, "عقار الوكالة يُحفظ");
    assert.equal(report.marked_unavailable, 1, "العقار العادي يُؤرشف");
    const st = app.db.prepare("SELECT status FROM listings WHERE id = ?").get(normalId).status;
    assert.equal(st, "unavailable");
    const ast = app.db.prepare("SELECT status FROM listings WHERE id = ?").get(agencyId).status;
    assert.notEqual(ast, "unavailable", "عقار الوكالة لا يُؤرشف");
    fs.unlinkSync(hackedFile);
  } finally {
    await app.stop();
  }
});
