/* حد عدد المستخدمين لكل شركة (Organization.maxUsers). null = بلا حد.
   يُحسب المستخدمون الفعّالون + الدعوات السارية، حتى لا تُصدَر دعوات أكثر من المقاعد المتاحة.
   يضبطه مالك المنصة من «الشركات (المنصة)». تقليص الحد لا يحذف أحداً: يمنع الإضافة فقط حتى ينزل العدد. */
const prisma = require('./db');
const { httpError } = require('./validate');

async function seatInfo(orgId) {
  const [org, users, pending] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { maxUsers: true } }),
    prisma.user.count({ where: { orgId, active: true } }),
    prisma.invitation.count({ where: { orgId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
  ]);
  return { max: org ? org.maxUsers : null, users, pending };
}

/* extra = كم مقعداً نريد؛ countPending=false عند قبول دعوة (مقعدها محجوز أصلاً) */
async function assertSeat(orgId, { extra = 1, countPending = true } = {}) {
  const s = await seatInfo(orgId);
  if (s.max == null) return;
  const used = s.users + (countPending ? s.pending : 0);
  if (used + extra > s.max) {
    throw httpError(409, `وصلت الشركة للحد الأقصى من المستخدمين (${s.max}). عطّل مستخدماً أو تواصل مع مزوّد المنصة لزيادة العدد.`);
  }
}

module.exports = { seatInfo, assertSeat };
