"use strict";
/* إقلاع الإنتاج (Render — قرص ephemeral):
 * 1) migrations  2) استيراد العقارات من الرابط الحي (fallback: لقطة محلية)
 * 3) إنشاء المدير (إن توفرت ADMIN_PASSWORD)  4) تشغيل الخادم.
 * الفشل في 2/3 لا يوقف الإقلاع — الواجهة فيها fallback محلي.
 */
const { spawnSync } = require("child_process");

function runStep(label, args) {
  console.log(`[boot] ${label}…`);
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: __dirname });
  if (r.status !== 0)
    console.warn(`[boot] ${label}: تحذير (exit ${r.status}) — نكمل الإقلاع.`);
  return r.status === 0;
}

async function main() {
  if (!runStep("migrations", ["migrate.js"])) {
    console.error("[boot] فشلت الـ migrations — إيقاف.");
    process.exit(1);
  }

  if (!runStep("import-live", ["import-listings.js"])) {
    console.warn("[boot] الاستيراد من الرابط الحي فشل — نجرب اللقطة المحلية.");
    runStep("import-snapshot", ["import-listings.js", "--from-file", "../data/listings.snapshot.js"]);
  }

  runStep("seed-admin", ["seed-admin.js"]); // best effort: يتجاوز إن لم توجد ADMIN_PASSWORD
  console.log("[boot] تشغيل الخادم…");
  await require("./server.js").start();
}

main().catch((e) => { console.error("[boot] خطأ قاتل:", e.message); process.exit(1); });
