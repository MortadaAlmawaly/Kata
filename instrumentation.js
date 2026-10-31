/* P2: فحص عند تشغيل السيرفر (Next.js instrumentation register).
   بالإنتاج: إذا VAPID_PUBLIC_KEY أو VAPID_PRIVATE_KEY أو VAPID_SUBJECT ناقصة أو غلط، تنطبع رسالة واضحة والسيرفر يوقف.
   ما ينطبع أي قيمة، بس أسماء المتغيرات. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertVapidAtStartup } = await import('./lib/server/vapidConfig');
  assertVapidAtStartup(process.env);
}