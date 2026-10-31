/* B3: حد محاولات الدخول لكل حساب (إيميل) ويه قفل مؤقت.
   - ينحسب لأي إيميل ينكتب، موجود أو لا، حتى ما يكشف إذا الحساب موجود.
   - بعد LOGIN_MAX_FAILS محاولات فاشلة خلال LOGIN_WINDOW_MIN دقيقة: قفل LOGIN_LOCK_MIN دقيقة،
     ويتضاعف ويه كل قفل جديد (لحد 24 ساعة كحد أعلى).
   - الدخول الناجح يصفّر العداد.
   حدود معروفة: الحالة بذاكرة العملية؛ تتصفر ويه إعادة التشغيل وما تنتشارك بين أكثر من instance.
   إذا صار اكو أكثر من instance لازم تنتقل لـ Redis أو جدول بالقاعدة. */
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

function createLoginGuard(opts = {}) {
  const maxFails = opts.maxFails ?? num(process.env.LOGIN_MAX_FAILS, 5);
  const windowMs = (opts.windowMin ?? num(process.env.LOGIN_WINDOW_MIN, 15)) * 60000;
  const lockMs = (opts.lockMin ?? num(process.env.LOGIN_LOCK_MIN, 15)) * 60000;
  const maxEntries = opts.maxEntries ?? 50000;
  const now = opts.now || (() => Date.now());
  const map = new Map();   // key -> { fails, first, lockedUntil, locks }

  const keyOf = email => String(email || '').trim().toLowerCase();
  function sweep(t) {
    if (map.size < maxEntries) return;
    for (const [k, v] of map) if (v.lockedUntil <= t && t - v.first > windowMs) map.delete(k);
    while (map.size >= maxEntries) map.delete(map.keys().next().value);   // أقدم مدخل
  }
  return {
    /* يرجّع عدد الثواني الباقية على القفل، أو 0 إذا مسموح */
    check(email) {
      const v = map.get(keyOf(email)); const t = now();
      return v && v.lockedUntil > t ? Math.ceil((v.lockedUntil - t) / 1000) : 0;
    },
    fail(email) {
      const k = keyOf(email); const t = now(); sweep(t);
      let v = map.get(k);
      if (!v || (t - v.first > windowMs && v.lockedUntil <= t)) v = { fails: 0, first: t, lockedUntil: 0, locks: v ? v.locks : 0 };
      v.fails++;
      if (v.fails >= maxFails) {
        v.lockedUntil = t + Math.min(lockMs * 2 ** v.locks, 24 * 3600000);
        v.locks++; v.fails = 0; v.first = t;
      }
      map.set(k, v);
    },
    success(email) { map.delete(keyOf(email)); },
    _size: () => map.size,
  };
}

module.exports = { createLoginGuard };