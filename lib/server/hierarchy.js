/* أدوات الشجرة الهرمية. الشركة بالعادة بضعة مئات مستخدم، فنحمّلها بالذاكرة لكل طلب. */
const prisma = require('./db');

const USER_FIELDS = {
  id: true, name: true, email: true, role: true, title: true, department: true, managerId: true,
  active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, leaveEntitlement: true, shiftStart: true, shiftEnd: true,
};

async function loadIndex(orgId) {
  const users = await prisma.user.findMany({ where: { orgId }, select: USER_FIELDS, orderBy: { id: 'asc' } });
  const byId = new Map();
  const kids = new Map();
  for (const u of users) {
    byId.set(u.id, u);
    if (u.managerId) {
      if (!kids.has(u.managerId)) kids.set(u.managerId, []);
      kids.get(u.managerId).push(u.id);
    }
  }
  return { users, byId, kids };
}

/* كل من تحت userId بأي عمق (بدون userId نفسه) */
function descendants(index, userId) {
  const out = new Set();
  const stack = [userId];
  while (stack.length) {
    for (const c of index.kids.get(stack.pop()) || []) {
      if (!out.has(c)) { out.add(c); stack.push(c); }
    }
  }
  return out;
}

/* سلسلة الرؤساء من الأقرب للأبعد */
function ancestors(index, userId) {
  const out = [];
  const seen = new Set([userId]);
  let cur = index.byId.get(userId);
  while (cur && cur.managerId && !seen.has(cur.managerId)) {
    seen.add(cur.managerId);
    cur = index.byId.get(cur.managerId);
    if (cur) out.push(cur);
  }
  return out;
}

/* النطاق: النفس + كل من تحتي. المدير التنفيذي = كل الشركة. */
function scopeOf(index, user) {
  if (user.role === 'CEO') return new Set(index.users.map(u => u.id));
  const s = descendants(index, user.id);
  s.add(user.id);
  return s;
}

const nearestActiveAncestor = (index, userId) => ancestors(index, userId).find(u => u.active) || null;

module.exports = { USER_FIELDS, loadIndex, descendants, ancestors, scopeOf, nearestActiveAncestor };
