/* P3: تحديث دوري يوقف لما الصفحة مخفية.
   - start(): تحديث فوري (مثل قبل عند فتح الصفحة) وبعدين كل intervalMs.
   - لما الصفحة تنخفي: يوقف المؤقت. لما ترجع ظاهرة: تحديث فوري وبعدين يرجع الجدول.
   - ما يصير طلبين بنفس الوقت: إذا طلب شغال، ما يبدي ثاني؛ والموعد الجاي ينحسب بعد ما يخلص (setTimeout مو setInterval).
   منطق نقي بدون DOM (المؤقتات وفحص الإخفاء ينمرّرون) حتى ينختبر بـ node:test. */
export function createVisibilityPoller({ run, intervalMs = 30000, isHidden = () => false, timers } = {}) {
  const T = timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id) };
  let timer = null;
  let inFlight = false;
  let stopped = true;

  function clear() { if (timer !== null) { T.clearTimeout(timer); timer = null; } }
  function schedule() {
    clear();
    if (stopped || isHidden()) return;
    timer = T.setTimeout(() => { timer = null; tick(false); }, intervalMs);
  }
  async function tick(force) {
    if (stopped) return;
    if (!force && isHidden()) { clear(); return; }
    if (inFlight) return;   // الطلب الشغال لما يخلص يرتب الموعد الجاي
    clear();
    inFlight = true;
    try { await run(); } catch (_) { /* run يتعامل ويه أخطاءه */ } finally { inFlight = false; }
    schedule();
  }

  return {
    start() { if (!stopped) return; stopped = false; tick(true); },
    stop() { stopped = true; clear(); },
    onVisibilityChange() { if (isHidden()) clear(); else tick(false); },
    get state() { return { scheduled: timer !== null, inFlight, stopped }; },
  };
}