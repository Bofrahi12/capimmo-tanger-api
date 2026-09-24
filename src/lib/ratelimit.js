"use strict";
/* حد المعدل: نافذة منزلقة في الذاكرة (لكل IP + لكل مجموعة مسارات).
 * بسيط وقابل للاختبار؛ لعدة نسخ من السيرفر يُستبدل بـ Redis. */
function createLimiter({ windowMs = 60000, max = 60 } = {}) {
  const hits = new Map(); // key -> number[]
  function middleware(req, res, next) {
    const key = (req.ip || "unknown") + ":" + (req.baseUrl || "") + (req.path || "");
    const now = Date.now();
    let arr = hits.get(key);
    if (!arr) { arr = []; hits.set(key, arr); }
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    if (arr.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ ok: false, error: "rate-limited", retry_after_s: Math.ceil(windowMs / 1000) });
    }
    arr.push(now);
    next();
  }
  middleware._reset = () => hits.clear();
  middleware._size = () => hits.size;
  return middleware;
}

module.exports = { createLimiter };
