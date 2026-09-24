"use strict";
/* SQLite عبر node:sqlite المدمج (بدون اعتماديات native) + مشغّل migrations بسيط. */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { config } = require("./config");

let db = null;

function open(customPath) {
  const dbPath = customPath || config.dbPath;
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const inst = new DatabaseSync(dbPath);
  inst.exec("PRAGMA journal_mode = WAL;");
  inst.exec("PRAGMA foreign_keys = ON;");
  return inst;
}

function runMigrations(inst) {
  inst.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  const applied = new Set(
    inst.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const newly = [];
  for (const f of files) {
    const version = f.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    inst.exec("BEGIN");
    try {
      inst.exec(sql);
      inst.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      inst.exec("COMMIT");
      newly.push(f);
    } catch (e) {
      try { inst.exec("ROLLBACK"); } catch {}
      throw new Error(`migration ${version} failed: ${e.message}`);
    }
  }
  return newly;
}

function getDb(customPath) {
  if (!db) {
    db = open(customPath);
    runMigrations(db);
  }
  return db;
}

/* نسخة اختبارية: قاعدة جديدة في الذاكرة مع migrations */
function testDb() {
  const inst = open(":memory:");
  runMigrations(inst);
  return inst;
}

module.exports = { getDb, testDb, runMigrations, open };
