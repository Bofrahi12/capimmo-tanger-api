"use strict";
/* Cap Immo Tanger — API server
 * Express + SQLite. كل المسارات تحت /api.
 * استراتيجية CSRF: المصادقة عبر Authorization header (لا كوكيز) → لا سطح CSRF.
 */
const express = require("express");
const { config } = require("./config");
const { getDb } = require("./db");
const { createLimiter } = require("./lib/ratelimit");
const { hashIp } = require("./lib/tokens");

function buildApp(dbOverride) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const db = dbOverride || getDb();
  app.locals.db = db;

  // ترويسات أمنية أساسية
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "no-referrer");
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // CORS — مصدر واحد مضبوط من env
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin === config.corsOrigin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.set("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "100kb" }));

  // سجل طلبات خفيف — IP مجزأة (خصوصية)
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on("finish", () => {
      const line = JSON.stringify({
        t: new Date().toISOString(), m: req.method, p: req.path,
        s: res.statusCode, ms: Date.now() - t0, ip: hashIp(req.ip),
      });
      if (config.nodeEnv !== "test") console.log(line);
    });
    next();
  });

  const rl = config.rateLimit;
  const limGeneral = createLimiter({ max: rl.general });
  const limAi = createLimiter({ max: rl.ai });
  const limLeads = createLimiter({ max: rl.leads });
  const limLogin = createLimiter({ max: rl.login });
  app._limiters = { limGeneral, limAi, limLeads, limLogin };

  app.use("/api/", limGeneral);
  app.use("/api/ai/", limAi);
  app.use("/api/auth/", limLogin);
  app.use(["/api/leads", "/api/viewings"], limLeads);

  app.use("/api/health", require("./routes/health"));
  app.use("/api/listings", require("./routes/listings"));
  app.use("/api/search", require("./routes/search"));
  app.use("/api/ai", require("./routes/ai"));
  app.use("/api", require("./routes/leads")); // /api/leads + /api/viewings
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/admin", require("./routes/admin"));

  app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "not-found" }));

  // الجذر: صفحة ترحيب بدل 404 — الرابط الأساسي خاصو يبان خدام
  app.get("/", (req, res) => {
    res.type("html").send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cap Immo Tanger — API</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:8vh auto;padding:0 20px;line-height:1.8;color:#123}a{color:#0a6}code{background:#f2f2f2;padding:2px 8px;border-radius:6px;direction:ltr;display:inline-block}</style></head><body><h1>🏠 Cap Immo Tanger — API</h1><p>الخادم يعمل بنجاح. جرّب:</p><ul><li><a href="/api/health"><code>GET /api/health</code></a> — حالة الخادم وعدد العقارات</li><li><code>GET /api/listings?limit=5</code> — قائمة العقارات</li><li><code>POST /api/ai/parse</code> — تحليل استعلام بالدارجة</li></ul><p>الموقع: <a href="https://bofrahi12.github.io/capimmo-tanger/">كاب إيمو طنجة</a></p></body></html>`);
  });

  // معالج أخطاء — لا تسريب stack في الإنتاج
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === "entity.too.large")
      return res.status(413).json({ ok: false, error: "body-too-large" });
    if (err && err.type === "entity.parse.failed")
      return res.status(400).json({ ok: false, error: "invalid-json" });
    console.error("unhandled:", err && err.message);
    res.status(500).json({ ok: false, error: "internal" });
  });

  return app;
}

function start() {
  const problems = config.nodeEnv === "production" ? require("./config").assertProductionReady() : [];
  if (problems.length) {
    console.error("إعداد الإنتاج ناقص:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  const app = buildApp();
  app.listen(config.port, () => {
    const { activeProvider } = require("./lib/providers");
    console.log(`capimmo-api يعمل على :${config.port} — provider=${activeProvider().name}`);
  });
  return app;
}

if (require.main === module) start();

module.exports = { buildApp, start };
