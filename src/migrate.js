"use strict";
/* CLI: تطبيق migrations — npm run migrate */
const { open, runMigrations, closeDb } = require("./db");

async function main() {
  const db = await open();
  try {
    const applied = await runMigrations(db);
    console.log(applied.length ? "طبّقنا: " + applied.join(", ") : "لا جديد — كل migrations مطبقة.");
  } finally {
    await closeDb(db);
  }
}

main().catch((e) => { console.error("MIGRATE FAILED:", e.message); process.exit(1); });
