# capimmo-api — Backend كاب إيمو طنجة

API حقيقي (Express + SQLite) للموقع الثابت: العقارات، البحث المرتب،
الذكاء الاصطناعي المؤرَّض، العملاء المحتملون، وإدارة محمية.

## البنية

```
backend/
├── src/
│   ├── server.js          # التجميع: أمان، CORS، حدود، مسارات
│   ├── config.js          # env
│   ├── db.js              # node:sqlite + migrations
│   ├── migrate.js         # npm run migrate
│   ├── seed-admin.js       # npm run seed-admin
│   ├── import-listings.js # npm run import (upsert + حفظ IDs)
│   ├── lib/
│   │   ├── parser.js      # المحلل الحتمي — مُعاد استعماله من js/ai-assistant.js
│   │   ├── search.js      # بحث/ترتيب بنفس منطق الواجهة + تحويل الصفوف
│   │   ├── providers.js   # qwen / deepseek / glm / openai / local
│   │   ├── validate.js    # تحقق المدخلات
│   │   ├── ratelimit.js   # حد المعدل (ذاكرة)
│   │   └── tokens.js      # رموز HMAC للإدارة + تجزئة IP
│   └── routes/
│       ├── health.js      # GET /api/health
│       ├── listings.js    # GET /api/listings, GET /api/listings/:id
│       ├── search.js      # POST /api/search
│       ├── ai.js          # POST /api/ai/parse, POST /api/ai/chat
│       ├── leads.js       # POST /api/leads, POST /api/viewings
│       ├── auth.js        # POST /api/auth/login
│       └── admin.js       # مسارات محمية (leads/viewings/listings/sync)
├── migrations/001_init.sql
└── tests/                 # npm test
```

## التشغيل محلياً

```bash
cd backend
npm install
cp .env.example .env   # ثم اضبط TOKEN_SECRET و ADMIN_PASSWORD
npm run migrate        # الجداول
npm run import         # يجلب العقارات من الموقع الحي (أو --from-file ../data/listings.js)
npm run seed-admin     # المدير الأول
npm start              # :3100
npm test               # كل الاختبارات
```

## الـ Endpoints

| المسار | الوصف | الحماية |
|---|---|---|
| `GET /api/health` | الحالة + عدد العقارات + المزود | عام |
| `GET /api/listings` | فلترة/ترتيب/ترقيم | عام |
| `GET /api/listings/:id` | تفاصيل عقار | عام |
| `POST /api/search` | بحث مرتب بنفس منطق الواجهة | عام + حد |
| `POST /api/ai/parse` | نص حر → فلاتر (حتمي) | عام + حد 30/د |
| `POST /api/ai/chat` | محادثة مؤرَّضة على نتائج DB | عام + حد 30/د |
| `POST /api/leads` | عميل محتمل | عام + honeypot + حد |
| `POST /api/viewings` | طلب معاينة | عام + حد |
| `POST /api/auth/login` | دخول الإدارة → رمز | حد 10/د |
| `GET/PATCH /api/admin/leads` | متابعة العملاء | 🔒 رمز |
| `GET/PATCH /api/admin/viewings` | طلبات المعاينة | 🔒 رمز |
| `POST/PUT /api/admin/listings` | إضافة/تعديل عقار | 🔒 محرر+ |
| `DELETE /api/admin/listings/:id` | أرشفة (لا حذف نهائي) | 🔒 مدير |
| `POST /api/admin/sync` | مزامنة العقارات من الموقع الحي | 🔒 مدير |

## الذكاء الاصطناعي المؤرَّض

1. `POST /api/ai/chat` يحلل الرسالة بالمحلل الحتمي **المشترك مع الواجهة**
   (`js/ai-assistant.js` يُحمَّل مباشرة — لا انحراف).
2. يبحث في SQLite بنفس `searchListings` (ترتيب/بدائل معلنة).
3. إن كان `AI_PROVIDER` مهيأً بمفتاح (qwen/deepseek/glm/openai):
   يطلب من الـLLM صياغة الرد **مع سياق = العقارات المطابقة فقط**
   وتعليمات صارمة ضد الاختراع.
4. إن فشل المزود (أو لم يُهيأ): يرجع النتائج الحتمية + `reply: null`
   — لا ينكسر أبداً، والواجهة تعرض البطاقات الحقيقية.

## الأمان

- CORS لمصدر واحد من env. ترويسات `nosniff/DENY/no-referrer`.
- حد المعدل لكل IP (عام/ذكاء/عملاء/دخول منفصلة) → `429` مع `Retry-After`.
- كلمات السر بـ bcrypt. الرموز HMAC-SHA256 (12 ساعة).
- المصادقة عبر `Authorization: Bearer` — لا كوكيز → **لا سطح CSRF**.
- التحقق من كل المدخلات؛ الهاتف مغربي `^0[67]\d{8}$`؛ حد 100kb للجسم.
- السجلات بدون نص الرسائل؛ الـIP مجزأة بـ SHA256.
- عقارات `agency_direct` محمية من الأرشفة الآلية عند الاستيراد.

## النشر (الإنتاج)

الواجهة على GitHub Pages (ثابت) — الـbackend يحتاج استضافة Node:

**الأسهل — Render.com (مجاني):**
1. ارفع مجلد `backend/` إلى repo خاص (بدون `.env`).
2. في Render: New → Web Service → Build: `npm install` → Start: `npm start`.
3. متغيرات البيئة: `PORT` (تلقائي)، `TOKEN_SECRET`، `ADMIN_PASSWORD`،
   `CORS_ORIGIN=https://bofrahi12.github.io`، `AI_PROVIDER` + `AI_API_KEY` (اختياري).
4. بعد أول إقلاع: شغّل `npm run migrate && npm run import && npm run seed-admin`
   عبر Render Shell مرة واحدة.
5. ضع رابط الـAPI في `window.SOUQ_AI_CONFIG.endpoint` في `index.html` و`listing.html`
   وأعد توليد الصفحات والنشر.

**أو VPS خاص:** `Dockerfile` موجود — `docker build -t capimmo-api .` ثم شغّله
خلف Caddy/Nginx مع HTTPS. قاعدة SQLite في volume دائم (`./data`).

بعد النشر، الكرون اليومي يستدعي `POST /api/admin/sync` (برمز المدير)
لمزامنة العقارات بعد كل تحديث للموقع.
