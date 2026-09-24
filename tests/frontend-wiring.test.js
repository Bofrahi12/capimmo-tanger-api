"use strict";
/* ربط الواجهة: مزود http في ai-assistant.js يتكلم مع /api/ai/parse الحقيقي،
 * وعند تعطل الـbackend يسقط على التحليل المحلي (نفس سلوك المتصفح). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp } = require("./helpers");

const AI_FILE = path.join(__dirname, "..", "..", "js", "ai-assistant.js");

function loadFrontend(cfg) {
  for (const k of Object.keys(require.cache)) if (k === AI_FILE) delete require.cache[k];
  global.window = { SOUQ_AI_CONFIG: cfg };
  const ai = require(AI_FILE);
  delete global.window;
  return ai;
}

test("http provider: نفس الفلاتر عبر الـbackend", async () => {
  const app = await startApp();
  try {
    const ai = loadFrontend({ provider: "http", endpoint: app.base + "/api/ai/parse", timeoutMs: 8000 });
    assert.equal(ai.providerName(), "http");
    const f = await ai.providerParse("بغيت شقة فطنجة، 3 غرف، قريبة للبحر، وما تفوتش مليون ونص");
    assert.equal(f.city, "طنجة");
    assert.equal(f.property_type, "شقة");
    assert.equal(f.max_price, 1500000);
    assert.equal(f.min_beds, 3);
  } finally {
    await app.stop();
  }
});

test("http provider: الـbackend معطّل → رفض، والمحلي ينقذ الموقف", async () => {
  const ai = loadFrontend({ provider: "http", endpoint: "http://127.0.0.1:9/api/ai/parse", timeoutMs: 1500 });
  let failed = false;
  try { await ai.providerParse("بغيت شقة فطنجة"); } catch { failed = true; }
  assert.equal(failed, true, "يجب أن يرفض عند تعطل الـbackend");
  // نفس ما يفعله المتصفح في .catch: التحليل المحلي
  const f = ai.parseQuery("بغيت شقة فطنجة");
  assert.equal(f.city, "طنجة");
});

test("local provider: بدون endpoint يبقى محلياً", async () => {
  const ai = loadFrontend({ provider: "local", endpoint: "" });
  assert.equal(ai.providerName(), "local");
  const f = await ai.providerParse("appartement à Tanger 600000");
  assert.equal(f.city, "طنجة");
});
