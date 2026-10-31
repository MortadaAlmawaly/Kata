/* تقييم الأداء الدوري.
   - مدير الموظف (أي من يقع الموظف ضمن نطاقه ويملك team.view) يفتح تقييماً لفترة (2026-Q4 / 2026-H1 / 2026-FY).
   - يُحرَّر كمسودّة (لا يراها الموظف) ثم يُرسَل؛ الموظف يطّلع، يقرّ، ويضيف تعليقه.
   - يعرض مع التقييم إحصاءات آلية من النظام للفترة (مهام، التزام بالموعد، أهداف، حضور) لتكون المراجعة مبنية على أرقام. */
const express = require('../express');
const prisma = require('../db');
const { z, idParam, toDate, fromDate, httpError } = require('../validate');
const { need } = require('../auth');
const { audit, notify } = require('../audit');
const { metrics } = require('./attendance');

const router = express.Router();
const CYCLE = /^\d{4}-(Q[1-4]|H[12]|FY)$/;
const RATING_KEYS = ['quality', 'delivery', 'teamwork', 'initiative', 'communication'];
const person = { select: { id: true, name: true, role: true, title: true } };

function cycleRange(cycle) {
  const [y, k] = [+cycle.slice(0, 4), cycle.slice(5)];
  let s, e;
  if (k.startsWith('Q')) { const q = +k[1]; s = Date.UTC(y, (q - 1) * 3, 1); e = Date.UTC(y, q * 3, 1); }
  else if (k.startsWith('H')) { const h = +k[1]; s = Date.UTC(y, (h - 1) * 6, 1); e = Date.UTC(y, h * 6, 1); }
  else { s = Date.UTC(y, 0, 1); e = Date.UTC(y + 1, 0, 1); }
  return { from: new Date(s), to: new Date(e) };
}

/* أرقام الفترة للموظف من بيانات النظام */
async function cycleStats(employeeId, cycle, settings) {
  const { from, to } = cycleRange(cycle);
  const [done, openOverdue, goals, att, user] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: employeeId, status: 'DONE', completedAt: { gte: from, lt: to } }, select: { dueDate: true, completedAt: true } }),
    prisma.task.count({ where: { assigneeId: employeeId, status: { not: 'DONE' }, dueDate: { lt: new Date() } } }),
    prisma.goal.findMany({ where: { ownerId: employeeId, period: cycle }, include: { keyResults: true } }),
    prisma.attendance.findMany({ where: { userId: employeeId, date: { gte: from, lt: to } } }),
    prisma.user.findUnique({ where: { id: employeeId }, select: { shiftStart: true, shiftEnd: true } }),
  ]);
  const onTime = done.filter(t => !t.dueDate || t.completedAt <= new Date(t.dueDate.getTime() + 864e5)).length;
  const gp = goals.map(g => g.keyResults.length
    ? g.keyResults.reduce((s, k) => s + Math.min(Number(k.current) / Number(k.target), 1), 0) / g.keyResults.length * 100 : 0);
  const mets = att.map(a => metrics(a, user || {}, settings));
  return {
    tasksDone: done.length,
    onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null,
    overdueOpen: openOverdue,
    goals: goals.length,
    goalProgress: gp.length ? Math.round(gp.reduce((a, b) => a + b, 0) / gp.length) : null,
    attendanceDays: att.length,
    lateDays: mets.filter(m => m.lateMin > 0).length,
    overtimeHours: Math.round(mets.reduce((s, m) => s + m.overtimeMin, 0) / 6) / 10,
  };
}

const reviewJSON = r => ({
  id: r.id, cycle: r.cycle, status: r.status, overall: r.overall,
  employee: r.employee, reviewer: r.reviewer,
  submittedAt: r.submittedAt, acknowledgedAt: r.acknowledgedAt,
});

function canSee(req, r) {
  if (r.reviewerId === req.user.id) return true;
  if (r.status === 'DRAFT') return false;
  return r.employeeId === req.user.id || req.scope.has(r.employeeId);
}

router.get('/reviews', async (req, res) => {
  const q = z.object({ box: z.enum(['mine', 'given', 'team']).default('mine'), cycle: z.string().regex(CYCLE).optional() }).parse(req.query);
  const me = req.user.id;
  const where = { orgId: req.user.orgId, ...(q.cycle && { cycle: q.cycle }) };
  if (q.box === 'mine') Object.assign(where, { employeeId: me, status: { not: 'DRAFT' } });
  else if (q.box === 'given') where.reviewerId = me;
  else Object.assign(where, { employeeId: { in: [...req.scope].filter(id => id !== me) }, status: { not: 'DRAFT' } });
  const list = await prisma.review.findMany({
    where, include: { employee: person, reviewer: person }, orderBy: [{ cycle: 'desc' }, { id: 'desc' }], take: 200,
  });
  res.json(list.map(reviewJSON));
});

