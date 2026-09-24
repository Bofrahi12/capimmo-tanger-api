"use strict";
/* مساعد مشترك لاختبارات الـbackend: يشغّل التطبيق على قاعدة اختبار
 * جديدة (ملف مؤقت) مع استيراد العقارات، على منفذ عشوائي. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const LISTINGS_FILE = path.join(__dirname, "..", "..", "data", "listings.js");

function clearSrcCache() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(SRC)) delete require.cache[k];
  }
}

async function startApp({ env = {}, seedListings = true } = {}) {
  clearSrcCache();
  Object.assign(process.env, { NODE_ENV: "test" }, env);
  const { buildApp } = require("../src/server");
  const { testDb, closeDb } = require("../src/db");
  const db = await testDb();
  if (seedListings) {
    const runImport = require("../src/import-listings");
    await runImport({ db, fromFile: LISTINGS_FILE });
  }
  const app = await buildApp(db);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, db, app,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      await closeDb(db);
      if (db._testFile) { try { fs.unlinkSync(db._testFile); } catch { /* تجاهل */ } }
    },
  };
}

async function api(base, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* ليس JSON */ }
  return { status: res.status, json, headers: res.headers };
}

module.exports = { startApp, api };
