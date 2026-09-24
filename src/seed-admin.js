"use strict";
/* CLI: إنشاء المدير الأول من env — npm run seed-admin
 * ADMIN_PHONE/ADMIN_EMAIL + ADMIN_PASSWORD (الأخير إلزامي وقوي). */
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");
const { config } = require("./config");

const pwd = config.adminPassword;
if (!pwd || pwd.length < 10 || pwd === "change-me-immediately") {
  console.error("ضع ADMIN_PASSWORD قوية (≥10 أحرف) في .env أولاً.");
  process.exit(1);
}
const login = config.adminPhone || config.adminEmail;
if (!login) { console.error("ضع ADMIN_PHONE أو ADMIN_EMAIL في .env."); process.exit(1); }

const db = getDb();
const exists = db.prepare("SELECT id FROM users WHERE phone = ? OR email = ?").get(config.adminPhone || null, config.adminEmail || null);
if (exists) { console.log("مدير موجود مسبقاً — لم ننشئ جديداً."); process.exit(0); }

const hash = bcrypt.hashSync(pwd, 10);
db.prepare("INSERT INTO users (name, phone, email, password_hash, role) VALUES (?,?,?,?,?)")
  .run("مدير الوكالة", config.adminPhone || null, config.adminEmail || null, hash, "admin");
console.log("تم إنشاء المدير بنجاح. غيّر كلمة السر بعد أول دخول.");
