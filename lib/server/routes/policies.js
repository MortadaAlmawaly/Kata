/* سياسات وملفات الشركة (مكتبة مستندات):
   - يراها كل موظفي الشركة. النشر/التعديل بصلاحية policies.manage.
   - «إقرار» (قرأت وفهمت) لكل نسخة: تعديل النص يرفع version فيُطلب إقرار جديد من الجميع.
   - المرفقات (PDF/صور) عبر نظام المرفقات (entity = policy).
   - من يملك policies.manage يرى من أقرّ ومن لم يقرّ. */
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { need } = require('../auth');
const { audit, notify } = require('../audit');

const router = express.Router();
const author = { select: { id: true, name: true } };

const body = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(140),
  category: z.string().trim().max(40).nullable().optional(),
  body: z.string().trim().min(1, 'النص مطلوب').max(20000),
  requireAck: z.boolean().default(true),
});

router.get('/policies', async (req, res) => {
  const [list, myAcks, ackCounts] = await Promise.all([
    prisma.policy.findMany({ where: { orgId: req.user.orgId }, include: { author }, orderBy: [{ category: 'asc' }, { title: 'asc' }] }),
    prisma.policyAck.findMany({ where: { userId: req.user.id }, select: { policyId: true, version: true } }),
    prisma.policyAck.groupBy({ by: ['policyId', 'version'], _count: true, where: { policy: { orgId: req.user.orgId } } }),
  ]);
  const mine = new Set(myAcks.map(a => a.policyId + ':' + a.version));
  const total = req.index.users.filter(u => u.active).length;
  const manage = req.can('policies.manage');
  res.json(list.map(p => ({
    id: p.id, title: p.title, category: p.category, version: p.version, requireAck: p.requireAck,
    updatedAt: p.updatedAt, author: p.author,
    acknowledged: mine.has(p.id + ':' + p.version),
    ...(manage && p.requireAck ? {
      ackCount: (ackCounts.find(a => a.policyId === p.id && a.version === p.version) || { _count: 0 })._count, totalUsers: total,
    } : {}),
  })));
});

router.get('/policies/summary', async (req, res) => {
  const [list, mine] = await Promise.all([
    prisma.policy.findMany({ where: { orgId: req.user.orgId, requireAck: true }, select: { id: true, version: true } }),
    prisma.policyAck.findMany({ where: { userId: req.user.id }, select: { policyId: true, version: true } }),
  ]);
  const have = new Set(mine.map(a => a.policyId + ':' + a.version));
  res.json({ pending: list.filter(p => !have.has(p.id + ':' + p.version)).length });
});

router.get('/policies/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const p = await prisma.policy.findFirst({ where: { id, orgId: req.user.orgId }, include: { author } });
  if (!p) throw httpError(404, 'السياسة غير موجودة');
  const acks = await prisma.policyAck.findMany({ where: { policyId: id, version: p.version }, select: { userId: true, at: true } });
  const ackBy = new Map(acks.map(a => [a.userId, a.at]));
  const out = {
    id: p.id, title: p.title, category: p.category, body: p.body, version: p.version, requireAck: p.requireAck,
    updatedAt: p.updatedAt, createdAt: p.createdAt, author: p.author,
    acknowledged: ackBy.has(req.user.id), acknowledgedAt: ackBy.get(req.user.id) || null,
    canManage: req.can('policies.manage'),
  };
  if (out.canManage && p.requireAck) {
    out.people = req.index.users.filter(u => u.active).map(u => ({
      id: u.id, name: u.name, role: u.role, department: u.department, at: ackBy.get(u.id) || null,
    }));
  }
  res.json(out);
});

router.post('/policies', need('policies.manage'), async (req, res) => {
  const d = body.parse(req.body);
  const p = await prisma.policy.create({
    data: { orgId: req.user.orgId, authorId: req.user.id, title: d.title, category: d.category || null, body: d.body, requireAck: d.requireAck },
  });
  if (d.requireAck) {
    await notify(req.index.users.filter(u => u.active).map(u => u.id), `سياسة جديدة تحتاج إقرارك: ${p.title}`, '#/policies', req.user.id, 'ANNOUNCEMENT', req.user.name);
  }
  await audit(req, 'policy.create', 'policy', p.id, { title: p.title });
  res.status(201).json({ id: p.id });
});

router.patch('/policies/:id', need('policies.manage'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = body.partial().parse(req.body);
  const p = await prisma.policy.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!p) throw httpError(404, 'السياسة غير موجودة');
  const changed = d.body !== undefined && d.body !== p.body;
  await prisma.policy.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.category !== undefined && { category: d.category }),
      ...(d.body !== undefined && { body: d.body }),
      ...(d.requireAck !== undefined && { requireAck: d.requireAck }),
      ...(changed && { version: { increment: 1 } }),
    },
  });
  if (changed && (d.requireAck ?? p.requireAck)) {
    await notify(req.index.users.filter(u => u.active).map(u => u.id), `تم تحديث السياسة وتحتاج إقراراً جديداً: ${d.title || p.title}`, '#/policies', req.user.id, 'ANNOUNCEMENT', req.user.name);
  }
  await audit(req, 'policy.update', 'policy', id, { versionBumped: changed });
  res.status(204).end();
});

router.delete('/policies/:id', need('policies.manage'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.policy.deleteMany({ where: { id, orgId: req.user.orgId } });
  if (!r.count) throw httpError(404, 'السياسة غير موجودة');
  await audit(req, 'policy.delete', 'policy', id);
  res.status(204).end();
});

router.post('/policies/:id/ack', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const p = await prisma.policy.findFirst({ where: { id, orgId: req.user.orgId }, select: { version: true } });
  if (!p) throw httpError(404, 'السياسة غير موجودة');
  await prisma.policyAck.upsert({
    where: { policyId_userId_version: { policyId: id, userId: req.user.id, version: p.version } },
    create: { policyId: id, userId: req.user.id, version: p.version }, update: {},
  });
  res.status(204).end();
});

module.exports = router;
