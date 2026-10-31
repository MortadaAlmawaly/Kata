/* إدارة المستخدمين والهرم.
   - من يدير: صاحب صلاحية users.manage (افتراضياً مدير إدارة فما فوق) ضمن نطاقه، أو مسؤول النظام على كل الشركة.
   - لا أحد يعطي دوراً مساوياً لدوره أو أعلى منه (المسؤول يُعامل كمستوى 5: لا يمسّ المدير التنفيذي).
   - رئيس كل مستخدم بمستوى أعلى منه (شجرة من أعلى لأسفل) وضمن نطاق من يعدّل. */
const crypto = require('crypto');
const express = require('../express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { need, BCRYPT_ROUNDS } = require('../auth');
const { level, ROLES } = require('../permissions');
const { descendants, ancestors } = require('../hierarchy');
const { audit, notify } = require('../audit');
const { assertSeat } = require('../seats');

const router = express.Router();

const roleSchema = z.enum(ROLES).refine(r => r !== 'CEO', 'لا يمكن إنشاء مدير تنفيذي آخر');
const tempPassword = () => crypto.randomBytes(9).toString('base64url');   // 12 حرف

/* نطاق الإدارة ومستوى المنفّذ: المسؤول يدير كل الشركة بمستوى 5 */
const manageScope = req => (req.can('admin') ? new Set(req.index.users.map(u => u.id)) : req.scope);
const actorLevel = req => (req.can('admin') ? 5 : level(req.user.role));

router.get('/users', async (req, res) => {
  const { index, user, scope } = req;
  const visible = new Set(scope);
  for (const a of ancestors(index, user.id)) visible.add(a.id);
  const manage = req.can('users.manage') || req.can('admin');
  const mscope = manageScope(req);
  const full = req.can('admin') ? new Set(index.users.map(u => u.id)) : visible;
  res.json(index.users.filter(u => full.has(u.id)).map(u => ({
    id: u.id, name: u.name, role: u.role, title: u.title, department: u.department, managerId: u.managerId, active: u.active,
    inScope: scope.has(u.id),
    canManage: manage && mscope.has(u.id) && u.id !== user.id && level(u.role) < actorLevel(req),
    ...(mscope.has(u.id) && manage ? { email: u.email, lastLoginAt: u.lastLoginAt, mustChangePassword: u.mustChangePassword, leaveEntitlement: u.leaveEntitlement, shiftStart: u.shiftStart, shiftEnd: u.shiftEnd } : {}),
  })));
});

function assertManager(req, managerId, role) {
  const m = req.index.byId.get(managerId);
  if (!m || !m.active) throw httpError(400, 'الرئيس المباشر غير موجود أو معطّل');
  if (!manageScope(req).has(managerId)) throw httpError(403, 'الرئيس المباشر خارج نطاقك');
  if (level(m.role) <= level(role)) throw httpError(400, 'الرئيس المباشر لازم يكون بمستوى أعلى من الدور');
}
function assertRoleAllowed(req, role) {
  if (level(role) >= actorLevel(req)) throw httpError(403, 'ما تقدر تعطي دور بمستواك أو أعلى');
}

router.post('/users', need('users.manage'), async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email('بريد غير صالح').max(191),
    role: roleSchema,
    title: z.string().trim().max(80).optional(),
    department: z.string().trim().max(60).optional(),
    managerId: z.number().int().positive(),
    leaveEntitlement: z.number().int().min(0).max(365).optional(),
    shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح').nullable().optional(),
    shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح').nullable().optional(),
  }).parse(req.body);
  assertRoleAllowed(req, data.role);
  assertManager(req, data.managerId, data.role);
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    throw httpError(409, 'هذا البريد مسجّل مسبقاً');
  }
  await assertSeat(req.user.orgId);
  const password = tempPassword();
  const u = await prisma.user.create({
    data: {
      orgId: req.user.orgId, name: data.name, email: data.email, role: data.role,
      title: data.title || null, department: data.department || null, managerId: data.managerId,
      leaveEntitlement: data.leaveEntitlement ?? req.settings.leaveDefault,
      shiftStart: data.shiftStart || null, shiftEnd: data.shiftEnd || null,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), mustChangePassword: true,
    },
  });
  await audit(req, 'user.create', 'user', u.id, { name: u.name, role: u.role, managerId: u.managerId });
  res.status(201).json({ id: u.id, tempPassword: password });   // تظهر مرة وحدة فقط
});

