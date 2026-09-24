"use strict";
/* POST /api/auth/login — دخول الإدارة (هاتف أو بريد + كلمة سر)
 * يُرجع رمز HMAC قصير العمر. حدّ صارم للمحاولات عبر rate limit. */
const express = require("express");
const bcrypt = require("bcryptjs");
const { issueToken } = require("../lib/tokens");

const router = express.Router();

router.post("/login", (req, res) => {
  const db = req.app.locals.db;
  const b = req.body || {};
  const login = typeof b.login === "string" ? b.login.trim().slice(0, 120) : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!login || !password) return res.status(400).json({ ok: false, error: "credentials-required" });

  const user = db.prepare("SELECT * FROM users WHERE phone = ? OR email = ?").get(login, login);
  // مقارنة ثابتة الزمن قدر الإمكان — لا نكشف وجود الحساب
  const hash = user ? user.password_hash : "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinval";
  const ok = bcrypt.compareSync(password, hash);
  if (!user || !ok) return res.status(401).json({ ok: false, error: "invalid-credentials" });

  const token = issueToken(user);
  res.json({ ok: true, token, role: user.role, name: user.name });
});

module.exports = router;
