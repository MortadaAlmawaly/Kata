/* التقارير: أداء كل شخص ضمن نطاقي لفترة محددة. مدير قسم فما فوق. الواجهة تصدّرها CSV. */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, toDate, fromDate, httpError, num } = require('../validate');
const { need } = require('../auth');
const { daysBetween } = require('./attendance');

const router = express.Router();

router.get('/reports/performance', need('reports.view'), async (req, res) => {
  const q = z.object({ from: dateStr, to: dateStr }).parse(req.query);
  if (q.to < q.from || (toDate(q.to) - toDate(q.from)) / 864e5 > 366) throw httpError(400, 'نطاق التواريخ غير صالح');
  const from = toDate(q.from);
  const toEnd = new Date(toDate(q.to).getTime() + 864e5);
  const todayD = toDate(fromDate(new Date()));
  const ids = [...req.scope].filter(id => req.index.byId.get(id).active);

  const [tasks, reqs, att] = await Promise.all([
    prisma.task.findMany({
      where: {
        orgId: req.user.orgId, assigneeId: { in: ids },
        OR: [{ createdAt: { gte: from, lt: toEnd } }, { completedAt: { gte: from, lt: toEnd } }, { status: { not: 'DONE' } }],
      },
      select: { assigneeId: true, status: true, dueDate: true, createdAt: true, completedAt: true },
    }),
    prisma.request.findMany({
      where: { orgId: req.user.orgId, requesterId: { in: ids }, createdAt: { gte: from, lt: toEnd } },
      select: { requesterId: true, type: true, status: true, amount: true, startDate: true, endDate: true },
    }),
    prisma.attendance.groupBy({
      by: ['userId'], where: { userId: { in: ids }, date: { gte: from, lt: toEnd } }, _count: true,
    }),
  ]);
  const attBy = new Map(att.map(a => [a.userId, a._count]));
  const inRange = d => d && d >= from && d < toEnd;

  const rows = ids.map(id => {
    const u = req.index.byId.get(id);
    const my = tasks.filter(t => t.assigneeId === id);
    const done = my.filter(t => t.status === 'DONE' && inRange(t.completedAt));
    const open = my.filter(t => t.status !== 'DONE');
    const days = done.map(t => (t.completedAt - t.createdAt) / 864e5);
    const myReq = reqs.filter(r => r.requesterId === id);
    const spend = myReq.filter(r => r.status === 'APPROVED' && r.type !== 'LEAVE').reduce((s, r) => s + (num(r.amount) || 0), 0);
    const leaveDays = myReq.filter(r => r.status === 'APPROVED' && r.type === 'LEAVE').reduce((s, r) => s + daysBetween(r.startDate, r.endDate), 0);
    return {
      id, name: u.name, role: u.role, title: u.title, department: u.department || null,
      tasksDone: done.length,
      tasksOpen: open.length,
      tasksOverdue: open.filter(t => t.dueDate && t.dueDate < todayD).length,
      avgDaysToDone: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      onTimeRate: done.length ? Math.round((done.filter(t => !t.dueDate || t.completedAt <= new Date(t.dueDate.getTime() + 864e5)).length / done.length) * 100) : null,
      requests: myReq.length,
      approvedSpend: spend,
      leaveDays,
      attendanceDays: attBy.get(id) || 0,
    };
  });
  res.json({ from: q.from, to: q.to, rows });
});

module.exports = router;
