/* عميل API مشترك لصفحات Next.js (يطابق api() في الواجهة القديمة).
   - يرسل الكوكيز (جلسة Express) عبر نفس الأصل؛ طلبات JSON فقط (حماية CSRF بالخادم تعتمد على Content-Type).
   - 401 ← تحويل لصفحة الدخول. الأخطاء ترمي Error برسالة عربية من الخادم. */
export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    let msg = 'حدث خطأ، حاول مرة ثانية';
    try { msg = (await res.json()).error || msg; } catch (_) { /* لا جسم JSON */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/* دخول/تسجيل لا يحوّل عند 401 (الرسالة تُعرض في النموذج) */
export async function authCall(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة ثانية');
  return data;
}
