"use strict";
/* المحلل الحتمي — مصدر واحد للحقيقة مع الواجهة.
 * نحمّل js/ai-assistant.js مباشرة (يصدّر دواله عند module.exports)
 * حتى لا يحدث أي انحراف بين تحليل المتصفح وتحليل السيرفر. */
const path = require("path");

if (typeof global.LISTINGS === "undefined") global.LISTINGS = [];
if (typeof global.SOUQ_CONFIG === "undefined") global.SOUQ_CONFIG = {};

const FRONTEND_AI = path.join(__dirname, "..", "..", "..", "js", "ai-assistant.js");
let ai = null;
try {
  ai = require(FRONTEND_AI);
} catch (e) {
  throw new Error("تعذر تحميل محلل الواجهة: " + e.message);
}
if (!ai || typeof ai.parseQuery !== "function" || typeof ai.validateFilters !== "function") {
  throw new Error("ملف ai-assistant.js لا يصدّر parseQuery/validateFilters");
}

/** نص حر → فلاتر مُتحقق منها (نفس ما يستعمله المتصفح محلياً) */
function parseText(text) {
  const raw = ai.parseQuery(String(text == null ? "" : text).slice(0, 2000));
  return ai.validateFilters(raw);
}

module.exports = {
  parseText,
  parseQuery: ai.parseQuery,
  validateFilters: ai.validateFilters,
};
