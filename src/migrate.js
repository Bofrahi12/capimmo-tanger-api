"use strict";
/* CLI: تطبيق migrations — npm run migrate */
const { open, runMigrations } = require("./db");
const { config } = require("./config");

const db = open(config.dbPath);
const applied = runMigrations(db);
console.log(applied.length ? "طبّقنا: " + applied.join(", ") : "لا جديد — كل migrations مطبقة.");
db.close();
