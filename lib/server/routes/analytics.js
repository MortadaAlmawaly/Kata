/* التحليلات: اتجاهات أسبوعية للمهام والحضور، ومصروفات الأقسام والأشهر، وأيام الإجازة حسب النوع.
   ضمن نطاق المستخدم فقط. تتطلب reports.view. */
const express = require('../express');
const prisma = require('../db');
const { z, fromDate } = require('../validate');
const { need } = require('../auth');
const { daysBetween, metrics } = require('./attendance');

const router = express.Router();

const monday = d => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };

router.get('/analytics', need('reports.view'), async (req, res) => {
  const { weeks } = z.object({ weeks: z.coerce.number().int().min(4).max(26).default(12) }).parse(req.query);
  const ids = [...req.scope].filter(id => req.index.byId.get(id).active);
  const now = new Date();
  const start = monday(new Date(now.getTime() - (weeks - 1) * 7 * 864e5));
  const end = new Date(now.getTime() + 864e5);
  const idx = d => Math.floor((monday(d) - start) / (7 * 864e5));
  const series = Array.from({ length: weeks }, (_, i) => ({
    start: fromDate(new Date(start.getTime() + i * 7 * 864e5)), created: 0, done: 0, late: 0, attendance: 0,
  }));

  const [created, done, att, leaves, spend, users] = await Promise.all([
    prisma.task.findMany({ where: { orgId: req.user.orgId, assigneeId: { in: ids }, createdAt: { gte: start, lt: end } }, select: { createdAt: true } }),
    prisma.task.findMany({ where: { orgId: req.user.orgId, assigneeId: { in: ids }, status: 'DONE', completedAt: { gte: start, lt: end } }, select: { completedAt: true, dueDate: true } }),
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: { gte: start, lt: end } }, select: { userId: true, date: true, checkIn: true, checkOut: true } }),
    prisma.request.findMany({
      where: { orgId: req.user.orgId, type: 'LEAVE', status: 'APPROVED', requesterId: { in: ids }, endDate: { gte: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) } },
      select: { startDate: true, endDate: true, leaveType: true },
    }),
    prisma.request.findMany({
      where: {
        orgId: req.user.orgId, status: 'APPROVED', type: { not: 'LEAVE' }, requesterId: { in: ids },
        decidedAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)) },
      },
      select: { amount: true, decidedAt: true, requesterId: true },
    }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, department: true, shiftStart: true, shiftEnd: true } }),
  ]);

  created.forEach(t => { const i = idx(t.createdAt); if (series[i]) series[i].created++; });
  done.forEach(t => {
    const i = idx(t.completedAt);
    if (!series[i]) return;
    series[i].done++;
    if (t.dueDate && t.completedAt > new Date(t.dueDate.getTime() + 864e5)) series[i].late++;
  });
  const uBy = new Map(users.map(u => [u.id, u]));
  const lateByWeek = Array(weeks).fill(0);
  att.forEach(a => {
    const i = idx(a.date);
    if (!series[i]) return;
    series[i].attendance++;
    if (metrics(a, uBy.get(a.userId) || {}, req.settings).lateMin > 0) lateByWeek[i]++;
  });
  const people = Math.max(1, ids.length), workDays = (req.settings.workDays || [0, 1, 2, 3, 4]).length;
  series.forEach((w, i) => {
    w.attendanceRate = Math.min(100, Math.round((w.attendance / (people * workDays)) * 100));
    w.lateDays = lateByWeek[i];
  });

  /* مصروفات: حسب القسم وحسب الشهر (آخر 6 أشهر) */
  const byDept = new Map(), byMonth = new Map();
  spend.forEach(r => {
    const dep = (uBy.get(r.requesterId) || {}).department || 'بدون قسم';
    const amt = Number(r.amount) || 0;
    byDept.set(dep, (byDept.get(dep) || 0) + amt);
    const k = r.decidedAt.toISOString().slice(0, 7);
    byMonth.set(k, (byMonth.get(k) || 0) + amt);
  });
  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    return d.toISOString().slice(0, 7);
  });

  /* أيام الإجازة حسب النوع بهذه السنة */
  const ys = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), ye = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
  const leaveBy = {};
  leaves.forEach(l => {
    const k = l.leaveType || 'annual';
    leaveBy[k] = (leaveBy[k] || 0) + daysBetween(l.startDate < ys ? ys : l.startDate, l.endDate > ye ? ye : l.endDate);
  });
  const typeName = Object.fromEntries((req.settings.leaveTypes || []).map(t => [t.key, t.name]));

  res.json({
    weeks: series,
    spendByDept: [...byDept.entries()].map(([department, total]) => ({ department, total })).sort((a, b) => b.total - a.total),
    spendByMonth: monthKeys.map(m => ({ month: m, total: byMonth.get(m) || 0 })),
    leaveByType: Object.entries(leaveBy).map(([key, days]) => ({ key, name: typeName[key] || key, days })),
    people: ids.length,
  });
});

module.exports = router;
