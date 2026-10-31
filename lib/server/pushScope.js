/* P1: حذف اشتراك Web Push مالت المستخدم نفسه بس.
   الاشتراك ينحذف إذا: userId مالته = صاحب الجلسة، والـ endpoint نفسه، وشركة صاحب الاشتراك = شركة الجلسة.
   ملف نقي (ما يحتاج Prisma ولا web-push) حتى ينختبر بـ db وهمي. */
const crypto = require('crypto');

const MAX_ENDPOINT = 2000;
const endpointHash = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex');

function cleanEndpoint(endpoint) {
  if (typeof endpoint !== 'string') return null;
  const e = endpoint.trim();
  return e && e.length <= MAX_ENDPOINT ? e : null;
}

/* شرط الحذف: مقيّد بالمستخدم والشركة والـ endpoint. يرجّع null إذا أي قيمة ناقصة (ماكو حذف). */
function ownSubscriptionWhere(owner, endpoint) {
  const e = cleanEndpoint(endpoint);
  if (!owner || !Number.isInteger(owner.userId) || !Number.isInteger(owner.orgId) || !e) return null;
  return { userId: owner.userId, endpointHash: endpointHash(e), user: { orgId: owner.orgId } };
}

async function deleteOwnSubscription(db, owner, endpoint) {
  const where = ownSubscriptionWhere(owner, endpoint);
  if (!where) return { count: 0 };
  return db.pushSubscription.deleteMany({ where });
}

/* عند تسجيل الخروج: نعرف المستخدم من الجلسة نفسها (قبل ما تنحذف)، مو من أي قيمة يرسلها العميل. */
async function removeSubscriptionOnLogout(db, sessionId, endpoint) {
  if (!sessionId || !cleanEndpoint(endpoint)) return { count: 0 };
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: { select: { id: true, orgId: true } } } });
  if (!session || !session.user) return { count: 0 };
  return deleteOwnSubscription(db, { userId: session.user.id, orgId: session.user.orgId }, endpoint);
}

module.exports = { endpointHash, ownSubscriptionWhere, deleteOwnSubscription, removeSubscriptionOnLogout, MAX_ENDPOINT };