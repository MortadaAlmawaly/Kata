/* Web Push للهواتف/المتصفحات: يوصل الإشعار حتى لو التطبيق مسكّر.
   P2: مفاتيح VAPID من البيئة (VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT). التفاصيل بـ vapidConfig.js.
   الإعداد ينقرا أول مرة ينحتاج (مو وقت التحميل) حتى ما يأثر على next build؛ فحص التشغيل بـ instrumentation.js. */
const crypto = require('crypto');
const webpush = require('web-push');
const prisma = require('./db');
const { resolveVapid } = require('./vapidConfig');

let cached;   // undefined = بعد ما انقرا، null = مطفي
function config() {
  if (cached === undefined) cached = resolveVapid(process.env);   // بالإنتاج يرمي خطأ واضح إذا ناقص
  return cached;
}
const hash = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex');

async function subscribe(userId, sub) {
  await prisma.pushSubscription.upsert({
    where: { endpointHash: hash(sub.endpoint) },
    create: { userId, endpointHash: hash(sub.endpoint), endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}
/* P1: الحذف مقيّد بالمستخدم وشركته والـ endpoint */
const { deleteOwnSubscription } = require('./pushScope');
const unsubscribe = (userId, endpoint, orgId) => deleteOwnSubscription(prisma, { userId, orgId }, endpoint);

/* يرسل لكل أجهزة المستخدمين. لا يرمي أخطاء. الاشتراكات المنتهية تُحذف. */
async function sendToUsers(userIds, payload) {
  if (!userIds.length) return;
  try {
    const keys = config();
    if (!keys) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const body = JSON.stringify(payload);
    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
          { TTL: 60 * 60 * 12, vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey } },
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error('push failed:', err.statusCode || '', err.message);
      }
    }));
  } catch (e) { console.error('push error:', e.message); }
}

module.exports = { publicKey: () => { const k = config(); return k ? k.publicKey : null; }, subscribe, unsubscribe, sendToUsers };
