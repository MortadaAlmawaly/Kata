/* السباقات (Sprints) — على طريقة Jira:
   PLANNED (مخطَّط) ← ACTIVE (جارٍ، واحد فقط لكل مشروع) ← CLOSED (مغلق).
   عند إغلاق السباق تنتقل المهام غير المنتهية إلى سباق آخر أو إلى الـ Backlog.
   الإنشاء والإدارة: من لديه رؤية الفريق (مدير قسم فما فوق). */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, idParam, toDate, fromDate, httpError } = require('../validate');
const { audit } = require('../audit');
const { logChanges } = require('../issues');

const router = express.Router();

const sprintJSON = (s, agg) => ({
  id: s.id, name: s.name, goal: s.goal, state: s.state, projectId: s.projectId,
  startDate: fromDate(s.startDate), endDate: fromDate(s.endDate), closedAt: s.closedAt,
  tasks: agg ? agg.tasks : undefined, done: agg ? agg.done : undefined,
  points: agg ? agg.points : undefined, pointsDone: agg ? agg.pointsDone : undefined,
});
const need = req => { if (!req.can('team.view')) throw httpError(403, 'ليست لديك صلاحية لهذا الإجراء'); };

router.get('/sprints', async (req, res) => {
  const q = z.object({ projectId: z.coerce.number().int().positive().optional(), state: z.enum(['PLANNED', 'ACTIVE', 'CLOSED']).optional() }).parse(req.query);
  const list = await prisma.sprint.findMany({
    where: { orgId: req.user.orgId, ...(q.projectId !== undefined && { projectId: q.projectId }), ...(q.state && { state: q.state }) },
    orderBy: [{ state: 'asc' }, { id: 'desc' }], take: 100,
  });
  const ids = list.map(s => s.id);
  const rows = ids.length ? await prisma.task.findMany({ where: { sprintId: { in: ids } }, select: { sprintId: true, status: true, storyPoints: true } }) : [];
  const agg = new Map();
  rows.forEach(r => {
    const a = agg.get(r.sprintId) || { tasks: 0, done: 0, points: 0, pointsDone: 0 };
    a.tasks++; a.points += r.storyPoints || 0;
    if (r.status === 'DONE') { a.done++; a.pointsDone += r.storyPoints || 0; }
    agg.set(r.sprintId, a);
  });
  res.json(list.map(s => sprintJSON(s, agg.get(s.id) || { tasks: 0, done: 0, points: 0, pointsDone: 0 })));
});

const body = z.object({
  name: z.string().trim().min(1, 'اسم السباق مطلوب').max(80),
  goal: z.string().trim().max(255).nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  startDate: dateStr.nullable().optional(),
  endDate: dateStr.nullable().optional(),
});

router.post('/sprints', async (req, res) => {
  need(req);
  const d = body.parse(req.body);
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw httpError(400, 'نهاية السباق قبل بدايته');
  if (d.projectId) {
    const p = await prisma.project.findFirst({ where: { id: d.projectId, orgId: req.user.orgId }, select: { id: true } });
    if (!p) throw httpError(400, 'المساحة غير موجودة');
  }
  const s = await prisma.sprint.create({
    data: { orgId: req.user.orgId, projectId: d.projectId || null, name: d.name, goal: d.goal || null,
      startDate: d.startDate ? toDate(d.startDate) : null, endDate: d.endDate ? toDate(d.endDate) : null },
  });
  await audit(req, 'sprint.create', 'sprint', s.id, { name: s.name });
  res.status(201).json({ id: s.id });
});

router.patch('/sprints/:id', async (req, res) => {
  need(req);
  const id = idParam.parse(req.params.id);
  const d = body.partial().extend({
    action: z.enum(['start', 'complete']).optional(),
    moveTo: z.number().int().positive().nullable().optional(),   // عند الإغلاق: سباق آخر أو null = Backlog
  }).parse(req.body);
  const s = await prisma.sprint.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!s) throw httpError(404, 'السباق غير موجود');
  const data = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.goal !== undefined) data.goal = d.goal;
  if (d.startDate !== undefined) data.startDate = d.startDate ? toDate(d.startDate) : null;
  if (d.endDate !== undefined) data.endDate = d.endDate ? toDate(d.endDate) : null;

  if (d.action === 'start') {
    if (s.state !== 'PLANNED') throw httpError(409, 'السباق ليس بحالة تخطيط');
    const active = await prisma.sprint.findFirst({ where: { orgId: s.orgId, projectId: s.projectId, state: 'ACTIVE' }, select: { name: true } });
    if (active) throw httpError(409, `يوجد سباق جارٍ: «${active.name}» — أغلقه أولاً`);
    data.state = 'ACTIVE';
    if (!data.startDate && !s.startDate) data.startDate = toDate(fromDate(new Date()));
  }
  if (d.action === 'complete') {
    if (s.state !== 'ACTIVE') throw httpError(409, 'السباق غير جارٍ');
    if (d.moveTo) {
      const t = await prisma.sprint.findFirst({ where: { id: d.moveTo, orgId: s.orgId, state: { not: 'CLOSED' } }, select: { id: true } });
      if (!t || t.id === id) throw httpError(400, 'السباق الوجهة غير صالح');
    }
    const open = await prisma.task.findMany({ where: { sprintId: id, status: { not: 'DONE' } }, select: { id: true } });
    if (open.length) {
      await prisma.task.updateMany({ where: { id: { in: open.map(t => t.id) } }, data: { sprintId: d.moveTo || null } });
      await Promise.all(open.map(t => logChanges(t.id, req.user.id, [{ field: 'sprint', from: s.name, to: d.moveTo ? '(سباق تالٍ)' : 'Backlog' }])));
    }
    data.state = 'CLOSED'; data.closedAt = new Date();
  }
  if (!Object.keys(data).length) throw httpError(400, 'لا يوجد شيء للتحديث');
  await prisma.sprint.update({ where: { id }, data });
  await audit(req, 'sprint.update', 'sprint', id, d.action || Object.keys(data));
  res.status(204).end();
});

router.delete('/sprints/:id', async (req, res) => {
  need(req);
  const id = idParam.parse(req.params.id);
  const s = await prisma.sprint.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!s) throw httpError(404, 'السباق غير موجود');
  if (s.state === 'ACTIVE') throw httpError(409, 'أغلق السباق الجاري أولاً');
  await prisma.sprint.delete({ where: { id } });   // المهام ترجع للـ Backlog (SetNull)
  await audit(req, 'sprint.delete', 'sprint', id, { name: s.name });
  res.status(204).end();
});

module.exports = router;
