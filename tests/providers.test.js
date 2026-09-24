"use strict";
/* المزودون: الفشل يُلتقط ويُرجَع للوضع الحتمي — لا كسر أبداً. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { startApp, api } = require("./helpers");

function mockLlm(handler) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })));
}

async function withMocks(fn) {
  const mocks = [];
  const apps = [];
  const mock = async (handler) => { const m = await mockLlm(handler); mocks.push(m); return m; };
  const app = async (env) => { const a = await startApp({ env }); apps.push(a); return a; };
  try {
    await fn({ mock, app });
  } finally {
    for (const a of apps) await a.stop().catch(() => {});
    for (const m of mocks) await m.close().catch(() => {});
  }
}

test("مزود LLM يفشل (500) → fallback حتمي مع نتائج", async () => {
  await withMocks(async ({ mock, app }) => {
    const mk = await mock((req, res) => { res.writeHead(500); res.end("boom"); });
    const a = await app({ AI_PROVIDER: "qwen", AI_API_KEY: "k", AI_API_BASE: mk.url });
    const { status, json } = await api(a.base, "POST", "/api/ai/chat", { message: "شقة فطنجة" });
    assert.equal(status, 200);
    assert.equal(json.reply, null);
    assert.equal(json.provider, "local-deterministic");
    assert.ok(json.listings.length > 0, "النتائج الحتمية يجب أن تبقى");
    for (const l of json.listings) assert.ok(l.city === "طنجة");
  });
});

test("مزود LLM ناجح → reply مؤرَّض", async () => {
  await withMocks(async ({ mock, app }) => {
    const mk = await mock((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const b = JSON.parse(body);
        assert.ok(b.messages[0].content.includes("ممنوع اختراع عقار"));
        assert.ok(b.model);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "وجدت لك عقارين مناسبين في طنجة." } }] }));
      });
    });
    const a = await app({ AI_PROVIDER: "deepseek", AI_API_KEY: "k", AI_API_BASE: mk.url, AI_MODEL: "m" });
    const { status, json } = await api(a.base, "POST", "/api/ai/chat", { message: "شقة فطنجة" });
    assert.equal(status, 200);
    assert.equal(json.provider, "deepseek");
    assert.ok(json.reply.includes("طنجة"));
  });
});

test("مهلة المزود → fallback بدون تعليق", async () => {
  await withMocks(async ({ mock, app }) => {
    const mk = await mock(() => { /* لا يرد أبداً */ });
    const a = await app({ AI_PROVIDER: "glm", AI_API_KEY: "k", AI_API_BASE: mk.url, AI_TIMEOUT_MS: "500" });
    const t0 = Date.now();
    const { status, json } = await api(a.base, "POST", "/api/ai/chat", { message: "شقة فطنجة" });
    assert.equal(status, 200);
    assert.equal(json.reply, null);
    assert.ok(Date.now() - t0 < 10000, "يجب ألا يعلق");
  });
});

test("AI_PROVIDER مجهول → local", async () => {
  await withMocks(async ({ app }) => {
    const a = await app({ AI_PROVIDER: "nope" });
    const { json } = await api(a.base, "GET", "/api/health");
    assert.equal(json.provider, "local");
  });
});
