"use strict";
/* إعداد مركزي من متغيرات البيئة — مع قيم افتراضية آمنة.
 * لا أسرار هنا: الأسرار تُقرأ من process.env فقط. */
const path = require("path");

function str(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}
function num(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

const ROOT = path.resolve(__dirname, "..", "..");

const config = {
  port: num("PORT", 3100),
  dbPath: str("DATABASE_PATH", path.join(__dirname, "..", "data", "capimmo.db")),
  aiProvider: str("AI_PROVIDER", "local").toLowerCase(),
  aiApiKey: str("AI_API_KEY", ""),
  aiApiBase: str("AI_API_BASE", ""),
  aiModel: str("AI_MODEL", ""),
  aiTimeoutMs: num("AI_TIMEOUT_MS", 25000),
  corsOrigin: str("CORS_ORIGIN", "https://bofrahi12.github.io"),
  tokenSecret: str("TOKEN_SECRET", ""),
  adminPhone: str("ADMIN_PHONE", ""),
  adminEmail: str("ADMIN_EMAIL", ""),
  adminPassword: str("ADMIN_PASSWORD", ""),
  agencyPhone: str("AGENCY_PHONE", "0693981822"),
  rateLimit: {
    general: num("RATE_LIMIT_GENERAL", 120),
    ai: num("RATE_LIMIT_AI", 30),
    leads: num("RATE_LIMIT_LEADS", 20),
    login: num("RATE_LIMIT_LOGIN", 10),
  },
  // المصدر الحي لملف العقارات (يستعمله الاستيراد)
  listingsSourceUrl: str(
    "LISTINGS_SOURCE_URL",
    "https://bofrahi12.github.io/capimmo-tanger/data/listings.js"
  ),
  projectRoot: ROOT,
  nodeEnv: str("NODE_ENV", "development"),
};

function assertProductionReady() {
  const problems = [];
  if (!config.tokenSecret || config.tokenSecret.length < 32)
    problems.push("TOKEN_SECRET غير مضبوط أو قصير (≥32 حرفاً)");
  return problems;
}

module.exports = { config, assertProductionReady };
