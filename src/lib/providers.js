"use strict";
/* مزودو LLM — كلهم عبر واجهة OpenAI-compatible (chat/completions).
 * المفاتيح تبقى في السيرفر فقط. الفشل يُرمى كخطأ مسمّى ليُختبر. */
const { config } = require("../config");

const PROVIDERS = {
  qwen:     { base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm:      { base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  openai:   { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};

function providerConfig(name) {
  const p = PROVIDERS[name];
  if (!p) return null;
  return {
    name,
    base: config.aiApiBase || p.base,
    model: config.aiModel || p.model,
    key: config.aiApiKey,
  };
}

function isLlmConfigured(name) {
  const c = providerConfig(name);
  return !!(c && c.key);
}

/** محادثة توليدية — تُستعمل فقط مع سياق عقارات حقيقية (grounded) */
async function chat(name, { system, messages, maxTokens = 600, temperature = 0.3 }) {
  const c = providerConfig(name);
  if (!c) throw Object.assign(new Error("unknown-provider"), { provider: name });
  if (!c.key) throw Object.assign(new Error("missing-api-key"), { provider: name });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.aiTimeoutMs);
  try {
    const res = await fetch(c.base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key },
      body: JSON.stringify({
        model: c.model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages.slice(-10)],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw Object.assign(new Error(`provider-http-${res.status}`), { provider: name, detail: body.slice(0, 300) });
    }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text || typeof text !== "string") throw Object.assign(new Error("provider-empty-response"), { provider: name });
    return text.slice(0, 4000);
  } catch (e) {
    if (e.name === "AbortError") throw Object.assign(new Error("provider-timeout"), { provider: name });
    if (e.provider) throw e;
    throw Object.assign(new Error("provider-network"), { provider: name, cause: e.message });
  } finally {
    clearTimeout(timer);
  }
}

function activeProvider() {
  const n = config.aiProvider;
  if (n === "local") return { name: "local", llm: false };
  if (PROVIDERS[n]) return { name: n, llm: isLlmConfigured(n) };
  return { name: "local", llm: false, note: `unknown AI_PROVIDER "${n}" → local` };
}

module.exports = { PROVIDERS, providerConfig, isLlmConfigured, chat, activeProvider };