router.get('/reviews/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.review.findFirst({ where: { id, orgId: req.user.orgId }, include: { employee: person, reviewer: person } });
  if (!r || !canSee(req, r)) throw httpError(404, 'التقييم غير موجود');
  res.json({
    ...reviewJSON(r),
    ratings: r.ratings || {}, strengths: r.strengths, improvements: r.improvements, nextGoals: r.nextGoals,
    employeeComment: r.employeeComment,
    stats: await cycleStats(r.employeeId, r.cycle, req.settings),
    canEdit: r.reviewerId === req.user.id && r.status !== 'ACKNOWLEDGED',
    canAcknowledge: r.employeeId === req.user.id && r.status === 'SUBMITTED',
  });
});

router.post('/reviews', need('team.view'), async (req, res) => {
  const d = z.object({ employeeId: z.number().int().positive(), cycle: z.string().regex(CYCLE, 'فترة التقييم مثل 2026-Q4') }).parse(req.body);
  const emp = req.index.byId.get(d.employeeId);
  if (!emp || !emp.active || !req.scope.has(d.employeeId) || d.employeeId === req.user.id) throw httpError(403, 'تقدر تقيّم من تحتك فقط');
  const exists = await prisma.review.findUnique({ where: { orgId_cycle_employeeId: { orgId: req.user.orgId, cycle: d.cycle, employeeId: d.employeeId } } });
  if (exists) return res.status(200).json({ id: exists.id, existing: true });
  const r = await prisma.review.create({ data: { orgId: req.user.orgId, cycle: d.cycle, employeeId: d.employeeId, reviewerId: req.user.id } });
  await audit(req, 'review.create', 'review', r.id, { cycle: d.cycle, employeeId: d.employeeId });
  res.status(201).json({ id: r.id });
});

router.patch('/reviews/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({
    ratings: z.record(z.enum(RATING_KEYS), z.number().int().min(1).max(5)).optional(),
    overall: z.number().int().min(1).max(5).nullable().optional(),
    strengths: z.string().trim().max(3000).nullable().optional(),
    improvements: z.string().trim().max(3000).nullable().optional(),
    nextGoals: z.string().trim().max(3000).nullable().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const r = await prisma.review.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!r || r.reviewerId !== req.user.id) throw httpError(404, 'التقييم غير موجود');
  if (r.status === 'ACKNOWLEDGED') throw httpError(409, 'تم إقرار التقييم من الموظف ولا يمكن تعديله');
  await prisma.review.update({ where: { id }, data: d });
  res.status(204).end();
});

router.post('/reviews/:id/submit', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.review.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!r || r.reviewerId !== req.user.id) throw httpError(404, 'التقييم غير موجود');
  if (r.status !== 'DRAFT') throw httpError(409, 'التقييم مُرسَل مسبقاً');
  if (!r.overall || !r.ratings || RATING_KEYS.some(k => !r.ratings[k])) throw httpError(400, 'أكمل كل معايير التقييم والتقييم العام قبل الإرسال');
  await prisma.review.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await notify([r.employeeId], `تقييم أدائك لفترة ${r.cycle} جاهز للاطّلاع`, '#/reviews', req.user.id, 'TASK', req.user.name);
  await audit(req, 'review.submit', 'review', id);
  res.status(204).end();
});

router.post('/reviews/:id/acknowledge', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { comment } = z.object({ comment: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
  const r = await prisma.review.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!r || r.employeeId !== req.user.id) throw httpError(404, 'التقييم غير موجود');
  if (r.status !== 'SUBMITTED') throw httpError(409, 'لا يمكن الإقرار الآن');
  await prisma.review.update({ where: { id }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), employeeComment: comment || null } });
  await notify([r.reviewerId], `${req.user.name} اطّلع على تقييمه لفترة ${r.cycle}${comment ? ' وأضاف تعليقاً' : ''}`, '#/reviews', req.user.id, 'TASK', req.user.name);
  res.status(204).end();
});

router.delete('/reviews/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.review.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!r || r.reviewerId !== req.user.id) throw httpError(404, 'التقييم غير موجود');
  if (r.status !== 'DRAFT') throw httpError(409, 'لا يُحذف تقييم مُرسَل');
  await prisma.review.delete({ where: { id } });
  res.status(204).end();
});

module.exports = router;
