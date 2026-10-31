/* الأهداف (OKR): هدف + نتائج رئيسية قابلة للقياس + مواءمة مع هدف أعلى.
   - أي مستخدم يضع أهدافاً لنفسه؛ من مستوى مدير قسم فما فوق يضع أهدافاً لمن تحته.
   - يرى المستخدم أهداف نطاقه + أهداف رؤسائه (حتى يعرف شنو يخدم)، لكنه لا يعدّل أهداف رؤسائه.
   - تحديث النتائج الرئيسية: صاحب الهدف أو رئيسه (أي أحد يملك الهدف ضمن نطاقه). */
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { ancestors } = require('../hierarchy');
const { level } = require('../permissions');
const { audit, notify } = require('../audit');

const router = express.Router();

const owner = { select: { id: true, name: true, role: true } };
const amount = z.number().min(0).max(999999999999);
const krInput = z.object({
  title: z.string().trim().min(1).max(140),
  target: amount.refine(n => n > 0, 'الهدف الرقمي لازم أكبر من صفر'),
  current: amount.optional(),
  unit: z.string().trim().max(16).nullable().optional(),
});

function progressOf(krs) {
  if (!krs.length) return 0;
  const sum = krs.reduce((s, k) => s + Math.min(Number(k.current) / Number(k.target), 1), 0);
  return Math.round((sum / krs.length) * 100);
}
const goalJSON = (g, editable) => ({
  id: g.id, title: g.title, description: g.description, period: g.period, status: g.status,
  parentId: g.parentId, owner: g.owner, editable,
  progress: progressOf(g.keyResults),
  keyResults: g.keyResults.map(k => ({ id: k.id, title: k.title, target: Number(k.target), current: Number(k.current), unit: k.unit })),
  tasks: g._count ? g._count.tasks : undefined,
});

router.get('/goals', async (req, res) => {
  const q = z.object({ period: z.string().max(16).optional() }).parse(req.query);
  const ownerIds = new Set(req.scope);
  for (const a of ancestors(req.index, req.user.id)) ownerIds.add(a.id);
  const goals = await prisma.goal.findMany({
    where: { orgId: req.user.orgId, ownerId: { in: [...ownerIds] }, ...(q.period && { period: q.period }) },
    include: { owner, keyResults: { orderBy: { id: 'asc' } }, _count: { select: { tasks: true } } },
    orderBy: [{ period: 'desc' }, { id: 'desc' }],
    take: 300,
  });
  res.json(goals.map(g => goalJSON(g, req.scope.has(g.ownerId))));
});

async function assertParent(req, parentId) {
  if (!parentId) return;
  const p = await prisma.goal.findFirst({ where: { id: parentId, orgId: req.user.orgId }, select: { ownerId: true } });
  if (!p) throw httpError(400, 'الهدف الأعلى غير موجود');
  const visible = req.scope.has(p.ownerId) || ancestors(req.index, req.user.id).some(a => a.id === p.ownerId);
  if (!visible) throw httpError(403, 'الهدف الأعلى خارج نطاقك');
}

router.post('/goals', async (req, res) => {
  const data = z.object({
    title: z.string().trim().min(1, 'العنوان مطلوب').max(140),
    description: z.string().trim().max(4000).nullable().optional(),
    period: z.string().regex(/^\d{4}-(Q[1-4]|H[12]|FY)$/, 'الفترة مثل 2026-Q4'),
    ownerId: z.number().int().positive().optional(),
    parentId: z.number().int().positive().nullable().optional(),
    keyResults: z.array(krInput).max(10).default([]),
  }).parse(req.body);
  const ownerId = data.ownerId ?? req.user.id;
  if (!req.scope.has(ownerId)) throw httpError(403, 'تقدر تضع أهداف لنفسك أو لمن تحتك فقط');
  if (ownerId !== req.user.id && !req.can('goals.cascade')) throw httpError(403, 'ليست لديك صلاحية وضع أهداف للآخرين');
  await assertParent(req, data.parentId);

  const g = await prisma.goal.create({
    data: {
      orgId: req.user.orgId, ownerId, title: data.title, description: data.description || null,
      period: data.period, parentId: data.parentId || null,
      keyResults: { create: data.keyResults.map(k => ({ title: k.title, target: k.target, current: k.current ?? 0, unit: k.unit || null })) },
    },
  });
  if (ownerId !== req.user.id) await notify([ownerId], `${req.user.name} وضع لك هدفاً: ${g.title}`, '#/goals', req.user.id, 'TASK', req.user.name);
  await audit(req, 'goal.create', 'goal', g.id, { ownerId });
  res.status(201).json({ id: g.id });
});

async function ownGoal(req, id) {
  const g = await prisma.goal.findFirst({ where: { id, orgId: req.user.orgId }, select: { id: true, ownerId: true, title: true } });
  if (!g || !req.scope.has(g.ownerId)) throw httpError(404, 'الهدف غير موجود');
  return g;
}

router.patch('/goals/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = z.object({
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    status: z.enum(['ACTIVE', 'ACHIEVED', 'CANCELLED']).optional(),
    parentId: z.number().int().positive().nullable().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  await ownGoal(req, id);
  if (data.parentId) {
    if (data.parentId === id) throw httpError(400, 'الهدف ما يكون أعلى من نفسه');
    await assertParent(req, data.parentId);
  }
  await prisma.goal.update({ where: { id }, data });
  await audit(req, 'goal.update', 'goal', id, Object.keys(data));
  res.status(204).end();
});

router.delete('/goals/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const g = await ownGoal(req, id);
  await prisma.goal.delete({ where: { id } });
  await audit(req, 'goal.delete', 'goal', id, { title: g.title });
  res.status(204).end();
});

/* النتائج الرئيسية */
router.post('/goals/:id/key-results', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = krInput.parse(req.body);
  await ownGoal(req, id);
  if ((await prisma.keyResult.count({ where: { goalId: id } })) >= 10) throw httpError(400, 'الحد الأقصى 10 نتائج رئيسية');
  const k = await prisma.keyResult.create({
    data: { goalId: id, title: data.title, target: data.target, current: data.current ?? 0, unit: data.unit || null },
  });
  res.status(201).json({ id: k.id });
});

router.patch('/key-results/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = z.object({
    title: z.string().trim().min(1).max(140).optional(),
    target: amount.refine(n => n > 0).optional(),
    current: amount.optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const k = await prisma.keyResult.findFirst({ where: { id, goal: { orgId: req.user.orgId } }, include: { goal: { select: { ownerId: true } } } });
  if (!k || !req.scope.has(k.goal.ownerId)) throw httpError(404, 'النتيجة غير موجودة');
  await prisma.keyResult.update({ where: { id }, data });
  res.status(204).end();
});

router.delete('/key-results/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const k = await prisma.keyResult.findFirst({ where: { id, goal: { orgId: req.user.orgId } }, include: { goal: { select: { ownerId: true } } } });
  if (!k || !req.scope.has(k.goal.ownerId)) throw httpError(404, 'النتيجة غير موجودة');
  await prisma.keyResult.delete({ where: { id } });
  res.status(204).end();
});

module.exports = router;
module.exports.progressOf = progressOf;
