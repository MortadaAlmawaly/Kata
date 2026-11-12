/* بلاغ خطأ واجهة للسيرفر (بدون بيانات حساسة). يفشل بصمت: الإبلاغ نفسه لا يجوز أن يكسر الصفحة. */
export function reportClientError(err, where) {
  try {
    const msg = String((err && err.message) || err || 'خطأ غير معروف').slice(0, 300);
    const stack = String((err && err.stack) || '').split('\n').slice(0, 6).join('\n').slice(0, 1200);
    fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/client-error', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ message: (where ? where + ': ' : '') + msg, stack, path: window.location.pathname }),
    }).catch(() => {});
  } catch (_) { /* تجاهل */ }
}