router.patch('/users/:id', need('users.manage'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    title: z.string().trim().max(80).nullable().optional(),
    department: z.string().trim().max(60).nullable().optional(),
    role: roleSchema.optional(),
    managerId: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    leaveEntitlement: z.number().int().min(0).max(365).optional(),
    shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح').nullable().optional(),
    shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح').nullable().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);

  const target = req.index.byId.get(id);
  if (!target || !manageScope(req).has(id)) throw httpError(404, 'المستخدم غير موجود');
  if (id === req.user.id) throw httpError(403, 'ما تقدر تعدّل نفسك من هنا');
  if (level(target.role) >= actorLevel(req)) throw httpError(403, 'ما تقدر تعدّل مستخدم بمستواك أو أعلى');

  if (data.active === true && !target.active) await assertSeat(req.user.orgId);   /* إعادة تفعيل تحتاج مقعداً */
  const role = data.role ?? target.role;
  const managerId = data.managerId ?? target.managerId;
  if (data.role) assertRoleAllowed(req, role);

  if (data.role || data.managerId) {
    assertManager(req, managerId, role);
    if (descendants(req.index, id).has(managerId) || managerId === id) throw httpError(400, 'هذا النقل يسوّي حلقة بالهرم');
    for (const kidId of req.index.kids.get(id) || []) {
      const kid = req.index.byId.get(kidId);
      if (kid.active && level(kid.role) >= level(role)) {
        throw httpError(400, `لا يمكن: ${kid.name} يتبع هذا المستخدم وبمستوى مساوي أو أعلى من الدور الجديد`);
      }
    }
  }
  if (data.active === false) {
    if ((req.index.kids.get(id) || []).some(k => req.index.byId.get(k).active)) {
      throw httpError(400, 'انقل فريق هذا المستخدم لرئيس ثاني قبل تعطيله');
    }
    if (await prisma.request.count({ where: { currentApproverId: id, status: 'PENDING' } })) {
      throw httpError(400, 'عنده طلبات موافقة معلّقة — انتظر أو أعد توجيهها قبل التعطيل');
    }
    if (target.isAdmin) {
      const others = await prisma.user.count({ where: { orgId: req.user.orgId, isAdmin: true, active: true, id: { not: id } } });
      if (!others) throw httpError(400, 'لا يمكن تعطيل آخر مسؤول نظام');
    }
  }

  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.department !== undefined && { department: data.department }),
        ...(data.role && { role: data.role }),
        ...(data.managerId && { managerId: data.managerId }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.leaveEntitlement !== undefined && { leaveEntitlement: data.leaveEntitlement }),
        ...(data.shiftStart !== undefined && { shiftStart: data.shiftStart }),
        ...(data.shiftEnd !== undefined && { shiftEnd: data.shiftEnd }),
      },
    });
    if (data.active === false) await tx.session.deleteMany({ where: { userId: id } });
  });
  await audit(req, 'user.update', 'user', id, data);
  if (data.managerId || data.role) await notify([id], 'تم تحديث موقعك الوظيفي بالهيكل', '#/team', req.user.id);
  res.status(204).end();
});

router.post('/users/:id/reset-password', need('users.manage'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const target = req.index.byId.get(id);
  if (!target || !manageScope(req).has(id) || id === req.user.id) throw httpError(404, 'المستخدم غير موجود');
  if (level(target.role) >= actorLevel(req)) throw httpError(403, 'ما تقدر تعدّل مستخدم بمستواك أو أعلى');
  const password = tempPassword();
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), mustChangePassword: true } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(req, 'user.reset-password', 'user', id);
  res.json({ tempPassword: password });
});

module.exports = router;
