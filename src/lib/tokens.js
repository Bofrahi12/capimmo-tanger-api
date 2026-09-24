"use strict";
/* رموز إدارة موقعة بـ HMAC-SHA256 (بدون مكتبات خارجية).
 * الصيغة: base64url(payload).base64url(signature) — صلاحية 12 ساعة. */
const crypto = require("crypto");
const { config } = require("../config");

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function sign(payload) {
  if (!config.tokenSecret) throw new Error("TOKEN_SECRET غير مضبوط");
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac("sha256", config.tokenSecret).update(body).digest());
  return body + "." + sig;
}

function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: user.id, role: user.role, iat: now, exp: now + 12 * 3600 });
}

function verifyToken(token) {
  try {
    if (!config.tokenSecret || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = b64u(crypto.createHmac("sha256", config.tokenSecret).update(body).digest());
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(unb64u(body).toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* تجزئة IP للسجلات — خصوصية: لا نخزن IP خام */
function hashIp(ip) {
  const salt = config.tokenSecret || "capimmo";
  return crypto.createHash("sha256").update(salt + "|" + String(ip || "")).digest("hex").slice(0, 16);
}

module.exports = { issueToken, verifyToken, hashIp };
