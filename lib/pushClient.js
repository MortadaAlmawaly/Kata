/* P1: تسجيل خروج يشيل اشتراك Web Push من هذا الجهاز.
   1) ناخذ الاشتراك الحالي (إذا موجود) بمهلة قصيرة حتى ما يتعلّق الخروج.
   2) نرسل endpoint ويه طلب الخروج، والسيرفر يحذفه بس إذا يخص صاحب الجلسة.
   3) نلغي الاشتراك من المتصفح (pushManager unsubscribe) حتى لو فشل طلب السيرفر. */
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), new Promise(resolve => setTimeout(() => resolve(null), ms))]);

function defaultGetRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.getRegistration();
}

export async function currentPushSubscription(getRegistration = defaultGetRegistration, timeoutMs = 1500) {
  try {
    const reg = await withTimeout(getRegistration(), timeoutMs);
    if (!reg || !reg.pushManager) return null;
    return (await withTimeout(reg.pushManager.getSubscription(), timeoutMs)) || null;
  } catch (_) { return null; }
}

export async function logoutWithPush(api, { getRegistration = defaultGetRegistration, timeoutMs = 1500 } = {}) {
  const sub = await currentPushSubscription(getRegistration, timeoutMs);
  const body = sub && typeof sub.endpoint === 'string' ? { endpoint: sub.endpoint } : {};
  try { await api('POST', '/api/auth/logout', body); } catch (_) { /* تجاهل: نكمل الخروج */ }
  if (sub) { try { await sub.unsubscribe(); } catch (_) { /* تجاهل */ } }
  return { endpointSent: Boolean(body.endpoint) };
}