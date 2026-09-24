"use strict";
/* POST /api/ai/parse — نص حر → فلاتر مُتحقق منها (المحلل الحتمي المشترك)
 * POST /api/ai/chat  — محادثة مؤرَّضة: تحليل → بحث DB → رد LLM (إن وُجد)
 *                       مبني فقط على العقارات المطابقة. لا اختراع أبداً. */
const express = require("express");
const { parseText, validateFilters } = require("../lib/parser");
const { searchDb, nearMatchesDb } = require("../lib/search");
const { chat, activeProvider } = require("../lib/providers");
const { hashIp } = require("../lib/tokens");

const router = express.Router();
const MAX_RESULTS = 6;

function summarize(l) {
  return {
    id: l.id, title: l.title, type: l.type, city: l.city,
    neighborhood: l.neighborhood, price: l.price, area: l.area, rooms: l.rooms,
  };
}

function logAi(db, req, intent, f, count, ms) {
  try {
    db.prepare(
      "INSERT INTO ai_logs (provider, intent, city, property_type, result_count, latency_ms, ip_hash) VALUES (?,?,?,?,?,?,?)"
    ).run(
      activeProvider().name, intent || null, (f && f.city) || null,
      (f && f.property_type) || null, count, ms, hashIp(req.ip)
    );
  } catch { /* السجل لا يكسر الرد */ }
}

/* الواجهة الحالية ترسل { text } وتتوقع الفلاتر مباشرة */
router.post("/parse", (req, res) => {
  const t0 = Date.now();
  const text = req.body && typeof req.body.text === "string" ? req.body.text : "";
  if (!text.trim()) return res.status(400).json({ ok: false, error: "text-required" });
  if (text.length > 2000) return res.status(400).json({ ok: false, error: "text-too-long" });
  const f = parseText(text);
  if (!f) return res.status(422).json({ ok: false, error: "parse-failed" });
  logAi(req.app.locals.db, req, f.intent, f, null, Date.now() - t0);
  res.json({ ok: true, provider: "local-deterministic", filters: f });
});

function validHistory(h) {
  if (h === undefined) return [];
  if (!Array.isArray(h)) return null;
  const out = [];
  for (const m of h.slice(-10)) {
    if (!m || typeof m !== "object") return null;
    if (!["user", "assistant"].includes(m.role)) return null;
    if (typeof m.text !== "string" || !m.text.trim() || m.text.length > 2000) return null;
    out.push({ role: m.role, text: m.text.slice(0, 2000) });
  }
  return out;
}

function buildGrounding(listings) {
  if (!listings.length) return "لا توجد عقارات مطابقة في قاعدة البيانات.";
  return listings.map((l, i) =>
    `${i + 1}. [${l.id}] ${l.title} — ${l.price != null ? l.price + " درهم" : "الثمن غير متوفر"} — ${l.city}${l.neighborhood ? "، " + l.neighborhood : ""}${l.area ? "، " + l.area + " م²" : ""}${l.rooms ? "، " + l.rooms + " غرف" : ""}`
  ).join("\n");
}

const SYSTEM_PROMPT = `أنت مساعد «كاب إيمو طنجة» العقاري. تتكلم بلغة المستخدم (الدارجة/العربية/الفصحى/الفرنسية/الإنجليزية).
قواعد صارمة لا تُكسر:
1. أجب فقط بناءً على قائمة العقارات المعطاة أدناه — ممنوع اختراع عقار أو ثمن أو تفاصيل غير مذكورة.
2. إذا كانت القائمة فارغة أو لا يوجد مطابق، قل ذلك بصراحة واقترح تخفيف الشروط.
3. لا تدّع أي توثيق قانوني. لا تصف فرق السعر عن متوسط المدينة كتخفيض من البائع.
4. أذكر أرقام العقارات [id] عند الإشارة إليها. لا تكشف أرقام هواتف البائعين الخاصة.
5. كن مختصراً ومفيداً، واقترح التواصل واتساب مع الوكالة عند الاهتمام.`;

router.post("/chat", async (req, res) => {
  const t0 = Date.now();
  const db = req.app.locals.db;
  const body = req.body || {};
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) return res.status(400).json({ ok: false, error: "message-required" });
  if (message.length > 2000) return res.status(400).json({ ok: false, error: "message-too-long" });
  const history = validHistory(body.history);
  if (history === null) return res.status(400).json({ ok: false, error: "history-invalid" });

  const f = parseText(message);
  if (!f) return res.status(422).json({ ok: false, error: "parse-failed" });

  let listings = [];
  let relaxedNotes = [];
  if (f.intent === "search" || f.intent === "compare") {
    listings = searchDb(db, f).slice(0, MAX_RESULTS);
    if (!listings.length) {
      const nm = nearMatchesDb(db, f);
      listings = nm.list;
      relaxedNotes = nm.notes;
    }
  }

  const ap = activeProvider();
  let reply = null;
  let replyProvider = "local-deterministic";

  if (ap.llm) {
    const grounding = buildGrounding(listings);
    const msgs = history.map((m) => ({ role: m.role, content: m.text }));
    msgs.push({ role: "user", content: message });
    try {
      reply = await chat(ap.name, {
        system: SYSTEM_PROMPT + "\n\nالعقارات المتاحة للرد عليها:\n" + grounding,
        messages: msgs,
      });
      replyProvider = ap.name;
    } catch (e) {
      // فشل المزود → نرجع النتائج الحتمية بدون نص توليدي (لا نكسر التجربة)
      reply = null;
      replyProvider = "local-deterministic";
    }
  }

  logAi(db, req, f.intent, f, listings.length, Date.now() - t0);
  res.json({
    ok: true,
    provider: replyProvider,
    filters: f,
    listings: listings.map(summarize),
    relaxed_notes: relaxedNotes,
    reply, // نص LLM المؤرَّض، أو null عندما provider=local
    grounded: true,
  });
});

module.exports = router;
