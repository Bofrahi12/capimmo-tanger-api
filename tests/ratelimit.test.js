"use strict";
/* حد المعدل: التجاوز → 429 مع Retry-After */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, api } = require("./helpers");

test("تجاوز حد /api/ai → 429", async () => {
  const app = await startApp({ env: { RATE_LIMIT_AI: "3", RATE_LIMIT_GENERAL: "1000" } });
  for (let i = 0; i < 3; i++) {
    const r = await api(app.base, "POST", "/api/ai/parse", { text: "شقة فطنجة" });
    assert.equal(r.status, 200);
  }
  const over = await api(app.base, "POST", "/api/ai/parse", { text: "شقة فطنجة" });
  assert.equal(over.status, 429);
  assert.equal(over.json.error, "rate-limited");
  assert.ok(over.headers.get("retry-after"));
  await app.stop();
});

test("حد الدخول منفصل وصارم", async () => {
  const app = await startApp({ env: { RATE_LIMIT_LOGIN: "2", RATE_LIMIT_GENERAL: "1000" } });
  for (let i = 0; i < 2; i++) await api(app.base, "POST", "/api/auth/login", { login: "x", password: "y" });
  const over = await api(app.base, "POST", "/api/auth/login", { login: "x", password: "y" });
  assert.equal(over.status, 429);
  await app.stop();
});
