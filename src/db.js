"use strict";
/* قاعدة البيانات عبر @libsql/client (غير متزامن).
 * - محلياً: DATABASE_URL=file:/abs/path.db (افتراضي: data/capimmo.db)
 * - عن بُعد (Turso): DATABASE_URL=libsql://... + DATABASE_AUTH_TOKEN
 * - DATABASE_PATH القديم ما زال يُقبل كبديل (يُحوَّل إلى file:).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createClient } = require("@libsql/client");
const { config } = require("./config");

function isRemoteUrl(url) {
  return /^(libsql|https?):\/\//i.test(url);
}

function filePathOf(url) {
  // "file:/abs/x.db" | "file:rel/x.db" → مسار نظام ملفات مطلق
  // المسارات النسبية تُفسَّر بالنسبة لمجلد الـbackend
  let p = url.replace(/^file:/i, "");
  if (!path.isAbsolute(p)) p = path.resolve(__dirname, "..", p);
  return p;
}

async function open(customUrl) {
  const url = customUrl || config.dbUrl;
  const clientConfig = { url };
  if (config.dbAuthToken) clientConfig.authToken = config.dbAuthToken;
  if (!isRemoteUrl(url)) {
    const fp = filePathOf(url);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    // وحّد الـURL على المسار المطلق حتى لا تتعدد الملفات
    clientConfig.url = "file:" + fp;
  }
  const db = createClient(clientConfig);
  try {
    await db.execute("PRAGMA foreign_keys = ON");
  } catch { /* بعض البيئات البعيدة لا تدعم PRAGMA — تجاهل */ }
  try {
    await db.execute("PRAGMA busy_timeout = 5000");
  } catch { /* تجاهل */ }
  return db;
}

/** SELECT متعدد الصفوف → مصفوفة كائنات */
async function all(db, sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return r.rows;
}

/** SELECT صف واحد → كائن أو undefined */
async function get(db, sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return r.rows[0];
}

/** INSERT/UPDATE/DELETE → { changes, lastInsertRowid } (أرقام آمنة لـJSON) */
async function run(db, sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return {
    changes: Number(r.rowsAffected || 0),
    lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid),
  };
}

async function closeDb(db) {
  if (db) await db.close();
}

async function runMigrations(db) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  const rows = await all(db, "SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const newly = [];
  for (const f of files) {
    const version = f.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const tx = await db.transaction("write");
    try {
      await tx.executeMultiple(sql);
      await tx.execute({ sql: "INSERT INTO schema_migrations (version) VALUES (?)", args: [version] });
      await tx.commit();
      newly.push(f);
    } catch (e) {
      try { await tx.rollback(); } catch { /* تجاهل */ }
      throw new Error(`migration ${version} failed: ${e.message}`);
    }
  }
  return newly;
}

let _db = null;
async function getDb(customUrl) {
  if (!_db) {
    _db = await open(customUrl);
    await runMigrations(_db);
  }
  return _db;
}

let _testCounter = 0;
/* نسخة اختبارية: قاعدة ملف مؤقت جديد مع migrations */
async function testDb() {
  const file = path.join(os.tmpdir(), `capimmo-test-${process.pid}-${Date.now()}-${_testCounter++}.db`);
  const inst = await open("file:" + file);
  await runMigrations(inst);
  inst._testFile = file;
  return inst;
}

module.exports = { open, getDb, testDb, runMigrations, closeDb, all, get, run };
