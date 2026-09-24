/* ============================================================
 * كاب إيمو طنجة — المساعد الذكي (M3ak AI)
 * ------------------------------------------------------------
 * طبقة AI تعمل داخل المتصفح (progressive enhancement):
 *  - تحويل النص الطبيعي (دارجة/عربية/فرنسية/إنجليزية) إلى
 *    filters منظمة — ثم البحث في بيانات LISTINGS الحقيقية فقط.
 *  - ممنوع الاختراع بالبناء: لا يوجد توليد حر للنصوص حول
 *    العقارات؛ كل نتيجة مرتبطة بـ property ID حقيقي.
 *  - لا مفاتيح API في الواجهة. لا اتصالات شبكة إطلاقاً.
 *  - واجهة AIProvider جاهزة لربط مزوّد LLM عبر backend مستقبلاً.
 *
 * يعتمد على: data/listings.js (SOUQ_CONFIG + LISTINGS)
 * لا يعتمد على app.js — يعمل حتى لو تعطّل أي سكريبت آخر.
 * ============================================================ */
(function () {
  "use strict";

  /* ============ 0. الإعداد وواجهة المزوّد ============ */
  var AI_CONFIG = Object.assign(
    { provider: "local", endpoint: "", timeoutMs: 10000, maxResults: 6 },
    (typeof window !== "undefined" && window.SOUQ_AI_CONFIG) || {}
  );

  /* ============ 1. أدوات ============ */
  var AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  function toLatinDigits(s) {
    return String(s == null ? "" : s).replace(/[٠-٩]/g, function (d) {
      return String(AR_DIGITS.indexOf(d));
    });
  }
  // تطبيع عربي للتحليل: أإآ→ا، ة→ه، ى→ي، إزالة التشكيل (نفس منطق app.js)
  function norm(s) {
    return toLatinDigits(s).toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[\u064b-\u0652\u0670]/g, " ")
      .replace(/[«»""]/g, " ").replace(/\s+/g, " ").trim();
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtPrice(n) {
    if (n == null || isNaN(n)) return "غير متوفر";
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " درهم";
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return "–";
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function hasData() {
    return typeof LISTINGS !== "undefined" && Array.isArray(LISTINGS) && LISTINGS.length > 0;
  }
  function cfg() {
    return (typeof SOUQ_CONFIG !== "undefined" && SOUQ_CONFIG) || {};
  }

  /* ============ 2. القواميس متعددة اللغات ============ */
  var CITY_MAP = [
    { ar: "طنجة", keys: ["طنجة", "tnja", "tanger", "tangier"] },
    { ar: "الدار البيضاء", keys: ["الدار البيضاء", "دار البيضاء", "كازا", "casa", "casablanca", "kaza"] },
    { ar: "الرباط", keys: ["الرباط", "rabat"] },
    { ar: "مراكش", keys: ["مراكش", "مراكش", "marrakech", "marrakesh"] },
    { ar: "فاس", keys: ["فاس", "fes", "fez"] },
    { ar: "أكادير", keys: ["اكادير", "أكادير", "agadir"] },
    { ar: "مكناس", keys: ["مكناس", "meknes", "meknas"] },
    { ar: "القنيطرة", keys: ["القنيطره", "قنيطرة", "kenitra"] },
    { ar: "تطوان", keys: ["تطوان", "tetouan", "tetuan"] },
    { ar: "المحمدية", keys: ["المحمديه", "mohammedia", "mohammadia"] },
    { ar: "الجديدة", keys: ["الجديده", "الجديدة", "el jadida", "jadida"] },
    { ar: "وجدة", keys: ["وجدة", "oujda"] },
    { ar: "سلا", keys: ["سلا", "sale", "sla"] },
    { ar: "تمارة", keys: ["تمارة", "temara"] }
  ];
  var TYPE_MAP = [
    { ar: "شقة", keys: ["شقه", "شقة", "شقق", "appartement", "appartements", "apartment", "apartments", "apart", "flat"] },
    { ar: "ستوديو", keys: ["ستوديو", "استوديو", "studio", "studios"] },
    { ar: "فيلا", keys: ["فيلا", "فيلات", "villa", "villas"] },
    { ar: "دار", keys: ["دار", "ديور", "دوار", "منزل", "maison", "maisons", "house", "houses", "villa"] },
    { ar: "أرض", keys: ["ارض", "أرض", "اراضي", "أراضي", "terrain", "terrains", "land"] },
    { ar: "رياض", keys: ["رياض", "riad", "riads"] },
    { ar: "مكتب", keys: ["مكتب", "محل", "مكاتب", "bureau", "bureaux", "office", "local", "magasin"] }
  ];
  var FEATURE_MAP = [
    { id: "sea", keys: ["قريب للبحر", "قريبه للبحر", "قرب البحر", "على البحر", "اطلاله على البحر", "إطلالة على البحر", "شاطئ", "بحر", "pres de la mer", "près de la mer", "pres de la plage", "near the sea", "near sea", "sea view", "beach", "vue mer", "bord de mer"] },
    { id: "furnished", keys: ["مفروش", "مفروشة", "مفروشه", "meuble", "meublee", "meublé", "meublée", "furnished"] },
    { id: "elevator", keys: ["مصعد", "اسانسير", "ascenseur", "elevator", "lift"] },
    { id: "parking", keys: ["موقف", "كراج", "مراب", "parking", "garage", "stationnement"] },
    { id: "terrace", keys: ["تراس", "سطح", "terrasse", "terrace", "rooftop"] },
    { id: "garden", keys: ["حديقه", "حديقة", "jardin", "garden"] }
  ];
  var WORD_NUMBERS = {
    "جوج": 2, "زوج": 2, "زوجة": 2, "two": 2, "deux": 2,
    "ثلاثة": 3, "تلاتة": 3, "ثلاث": 3, "three": 3, "trois": 3,
    "اربعة": 4, "ربعة": 4, "four": 4, "quatre": 4,
    "خمسة": 5, "five": 5, "cinq": 5,
    "واحد": 1, "وحدة": 1, "one": 1, "un": 1, "une": 1
  };
  // تطبيع مفاتيح القواميس بنفس دالة التطبيع (إصلاح: ة→ه كانت تكسر المطابقة)
  [CITY_MAP, TYPE_MAP, FEATURE_MAP].forEach(function (map) {
    map.forEach(function (entry) {
      entry.keys = entry.keys.map(function (k) { return norm(k); });
    });
  });

  /* ============ 3. تحليل الأثمنة المغربية ============
   *  مليون = 1,000,000 درهم | ألف = 1,000 | مليار = 1,000,000,000
   *  سنتيم: 100 سنتيم = 1 درهم (مليون سنتيم = 10,000 درهم)
   *  "مليون" وحده: نفترض مليون درهم مع ذكر الافتراض صراحةً. */
  var UNIT_MAD = { "مليار": 1e9, "مليون": 1e6, "مليونين": 2e6, "الف": 1e3, "ألف": 1e3, "million": 1e6, "millions": 1e6, "billion": 1e9, "k": 1e3 };
  var UNIT_CENT = { "مليار": 1e9, "مليون": 1e6, "مليونين": 2e6, "الف": 1e3, "ألف": 1e3, "million": 1e6 };

  function parseAmounts(ntext) {
    // يُرجع قائمة {value: درهم, raw} لكل مبلغ مذكور
    var out = [];
    var t = " " + ntext + " ";
    // حالة خاصة: "مليون ونص/ونصف" بدون رقم قبله
    t = t.replace(/مليون\s+ونص(ف)?/g, "1.5 مليون");
    // وحدة عارية بلا رقم: "مليون"، "ومليون"، "بمليار سنتيم" → نفترض 1
    // ملاحظة: يجب ألا يمس "1.5 مليون" — نشترط حرفاً غير رقمي وغير مسافة قبل الوحدة
    var bareAssumed = false;
    t = t.replace(/(^|[^\d.\s])\s*(مليار|مليون)(?![\d.])/g, function (mm, p1, u) {
      bareAssumed = true;
      return p1 + " 1 " + u;
    });
    var re = /(\d+(?:[.,]\d+)?)\s*(مليار|مليونين|مليون|الف|ألف|millions|million|billion|k)?\s*(سنتيم|سنتيمات|centimes?)?/g;
    var m;
    while ((m = re.exec(t)) !== null) {
      var num = parseFloat(String(m[1]).replace(",", "."));
      if (!(num > 0)) continue;
      var unit = (m[2] || "").toLowerCase();
      var isCent = !!m[3];
      var mad;
      if (isCent) {
        mad = num * (UNIT_CENT[unit] || 1) / 100;
      } else {
        mad = num * (UNIT_MAD[unit] || 1);
        // رقم وحده بدون وحدة (مثال: 1500000) → درهم مباشرة إذا كان كبيراً
        if (!unit && mad < 1000) continue; // تجاهل أرقام صغيرة بلا وحدة (غرف/مساحة)
      }
      if (mad >= 10000) out.push({ value: Math.round(mad), raw: m[0].trim() });
    }
    out.bareAssumed = bareAssumed;
    return out;
  }

  function detectRange(ntext, amounts) {
    var min = null, max = null, assumptions = [];
    var between = /بين\s+(.+?)\s+و\s+(.+?)(\s|$)/.exec(ntext) || /between\s+(.+?)\s+and\s+(.+?)(\s|$)/.exec(ntext) || /entre\s+(.+?)\s+et\s+(.+?)(\s|$)/.exec(ntext);
    if (between && amounts.length >= 2) {
      var vals = amounts.map(function (a) { return a.value; }).sort(function (a, b) { return a - b; });
      min = vals[0]; max = vals[vals.length - 1];
      return { min: min, max: max, assumptions: assumptions };
    }
    if (amounts.length === 1) {
      var v = amounts[0].value;
      if (amounts.bareAssumed) assumptions.push("اعتبرت «مليون» = 1,000,000 درهم");
      var isMax = /(ما\s?تفوتش|ماتفوتش|اقل من|أقل من|تحت|حد اقصى|أقصى|باقل|moins de|less than|under|below|up to|max|maximum)/.test(ntext);
      var isMin = /(فوق|اكثر من|أكثر من|ابتداء من|plus de|more than|over|above|min|minimum)/.test(ntext);
      if (isMax && !isMin) max = v;
      else if (isMin && !isMax) min = v;
      else {
        // مبلغ وحيد بلا مقارنة → في سياق الشراء يُفهم كسقف ميزانية
        max = v;
        assumptions.push("اعتبرت المبلغ المذكور سقفاً للميزانية");
      }
      return { min: min, max: max, assumptions: assumptions };
    }
    if (amounts.length >= 2) {
      var vals2 = amounts.map(function (a) { return a.value; }).sort(function (a, b) { return a - b; });
      min = vals2[0]; max = vals2[vals2.length - 1];
    }
    return { min: min, max: max, assumptions: assumptions };
  }

  function findAll(ntext, map) {
    var found = [];
    for (var i = 0; i < map.length; i++) {
      var entry = map[i];
      for (var j = 0; j < entry.keys.length; j++) {
        if (ntext.indexOf(entry.keys[j]) !== -1) { found.push(entry.ar); break; }
      }
    }
    return found;
  }

  function detectBeds(ntext) {
    var m = /(\d+)\s*(ديال\s+البيوت|ديال\s+بيوت|غرف|غرفه|غرفة|بيوت|بيت|chambres?|bedrooms?|beds?|pieces?)/.exec(ntext);
    if (m) return parseInt(m[1], 10);
    // أرقام بالكلمات: "جوج غرف"
    for (var w in WORD_NUMBERS) {
      if (new RegExp("(^|\\s)" + w + "\\s*(ديال\\s+البيوت|غرف|غرفه|غرفة|بيوت|chambres?|bedrooms?)").test(ntext)) {
        return WORD_NUMBERS[w];
      }
    }
    return null;
  }

  function detectArea(ntext) {
    var m = /(\d+)\s*(م2|م²|متر مربع|متر|m2|m²|sqm|sq\.?m)/.exec(ntext);
    return m ? parseInt(m[1], 10) : null;
  }

  function detectLanguage(text, ntext) {
    if (/(بغيت|ديال|شحال|كاين|قلب ليا|زوين|بزاف|واش|كيفاش|ماشي)/.test(ntext)) return "darija";
    if (/[\u0600-\u06FF]/.test(text)) return "arabic";
    if (/(je cherche|appartement|bonjour|merci|moins de|près de)/.test(ntext)) return "french";
    return "english";
  }

  function detectSort(ntext) {
    if (/(الارخص|الأرخص|رخص|اقل ثمن|moins cher|cheapest|lowest price)/.test(ntext)) return "price-asc";
    if (/(الاغلى|الأغلى|غالي|plus cher|most expensive)/.test(ntext)) return "price-desc";
    if (/(الاكبر|الأكبر|كبيره|مساحه كبيره|plus grand|largest)/.test(ntext)) return "area-desc";
    if (/(الاحدث|الأحدث|جديد|recent|newest|latest)/.test(ntext)) return "newest";
    if (/(همزه|همزة|صفقه|صفقة|احسن ثمن|meilleur prix|best deal|deal)/.test(ntext)) return "deal";
    return "default";
  }

  /* ============ 4. محلل الاستعلام → filters منظمة ============ */
  function parseQuery(rawText) {
    var text = String(rawText == null ? "" : rawText).slice(0, 500);
    var ntext = " " + norm(text) + " ";
    var f = {
      intent: "search",
      language: detectLanguage(text, ntext),
      city: null, property_type: null,
      min_price: null, max_price: null,
      min_beds: null, min_area: null,
      features: [], sort: detectSort(ntext),
      investment: /(استثمار|invest)/.test(ntext),
      clarifications: [], assumptions: [],
      raw: text
    };

    // النية أولاً
    // \b لا يعمل مع الحروف العربية، وntext مبدوء بمسافة → نستعمل (?:^|\s)
    if (/(?:^|\s)(سلام|صباح الخير|مساء الخير|اهلا|bonjour|salut|hello|hi)(?:\s|$)/.test(ntext) && ntext.trim().split(/\s+/).length <= 3) {
      f.intent = "greeting";
      return f;
    }
    if (/(قارن|مقارنه|مقارنة|compare|comparer|comparaison)/.test(ntext)) { f.intent = "compare"; }
    else if (/(حاسبه|حاسبة|قرض|مقدم|تسبيق|القسط|نخلص|شحال نقدر نشري|التمويل|credit|mensualite|mensualité|mortgage|afford)/.test(ntext)) { f.intent = "mortgage"; }
    else if (/(معاينه|معاينة|مهتم|بغيت نتواصل|بغيت نشوف|اتصل بيا|تواصل مع|visite|visiter|rendez-vous|interesse|intéressé)/.test(ntext)) { f.intent = "lead"; }
    else if (/(كيفاش نعرض|كيف اعرض|بغيت نعرض|منين كتجيبو|من اين|شكون نتوما|من انتم|واش الموقع|الثمن نهائي|comment publier|d'où viennent)/.test(ntext)) { f.intent = "faq"; }

    var cities = findAll(ntext, CITY_MAP);
    if (cities.length) f.city = cities[0];
    var types = findAll(ntext, TYPE_MAP);
    if (types.length) f.property_type = types[0];

    var beds = detectBeds(ntext);
    if (beds) f.min_beds = beds;
    var area = detectArea(ntext);
    if (area) f.min_area = area;

    var amounts = parseAmounts(ntext);
    // للرهن: استخراج التسبيق والشهري يُعالج في معالج منفصل
    if (f.intent !== "mortgage") {
      var range = detectRange(ntext, amounts);
      f.min_price = range.min; f.max_price = range.max;
      f.assumptions = range.assumptions;
    }

    for (var i = 0; i < FEATURE_MAP.length; i++) {
      var feat = FEATURE_MAP[i];
      for (var j = 0; j < feat.keys.length; j++) {
        if (ntext.indexOf(feat.keys[j]) !== -1) { f.features.push(feat.id); break; }
      }
    }

    // أسئلة تحتاج توضيحاً (حوار تدريجي — لا تخمين)
    // "بغيت دار" → نسأل عن المدينة والميزانية حتى لو عُرف النوع
    if (f.intent === "search") {
      if (!f.city && !f.min_price && !f.max_price) {
        f.clarifications.push("city_budget");
      } else if (!f.city && (f.min_price || f.max_price)) {
        f.clarifications.push("city_optional");
      }
    }
    return f;
  }

  /* واجهة المزوّد — قابلة للتبديل مستقبلاً */
  var AIProviders = {
    local: {
      name: "local",
      parse: function (text) { return Promise.resolve(parseQuery(text)); }
    },
    http: {
      name: "http",
      parse: function (text) {
        // يُفعَّل فقط عند وجود backend — يتطلب AI_CONFIG.endpoint
        return new Promise(function (resolve, reject) {
          if (!AI_CONFIG.endpoint) return reject(new Error("no-endpoint"));
          var ctrl = null;
          try { ctrl = new AbortController(); } catch (e) {}
          var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, AI_CONFIG.timeoutMs);
          fetch(AI_CONFIG.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text }),
            signal: ctrl ? ctrl.signal : undefined
          }).then(function (r) {
            clearTimeout(timer);
            if (!r.ok) throw new Error("http-" + r.status);
            return r.json();
          }).then(function (data) {
            // الـbackend يرجع {ok, provider, filters} — نقبل الشكلين معاً
            var flt = validateFilters((data && data.filters) || data);
            if (!flt) throw new Error("invalid-json");
            resolve(flt);
          }).catch(reject);
        });
      }
    }
  };

  // تحقق صارم من filters القادمة من أي مزوّد خارجي (البند 10)
  function validateFilters(d) {
    if (!d || typeof d !== "object") return null;
    var out = { intent: "search", language: "unknown", features: [], clarifications: [], assumptions: [] };
    var str = function (v) { return typeof v === "string" ? v.slice(0, 120) : null; };
    var num = function (v) { if (v == null || v === "") return null; v = Number(v); return isFinite(v) && v >= 0 ? v : null; };
    out.intent = ["search", "compare", "mortgage", "lead", "faq", "greeting"].indexOf(d.intent) !== -1 ? d.intent : "search";
    var city = str(d.city);
    if (city && CITY_MAP.some(function (c) { return c.ar === city; })) out.city = city;
    var type = str(d.property_type);
    if (type && TYPE_MAP.some(function (t) { return t.ar === type; })) out.property_type = type;
    out.min_price = num(d.min_price); out.max_price = num(d.max_price);
    out.min_beds = num(d.min_beds); out.min_area = num(d.min_area);
    if (Array.isArray(d.features)) {
      out.features = d.features.filter(function (x) {
        return FEATURE_MAP.some(function (fm) { return fm.id === x; });
      });
    }
    out.sort = ["default", "price-asc", "price-desc", "area-desc", "newest", "deal"].indexOf(d.sort) !== -1 ? d.sort : "default";
    out.investment = d.investment === true;
    return out;
  }

  /* ============ 5. المطابقة والتسجيل (داخلي فقط) ============ */
  function featureMatch(l, fid) {
    var blob = norm([l.title, l.description, (l.features || []).join(" "), l.neighborhood, l.address].join(" "));
    switch (fid) {
      case "furnished": return l.furnished === true;
      case "elevator": return l.elevator === true;
      case "parking": return l.parking === true;
      case "sea": return /(بحر|شاطئ|plage|sea|beach|mer)/.test(blob);
      case "terrace": return /(تراس|terrasse|terrace)/.test(blob);
      case "garden": return /(حديقه|jardin|garden)/.test(blob);
      default: return false;
    }
  }

  function matchFilters(l, f) {
    if (f.city && l.city !== f.city) return false;
    if (f.property_type && l.type !== f.property_type) return false;
    if (f.min_price != null && (l.price == null || l.price < f.min_price)) return false;
    if (f.max_price != null && (l.price == null || l.price > f.max_price)) return false;
    if (f.min_beds != null && (l.rooms == null || l.rooms < f.min_beds)) return false;
    if (f.min_area != null && (l.area == null || l.area < f.min_area)) return false;
    for (var i = 0; i < f.features.length; i++) {
      if (!featureMatch(l, f.features[i])) return false;
    }
    return true;
  }

  function ppm(l) { return (l.price && l.area) ? l.price / l.area : null; }
  function dealPct(l) {
    var p = ppm(l), m = cfg().cityMedians && cfg().cityMedians[l.city];
    if (p == null || m == null || p >= m) return null;
    return Math.round((m - p) / m * 100);
  }

  // تسجيل داخلي للترتيب فقط — لا يُعرض للمستخدم كحقيقة
  function scoreListing(l, f) {
    var s = 0;
    if (f.city && l.city === f.city) s += 50;
    if (f.property_type && l.type === f.property_type) s += 15;
    if (f.min_beds != null && l.rooms != null && l.rooms >= f.min_beds) s += 20;
    if (f.min_area != null && l.area != null && l.area >= f.min_area) s += 10;
    if (f.max_price != null && l.price != null && l.price <= f.max_price) s += 30;
    if (f.min_price != null && l.price != null && l.price >= f.min_price) s += 15;
    s += f.features.length * 8;
    if (l.agency_direct) s += 8;
    if (l.spotlight) s += 5;
    if (l.verification === "page") s += 8;
    if (dealPct(l) != null) s += 10;
    if (l.date_verified) {
      var days = (Date.now() - Date.parse(l.date_verified)) / 86400000;
      if (days >= 0 && days < 45) s += Math.max(0, 10 - days / 5);
    }
    return s;
  }

  function searchListings(f) {
    var pool = LISTINGS.filter(function (l) { return l.status !== "unavailable"; });
    var matched = pool.filter(function (l) { return matchFilters(l, f); });
    var scored = matched.map(function (l) { return { l: l, s: scoreListing(l, f) }; });
    var sort = f.sort;
    if (f.investment && sort === "default") sort = "deal";
    scored.sort(function (a, b) {
      if (sort === "price-asc") return (a.l.price || Infinity) - (b.l.price || Infinity);
      if (sort === "price-desc") return (b.l.price || 0) - (a.l.price || 0);
      if (sort === "area-desc") return (b.l.area || 0) - (a.l.area || 0);
      if (sort === "newest") return String(b.l.date_verified || "").localeCompare(String(a.l.date_verified || ""));
      if (sort === "deal") return (dealPct(b.l) || -1) - (dealPct(a.l) || -1);
      return b.s - a.s;
    });
    return scored.map(function (x) { return x.l; });
  }

  // بدائل قريبة عند انعدام النتائج — مع ذكر ما تم تخفيفه بصراحة
  function nearMatches(f) {
    var relaxed = [], notes = [];
    var f2 = Object.assign({}, f, { features: [] });
    if (f.features.length) { notes.push("أزلت شرط المميزات"); }
    var r1 = searchListings(f2);
    if (r1.length) { relaxed = r1; }
    else {
      var f3 = Object.assign({}, f2, { min_beds: f.min_beds != null && f.min_beds > 1 ? f.min_beds - 1 : f.min_beds });
      if (f3.min_beds !== f.min_beds) notes.push("خففت شرط الغرف");
      var r2 = searchListings(f3);
      if (r2.length) relaxed = r2;
      else if (f.max_price != null) {
        var f4 = Object.assign({}, f3, { max_price: Math.round(f.max_price * 1.3) });
        notes.push("وسّعت الميزانية قليلاً");
        relaxed = searchListings(f4);
      }
    }
    return { list: relaxed.slice(0, AI_CONFIG.maxResults), notes: notes };
  }

  /* ============ 6. حسابات الرهن (نفس صيغة الموقع) ============ */
  function annuityMonthly(loan, annualRate, years) {
    var r = annualRate / 100 / 12, n = years * 12;
    if (!(loan > 0) || !(n > 0)) return 0;
    return r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
  }
  function maxLoanFromMonthly(monthly, annualRate, years) {
    var r = annualRate / 100 / 12, n = years * 12;
    if (!(monthly > 0) || !(n > 0)) return 0;
    return r > 0 ? monthly * (1 - Math.pow(1 + r, -n)) / r : monthly * n;
  }
  function parseMortgageQuery(ntext) {
    var t = " " + ntext + " ";
    var down = null, monthly = null;
    // الصيغة المعكوسة أولاً ("300 ألف مقدم") — إشارة أقوى
    var dm = /(\d+(?:[.,]\d+)?)\s*(مليار|مليون|الف|ألف)?\s*(مقدم|تسبيق)/.exec(t);
    if (dm) {
      var dnum = parseFloat(toLatinDigits(dm[1]).replace(",", "."));
      var dunit = dm[2] ? UNIT_MAD[dm[2]] || 1 : 1;
      down = Math.round(dnum * dunit);
    } else {
      dm = /(مقدم|تسبيق|apport|down|avance)[^\d]*(\d[\d\s.,]*)/.exec(t);
      if (dm) down = Math.round(parseFloat(toLatinDigits(dm[2]).replace(/[\s,]/g, "")) || 0);
    }
    var mm = /(نخلص|نقدر نخلص|القسط|شهريا|كل شهر|mensualite|mensualité|monthly|par mois)[^\d]*(\d[\d\s.,]*)/.exec(t);
    if (mm) monthly = Math.round(parseFloat(toLatinDigits(mm[2]).replace(/[\s,]/g, "")) || 0);
    // "عندي 300 ألف" وحده → تسبيق
    if (down == null) {
      var am = parseAmounts(ntext);
      if (am.length === 1 && /(عندي|عندنا|apport|down)/.test(t)) down = am[0].value;
    }
    return { down: down, monthly: monthly };
  }

  /* ============ 7. المعرفة: الأسئلة الشائعة ============ */
  function faqAnswer(ntext) {
    var wa = (cfg().whatsapp || "https://wa.me/212693981822");
    var phone = (cfg().agencyPhone || "0693981822");
    if (/(كيفاش نعرض|كيف اعرض|بغيت نعرض|عرض عقاري|comment publier|publier une annonce)/.test(ntext)) {
      return "أي واحد يقدر يعرض العقار ديالو عندنا 🏠 صيفط لنا فواتساب على <b>" + esc(phone) + "</b>: صور العقار، المساحة، الحي، والثمن المطلوب — ونتكلفو بالباقي. <a href=\"" + esc(wa) + "\" target=\"_blank\" rel=\"noopener\">فتح واتساب</a>";
    }
    if (/(منين كتجيبو|من اين|مصدر العقارات|d'où viennent|ou trouvez)/.test(ntext)) {
      return "كنجمعو الإعلانات من مواقع الإعلانات المبوبة بحال أفيتو، بالإضافة للعقارات اللي كيعرضوها أصحابها عندنا مباشرة فالوكالة. كل إعلان كيبين المصدر ديالو ودرجة التحقق ديالو.";
    }
    if (/(شكون نتوما|من انتم|الوكاله|الوكالة|qui etes|qui êtes)/.test(ntext)) {
      return "حنا وكالة <b>كاب إيمو طنجة</b> — منصة مغربية لمقارنة العقارات المعروضة للبيع. كنرافقوك فالبحث والمعاينة والتفاوض. للتواصل: <b>" + esc(phone) + "</b>";
    }
    if (/(الثمن نهائي|قابل للتفاوض|negociable|négociable)/.test(ntext)) {
      return "الأثمنة المعروضة هي أثمنة الطلب المعلنة فالمصدر، وقد تكون قابلة للتفاوض مع البائع. عبارة «أقل بـX% من متوسط المدينة» نسبة محسوبة حسابياً — ماشي تخفيض معلن من البائع.";
    }
    if (/(معاينه|معاينة|visite)/.test(ntext)) {
      return "لطلب معاينة: افتح صفحة العقار واضغط «طلب معاينة عبر واتساب» — كتفتح لك رسالة جاهزة، وما كيترسل والو حتى تضغط زر الإرسال بنفسك.";
    }
    return "هاد السؤال ما عنديش عليه جواب مؤكد من معلومات الموقع. يمكنك التواصل مع الوكالة مباشرة على <b>" + esc(phone) + "</b> — أو سولني على: البحث عن عقار، المقارنة، حاسبة القرض، أو كيفاش تعرض عقارك.";
  }

  /* ============ 8. واجهة المحادثة ============ */
  var session = {
    opened: false, greeted: false,
    pendingFilters: null, lastResults: [], lastQuery: "",
    lead: null, propCtx: null,
    msgTimes: []
  };

  function ensureUI() {
    if (document.getElementById("aiFab")) return;
    var fab = document.createElement("button");
    fab.id = "aiFab"; fab.className = "ai-fab"; fab.type = "button";
    fab.setAttribute("aria-label", "فتح المساعد الذكي");
    fab.innerHTML = "🤖";
    var panel = document.createElement("div");
    panel.id = "aiPanel"; panel.className = "ai-panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "المساعد الذكي لكاب إيمو طنجة");
    panel.innerHTML =
      '<div class="ai-head"><strong>🤖 مساعد كاب إيمو</strong>' +
      '<span class="ai-head-sub">يفهم الدارجة والفرنسية والإنجليزية</span>' +
      '<button type="button" id="aiClose" aria-label="إغلاق">×</button></div>' +
      '<div class="ai-msgs" id="aiMsgs" aria-live="polite"></div>' +
      '<div class="ai-chips" id="aiChips"></div>' +
      '<form class="ai-form" id="aiForm" autocomplete="off">' +
      '<input id="aiInput" type="text" placeholder="كتب سؤالك هنا… مثال: بغيت شقة فطنجة" aria-label="رسالتك للمساعد" maxlength="500">' +
      '<button type="submit">إرسال</button></form>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", function () { togglePanel(); });
    panel.querySelector("#aiClose").addEventListener("click", function () { togglePanel(false); });
    panel.querySelector("#aiForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = panel.querySelector("#aiInput");
      var v = inp.value.trim();
      if (!v) return;
      inp.value = "";
      handleUserText(v);
    });
    panel.querySelector("#aiChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-chip]");
      if (b) handleUserText(b.getAttribute("data-chip"));
    });
    renderChips(["🏠 قلب ليا على دار", "💰 شحال نقدر نشري؟", "📍 عقارات فطنجة", "🔎 قارن ليا جوج عقارات", "📱 تواصل مع الوكالة"]);
  }

  function togglePanel(force) {
    var panel = document.getElementById("aiPanel");
    var show = typeof force === "boolean" ? force : panel.hidden;
    panel.hidden = !show;
    document.getElementById("aiFab").classList.toggle("open", show);
    if (show) {
      session.opened = true;
      if (!session.greeted) {
        session.greeted = true;
        botSay('سلام! 👋 أنا مساعد <b>كاب إيمو طنجة</b>.<br>كتب ليا شنو كتقلب عليه بالدارجة أو الفرنسية أو الإنجليزية، مثال:<br>«بغيت شقة فطنجة، 3 غرف، وما تفوتش مليون ونص»<br>ونقلب لك غير فالعقارات <b>الحقيقية</b> اللي عندنا فالموقع.');
      }
      setTimeout(function () {
        var inp = document.getElementById("aiInput");
        if (inp && window.innerWidth > 700) inp.focus();
      }, 150);
    }
  }

  function renderChips(list) {
    var box = document.getElementById("aiChips");
    if (!box) return;
    box.innerHTML = list.map(function (c) {
      return '<button type="button" data-chip="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  }

  function scrollDown() {
    var m = document.getElementById("aiMsgs");
    if (m) m.scrollTop = m.scrollHeight;
  }

  function userSay(text) {
    var m = document.getElementById("aiMsgs");
    var d = document.createElement("div");
    d.className = "ai-msg user";
    d.textContent = text; // textContent = آمن ضد XSS بالبناء
    m.appendChild(d);
    scrollDown();
  }

  function botSay(html) {
    var m = document.getElementById("aiMsgs");
    var d = document.createElement("div");
    d.className = "ai-msg bot";
    d.innerHTML = html; // كل المحتوى هنا مبني داخلياً مع esc()
    m.appendChild(d);
    scrollDown();
  }

  function botTyping(show) {
    var m = document.getElementById("aiMsgs");
    var t = document.getElementById("aiTyping");
    if (show && !t) {
      t = document.createElement("div");
      t.className = "ai-msg bot typing"; t.id = "aiTyping";
      t.innerHTML = "<span></span><span></span><span></span>";
      m.appendChild(t); scrollDown();
    } else if (!show && t) t.remove();
  }

  /* بطاقة عقار داخل المحادثة — بيانات حقيقية فقط */
  function verifyText(l) {
    if (l.verification === "page") return "تم التحقق من الرابط" + (l.date_verified ? " (" + l.date_verified + ")" : "");
    if (l.verification === "index") return "مرصود في نتائج البحث فقط";
    return "لم يتم التحقق";
  }
  function propCardHTML(l) {
    var real = l.photos && l.photos.length && l.photo_real;
    var img = real
      ? '<img src="' + esc(l.photos[0]) + '" alt="' + esc(l.title) + '" loading="lazy">'
      : '<div class="ai-nophoto">لا توجد صورة للعقار</div>';
    var waText = encodeURIComponent("السلام عليكم، مهتم بهذا العقار: " + l.title + " — " + fmtPrice(l.price) + " — " + l.city);
    var waHref = "https://wa.me/212693981822?text=" + waText;
    var deal = dealPct(l);
    return '<div class="ai-prop">' +
      '<div class="ai-prop-img">' + img + "</div>" +
      '<div class="ai-prop-body">' +
      '<a class="ai-prop-title" href="./property-' + esc(l.id) + '.html"><strong>' + esc(l.title) + "</strong></a>" +
      '<div class="ai-prop-price">' + esc(fmtPrice(l.price)) + "</div>" +
      '<div class="ai-prop-meta">📍 ' + esc(l.city) + (l.neighborhood ? " — " + esc(l.neighborhood) : "") +
      (l.area ? " · 📐 " + esc(l.area) + " م²" : "") +
      (l.rooms ? " · 🛏️ " + esc(l.rooms) + " غرف" : "") + "</div>" +
      (deal != null ? '<div class="ai-prop-deal">🔥 أقل بـ' + deal + "% من متوسط المدينة</div>" : "") +
      '<div class="ai-prop-trust">🔍 ' + esc(verifyText(l)) + " · المصدر: " + esc(l.agency_direct ? "إعلان الوكالة" : (l.source_name || "مصدر خارجي")) + "</div>" +
      '<div class="ai-prop-actions">' +
      '<a class="ai-btn" href="./property-' + esc(l.id) + '.html">شوف التفاصيل</a>' +
      '<a class="ai-btn ghost" href="' + waHref + '" target="_blank" rel="noopener">واتساب</a>' +
      "</div></div></div>";
  }

  function filtersSummary(f) {
    var parts = [];
    if (f.city) parts.push("المدينة: " + f.city);
    if (f.property_type) parts.push("النوع: " + f.property_type);
    if (f.min_beds) parts.push(f.min_beds + "+ غرف");
    if (f.min_area) parts.push("مساحة ≥ " + f.min_area + " م²");
    if (f.min_price) parts.push("من " + fmtPrice(f.min_price));
    if (f.max_price) parts.push("حتى " + fmtPrice(f.max_price));
    var featNames = { sea: "قرب البحر", furnished: "مفروش", elevator: "مصعد", parking: "موقف سيارة", terrace: "تراس", garden: "حديقة" };
    f.features.forEach(function (x) { if (featNames[x]) parts.push(featNames[x]); });
    return parts.length ? parts.join(" · ") : "بدون شروط محددة";
  }

  /* ============ 9. معالجات النوايا ============ */
  function doSearch(f) {
    if (!hasData()) {
      botSay("عذراً، قاعدة بيانات العقارات غير متاحة حالياً. جرب البحث العادي في الموقع.");
      return;
    }
    // دمج مع فلاتر معلقة من حوار سابق
    if (session.pendingFilters) {
      var p = session.pendingFilters;
      ["city", "property_type", "min_price", "max_price", "min_beds", "min_area", "sort"].forEach(function (k) {
        if (f[k] == null && p[k] != null) f[k] = p[k];
      });
      f.features = f.features.concat(p.features.filter(function (x) { return f.features.indexOf(x) === -1; }));
      session.pendingFilters = null;
    }
    // توضيح تدريجي بدل التخمين
    if (f.clarifications.indexOf("city_budget") !== -1) {
      session.pendingFilters = f;
      botSay("أكيد 👍 باش نعاونك مزيان، شنو <b>المدينة</b> والميزانية التقريبية؟<br>مثال: «طنجة، مليون ونص»");
      renderChips(["طنجة", "الدار البيضاء", "مراكش", "أكادير"]);
      return;
    }
    var results = searchListings(f);
    session.lastResults = results;
    session.lastQuery = f.raw;

    var head = "🔎 قلبت على: <b>" + esc(filtersSummary(f)) + "</b>";
    if (f.assumptions.length) head += '<br><small>💡 ' + esc(f.assumptions.join(" · ")) + "</small>";
    if (f.clarifications.indexOf("city_optional") !== -1) head += '<br><small>💡 قلبت فجميع المدن — زيد المدينة لتضييق النتائج.</small>';

    if (results.length) {
      var shown = results.slice(0, AI_CONFIG.maxResults);
      var html = head + "<br>لقيت لك <b>" + results.length + "</b> " + (results.length === 1 ? "عقار حقيقي" : "عقارات حقيقية") + " مطابقة:";
      botSay(html + shown.map(propCardHTML).join("") +
        (results.length > shown.length ? '<div class="ai-more">…و ' + (results.length - shown.length) + " نتائج أخرى. ضيّق البحث لعرضها.</div>" : ""));
      renderChips(["🔎 قارن ليا جوج من هادو", "💰 حاسبة القرض", "📱 بغيت نتواصل"]);
    } else {
      var near = nearMatches(f);
      if (near.list.length) {
        botSay(head + "<br>ما لقيتش حالياً عقار مطابق <b>100%</b>، ولكن لقيت لك <b>" + near.list.length + "</b> خيارات قريبة" +
          (near.notes.length ? " (" + esc(near.notes.join("، ")) + ")" : "") + ":" +
          near.list.map(propCardHTML).join(""));
      } else {
        botSay(head + "<br>😕 ما لقيتش حالياً أي عقار قريب من هاد الشروط فقاعدة البيانات ديالنا.<br>جرب توسع الميزانية أو تبدل المدينة — أو <b>صيفط لنا طلبك</b> ونتواصلو معاك ملي يبان شي عرض مناسب.");
        renderChips(["📱 صيفط طلب للوكالة", "🏠 قلب ليا على دار"]);
      }
    }
  }

  function pickComparePair(ntext) {
    var pool = session.lastResults.length ? session.lastResults : LISTINGS.filter(function (l) { return l.status !== "unavailable"; });
    // إشارات ترتيبية: الأول والثاني / 1 و 2
    var ords = [];
    var ordWords = { "الاول": 1, "الأول": 1, "الاول": 1, "الثاني": 2, "التاني": 2, "الثالث": 3, "premier": 1, "deuxieme": 2, "deuxième": 2, "first": 1, "second": 2, "third": 3 };
    Object.keys(ordWords).forEach(function (w) { if (ntext.indexOf(w) !== -1) ords.push(ordWords[w]); });
    var nums = (ntext.match(/(?:^|\s)([1-9])(?:\s|$)/g) || []).map(function (x) { return parseInt(x.trim(), 10); });
    var picks = ords.concat(nums).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 2);
    if (picks.length === 2 && picks.every(function (v) { return v >= 1 && v <= pool.length; })) {
      return [pool[picks[0] - 1], pool[picks[1] - 1]];
    }
    // مطابقة بالكلمات المفتاحية من العناوين
    var scored = pool.map(function (l) {
      var words = ntext.split(/\s+/).filter(function (w) { return w.length > 2; });
      var blob = norm(l.title + " " + (l.neighborhood || ""));
      var s = 0;
      words.forEach(function (w) { if (blob.indexOf(w) !== -1) s++; });
      return { l: l, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; });
    if (scored.length >= 2) return [scored[0].l, scored[1].l];
    return null;
  }

  function doCompare(f, ntext) {
    var pair = pickComparePair(ntext);
    if (!pair) {
      if (session.lastResults.length >= 2) {
        botSay("شكون بغيتي نقارن؟ كتب ليا مثلاً: <b>«قارن الأول والثاني»</b> من آخر نتائج.");
      } else {
        botSay("باش نقارن، قلب أولاً على عقارات (مثال: «بغيت شقة فطنجة»)، ومن بعد قول ليا «قارن الأول والثاني».");
        renderChips(["🏠 قلب ليا على دار"]);
      }
      return;
    }
    var A = pair[0], B = pair[1];
    var row = function (label, fn) {
      return "<tr><th>" + esc(label) + "</th><td>" + fn(A) + "</td><td>" + fn(B) + "</td></tr>";
    };
    var cell = function (v) { return esc(v == null || v === "" ? "–" : String(v)); };
    botSay("⚖️ مقارنة بين عقارين حقيقيين من قاعدة البيانات:" +
      '<table class="ai-cmp"><tr><th></th><td><a href="./property-' + esc(A.id) + '.html"><b>' + esc(A.title) + "</b></a></td>" +
      '<td><a href="./property-' + esc(B.id) + '.html"><b>' + esc(B.title) + "</b></a></td></tr>" +
      row("الثمن", function (l) { return "<b>" + esc(fmtPrice(l.price)) + "</b>"; }) +
      row("المدينة / الحي", function (l) { return cell(l.city + (l.neighborhood ? " — " + l.neighborhood : "")); }) +
      row("المساحة", function (l) { return cell(l.area ? l.area + " م²" : null); }) +
      row("ثمن المتر", function (l) { var p = ppm(l); return cell(p ? fmtNum(p) + " درهم/م²" : null); }) +
      row("الغرف / الحمامات", function (l) { return cell((l.rooms != null ? l.rooms : "–") + " / " + (l.bathrooms != null ? l.bathrooms : "–")); }) +
      row("النوع", function (l) { return cell(l.type); }) +
      row("التحقق", function (l) { return cell(verifyText(l)); }) +
      row("المصدر", function (l) { return cell(l.agency_direct ? "إعلان الوكالة" : (l.source_name || "مصدر خارجي")); }) +
      "</table>" +
      '<p class="ai-note">المعلومات للمقارنة الأولية فقط — تحقق من المصدر الأصلي قبل أي التزام.</p>');
  }

  function doMortgage(f, ntext) {
    var q = parseMortgageQuery(ntext);
    if (q.down == null && q.monthly == null) {
      // تحويل ميزانية البحث إلى تقدير: القسط التقريبي
      var budget = f.max_price || (session.pendingFilters && session.pendingFilters.max_price);
      if (budget) {
        var m = annuityMonthly(budget * 0.8, 4.5, 20);
        botSay("💰 لعقار بميزانية <b>" + esc(fmtPrice(budget)) + "</b> (بتمويل 80%، فائدة 4.5%، 20 سنة):<br>القسط الشهري التقريبي ≈ <b>" + esc(fmtPrice(m)) + "</b><br><small>⚠️ تقدير أولي فقط — ماشي عرض بنكي. زيد: «عندي 300 ألف مقدم ونقدر نخلص 7000 فالشهر» باش نحسب لك شحال تقدر تشري.</small>");
        return;
      }
      botSay("💰 باش نحسب لك القدرة الشرائية، عطيني:<br>• التسبيق (المقدم) اللي عندك<br>• القسط الشهري اللي تقدر تخلصو<br>مثال: «عندي 300 ألف مقدم ونقدر نخلص 7000 درهم فالشهر»");
      return;
    }
    var down = q.down || 0, monthly = q.monthly || 0;
    var loan = maxLoanFromMonthly(monthly, 4.5, 20);
    var maxPrice = Math.round(loan + down);
    botSay("💰 <b>تقدير القدرة الشرائية</b> (فائدة 4.5%، مدة 20 سنة):<br>" +
      "• التسبيق: <b>" + esc(fmtPrice(down)) + "</b><br>" +
      "• القسط الشهري: <b>" + esc(fmtPrice(monthly)) + "</b><br>" +
      "→ تقدر تشري عقار حتى <b>" + esc(fmtPrice(maxPrice)) + "</b> تقريباً.<br>" +
      '<small>⚠️ حساب تقريبي لأغراض المقارنة فقط، وليس استشارة مالية مهنية — البنك هو اللي يحدد الشروط النهائية.</small>' +
      (maxPrice > 0 ? '<br><button type="button" class="ai-btn" data-chip="بغيت عقار ما يفوتش ' + maxPrice + ' درهم">🔎 قلب ليا بهاد الميزانية</button>' : ""));
  }

  function doLead(f, ntext) {
    var prop = session.propCtx;
    session.lead = { step: "name", name: "", phone: "", time: "", propertyId: prop ? prop.id : null };
    botSay("📱 ممتاز! باش نجهزو لك رسالة واتساب منظمة للوكالة" +
      (prop ? " حول عقار <b>" + esc(prop.title) + "</b>" : "") +
      "، شنو <b>الاسم الكامل</b> ديالك؟<br><small>ما غادي نرسلو والو تلقائياً — غادي نجهزو الرسالة ونتا اللي تضغط إرسال.</small>");
  }

  function handleLeadStep(text) {
    var L = session.lead;
    var t = text.trim();
    if (L.step === "name") {
      if (t.length < 2) { botSay("المرجو كتابة الاسم الكامل."); return; }
      L.name = t.slice(0, 60);
      L.step = "phone";
      botSay("شكراً <b>" + esc(L.name) + "</b> 👍 دابا عطيني <b>رقم الهاتف</b> (مغربي: يبدا بـ 06 أو 07).");
      return;
    }
    if (L.step === "phone") {
      var ph = t.replace(/[\s-]/g, "");
      if (!/^0[67]\d{8}$/.test(ph)) { botSay("الرقم غير صحيح — عطيني رقم مغربي صحيح (مثال: 0612345678)."); return; }
      L.phone = ph;
      L.step = "time";
      botSay("ممتاز ✅ آخر سؤال: <b>فوقاش</b> تبغي نتواصلو معاك؟ (صباحاً / بعد الزوال / مساءً)");
      renderChips(["صباحاً", "بعد الزوال", "مساءً"]);
      return;
    }
    if (L.step === "time") {
      L.time = t.slice(0, 30);
      var prop = L.propertyId ? LISTINGS.find(function (x) { return x.id === L.propertyId; }) : null;
      var lines = [
        "طلب تواصل من المساعد الذكي — كاب إيمو طنجة:",
        "الاسم: " + L.name,
        "الهاتف: " + L.phone,
        "وقت التواصل: " + L.time
      ];
      if (prop) lines.push("العقار: " + prop.title + " — " + fmtPrice(prop.price) + " — " + prop.city);
      var href = "https://wa.me/212693981822?text=" + encodeURIComponent(lines.join("\n"));
      session.lead = null;
      botSay("جاهزة! 🎉 اضغط الزر باش تفتح واتساب بالرسالة — <b>نتا اللي غادي تضغط إرسال</b>:<br><br><a class=\"ai-btn big\" href=\"" + href + "\" target=\"_blank\" rel=\"noopener\">📱 فتح واتساب وإرسال الطلب</a>");
      renderChips(["🏠 قلب ليا على دار", "🔎 قارن ليا جوج عقارات"]);
      return;
    }
  }

  function doPropertyQA(f, ntext) {
    var l = session.propCtx;
    if (!l) { doSearch(f); return; }
    var p = ppm(l), median = cfg().cityMedians && cfg().cityMedians[l.city];
    var deal = dealPct(l);
    var parts = [];
    parts.push("📋 <b>" + esc(l.title) + "</b> — " + esc(fmtPrice(l.price)));
    if (/(استثمار|invest|مربح|rentabil)/.test(ntext)) {
      parts.push("<b>من ناحية الاستثمار — حسب البيانات المتوفرة فقط:</b>");
      if (p && median) {
        parts.push("• ثمن المتر: <b>" + esc(fmtNum(p)) + " درهم/م²</b> مقابل متوسط " + esc(l.city) + " المرجعي (" + esc(fmtNum(median)) + " درهم/م²)" +
          (deal != null ? " — يعني <b>أقل بـ" + deal + "%</b> من المتوسط" : " — يعني فوق المتوسط"));
      } else parts.push("• ثمن المتر: غير متوفر للمقارنة");
      parts.push("• التحقق: " + esc(verifyText(l)));
      parts.push("• المميزات المذكورة: " + esc((l.features && l.features.length ? l.features.join("، ") : "غير مذكورة")));
      parts.push("<small>⚠️ هادي قراءة أولية من بيانات الإعلان فقط — ماشي نصيحة استثمارية. المردودية الحقيقية كتعتمد على الموقع الدقيق، الطلب الكرائي، والحالة القانونية — استشر مختصاً.</small>");
    } else if (/(علاش|ليش|pourquoi|why).*(ثمن|غالي|رخيص)/.test(ntext)) {
      parts.push("الثمن المعلن هو <b>" + esc(fmtPrice(l.price)) + "</b> حسب المصدر" + (l.source_name && !l.agency_direct ? " (" + esc(l.source_name) + ")" : "") + ". سبب التسعير غير مذكور فالإعلان — يمكنك التفاوض مباشرة مع البائع عبر واتساب.");
    } else {
      parts.push("• المساحة: " + esc(l.area ? l.area + " م²" : "غير متوفرة") + " · الغرف: " + esc(l.rooms != null ? l.rooms : "غير متوفر"));
      parts.push("• التحقق: " + esc(verifyText(l)));
      parts.push("• المصدر: " + esc(l.agency_direct ? "إعلان الوكالة" : (l.source_name || "مصدر خارجي")));
      parts.push("سولني: «واش مناسب للاستثمار؟» أو «علاش هاد الثمن؟» — ونجاوبك غير بالمعطيات اللي كاينة.");
    }
    botSay(parts.join("<br>"));
  }

  /* ============ 10. التوجيه الرئيسي ============ */
  function logInteraction(intent, f, nResults) {
    try {
      var entry = {
        t: new Date().toISOString(),
        provider: AI_CONFIG.provider,
        intent: intent,
        filters: f ? { city: f.city, type: f.property_type, min_p: f.min_price, max_p: f.max_price, beds: f.min_beds, feats: f.features } : null,
        results: nResults
      };
      var log = [];
      try { log = JSON.parse(localStorage.getItem("souq_ai_log") || "[]"); } catch (e) {}
      log.push(entry);
      if (log.length > 100) log = log.slice(-100);
      try { localStorage.setItem("souq_ai_log", JSON.stringify(log)); } catch (e) {}
    } catch (e) {}
  }

  function checkRateLimit() {
    var now = Date.now();
    session.msgTimes = session.msgTimes.filter(function (t) { return now - t < 600000; });
    if (session.msgTimes.length >= 40) return false;
    session.msgTimes.push(now);
    return true;
  }

  function handleUserText(text) {
    ensureUI();
    var panel = document.getElementById("aiPanel");
    if (panel.hidden) togglePanel(true);
    userSay(text);

    if (!checkRateLimit()) {
      botSay("بزاف ديال الرسائل فمدة قصيرة ⏳ — تسنى شوية وعاود. (حماية من الاستغلال)");
      return;
    }
    // خطوة تأهيل العميل لها الأولوية
    if (session.lead) { handleLeadStep(text); return; }

    botTyping(true);
    var provider = AIProviders[AI_CONFIG.provider] || AIProviders.local;
    // دمج سياق العقار المفتوح في صفحة التفاصيل
    var runParse = function () { return provider.parse(text); };
    runParse().then(function (f) {
      botTyping(false);
      if (!f || typeof f !== "object") { // safe fallback (البند 10)
        botSay("ما فهمتش الطلب مزيان 🤔 — عاود كتبو بطريقة أخرى، مثال: «بغيت شقة فطنجة»");
        return;
      }
      logInteraction(f.intent, f, null);
      var ntext = " " + norm(text) + " ";
      // سؤال حول العقار المفتوح حالياً له الأولوية
      if (session.propCtx && /(هاد العقار|هاد الشقه|هاد الشقة|هذا العقار|واش مناسب|رأيك|علاش|ليش)/.test(ntext) && f.intent !== "search") {
        doPropertyQA(f, ntext);
        return;
      }
      switch (f.intent) {
        case "greeting":
          botSay("سلام! 👋 شنو كتقلب عليه اليوم؟ كتب ليا المدينة والميزانية، مثال: «بغيت شقة فطنجة ما تفوتش مليون»");
          break;
        case "compare": doCompare(f, ntext); break;
        case "mortgage": doMortgage(f, ntext); break;
        case "lead": doLead(f, ntext); break;
        case "faq": botSay(faqAnswer(ntext)); break;
        default: doSearch(f);
      }
    }).catch(function () {
      botTyping(false);
      // المزوّد الخارجي تعطل → fallback محلي، والبحث العادي يبقى شغالاً
      try {
        var f = parseQuery(text);
        logInteraction(f.intent, f, null);
        if (f.intent === "search") doSearch(f);
        else botSay("المساعد المتقدم غير متاح حالياً، ولكن يمكنك استعمال البحث العادي في الموقع — وهو شغال 100%.");
      } catch (e2) {
        botSay("المساعد الذكي غير متاح حالياً، ولكن يمكنك استعمال البحث العادي.");
      }
    });
  }

  /* ============ 11. ربط صفحة التفاصيل ============ */
  function hookDetailPage() {
    try {
      var id = document.body && document.body.dataset ? document.body.dataset.listingId : null;
      if (!id || !hasData()) return;
      var l = LISTINGS.find(function (x) { return x.id === id; });
      if (!l) return;
      session.propCtx = l;
      var actions = document.querySelector(".detail-actions");
      if (!actions || document.getElementById("aiAskBtn")) return;
      var btn = document.createElement("button");
      btn.type = "button"; btn.id = "aiAskBtn"; btn.className = "btn btn-ghost";
      btn.innerHTML = "🤖 اسأل المساعد عن هذا العقار";
      btn.addEventListener("click", function () {
        ensureUI(); togglePanel(true);
        botSay('كتسول على <b>' + esc(l.title) + '</b> (' + esc(fmtPrice(l.price)) + ') 🤔<br>سولني: «واش مناسب للاستثمار؟» أو «علاش هاد الثمن؟» — ونجاوبك غير بالمعطيات الحقيقية اللي كاينة.');
      });
      actions.appendChild(btn);
    } catch (e) {}
  }

  /* ============ 12. التهيئة ============ */
  function init() {
    if (typeof document === "undefined") return;
    ensureUI();
    hookDetailPage();
    // واجهة عامة محدودة وآمنة
    if (typeof window !== "undefined") {
      window.SouqAI = {
        config: AI_CONFIG,
        providers: Object.keys(AIProviders),
        parse: function (t) { return (AIProviders[AI_CONFIG.provider] || AIProviders.local).parse(t); },
        open: function () { ensureUI(); togglePanel(true); },
        ask: handleUserText,
        version: "2.0.0-local"
      };
    }
  }

  /* تصدير الدوال الداخلية لاختبارات Node — لا يؤثر على المتصفح */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseQuery: parseQuery,
      validateFilters: validateFilters,
      parseAmounts: parseAmounts,
      norm: norm,
      esc: esc,
      searchListings: searchListings,
      nearMatches: nearMatches,
      featureMatch: featureMatch,
      dealPct: dealPct,
      annuityMonthly: annuityMonthly,
      maxLoanFromMonthly: maxLoanFromMonthly,
      parseMortgageQuery: parseMortgageQuery,
      // مسار المزوّد المفعّل (http/local) — لاختبار الربط مع الـbackend
      providerParse: function (t) { return (AIProviders[AI_CONFIG.provider] || AIProviders.local).parse(t); },
      providerName: function () { return (AIProviders[AI_CONFIG.provider] || AIProviders.local).name; }
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
