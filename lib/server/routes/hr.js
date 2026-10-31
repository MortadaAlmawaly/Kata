/* الموارد البشرية: تصدير تقرير الحضور والإجازات والرواتب (PDF يُطبع من الواجهة).
   الصلاحية hr.export: المدير التنفيذي افتراضياً، ويمنحها الأدمن لموظف الموارد البشرية.
   الحساب: الراتب الشهري ÷ 30 = أجر اليوم؛ تُخصم أيام الإجازة بدون راتب والغياب بدون إذن (أيام دوام فقط، بعد استبعاد العطل الرسمية). */
const express = require('../express');
const prisma = require('../db');
const { z, toDate, fromDate, httpError } = require('../validate');
const { audit } = require('../audit');
const { metrics } = require('./attendance');

const router = express.Router();
const need = req => { if (!req.can('hr.export')) throw httpError(403, 'هذا التقرير للموارد البشرية والمدير التنفيذي فقط'); };
const num = v => (v == null ? null : Number(v));

/* كل موظفي الشركة (مع الراتب) */
router.get('/hr/people', async (req, res) => {
  need(req);
  const rows = await prisma.user.findMany({
    where: { orgId: req.user.orgId, active: true }, orderBy: { id: 'asc' },
    select: { id: true, name: true, role: true, title: true, department: true, salary: true },
  });
  res.json(rows.map(u => ({ ...u, salary: num(u.salary) })));
});

router.put('/hr/salary/:id', async (req, res) => {
  need(req);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { salary } = z.object({ salary: z.number().min(0).max(1e12).nullable() }).parse(req.body);
  const u = await prisma.user.findFirst({ where: { id, orgId: req.user.orgId }, select: { id: true } });
  if (!u) throw httpError(404, 'الموظف غير موجود');
  await prisma.user.update({ where: { id }, data: { salary } });
  await audit(req, 'hr.salary', 'user', id, {});
  res.status(204).end();
});

const ds = d => d.toISOString().slice(0, 10);

router.get('/hr/report', async (req, res) => {
  need(req);
  const q = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    ids: z.string().regex(/^\d+(,\d+)*$/).optional(),
  }).parse(req.query);
  const [y, m] = q.month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)), endEx = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(endEx.getTime() - 864e5);
  const s = req.settings || {};
  const workDays = Array.isArray(s.workDays) ? s.workDays : [0, 1, 2, 3, 4];
  const types = s.leaveTypes || [];
  const basis = Number((s.payroll || {}).dayBasis) || 30;

  const where = { orgId: req.user.orgId, active: true, ...(q.ids ? { id: { in: q.ids.split(',').map(Number) } } : {}) };
  const users = await prisma.user.findMany({ where, orderBy: { id: 'asc' },
    select: { id: true, name: true, role: true, title: true, department: true, salary: true, shiftStart: true, shiftEnd: true } });
  const ids = users.map(u => u.id);
  const [att, leaves, holidays] = await Promise.all([
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: { gte: start, lt: endEx } }, orderBy: { date: 'asc' } }),
    prisma.request.findMany({ where: { requesterId: { in: ids }, type: 'LEAVE', status: 'APPROVED', startDate: { lte: lastDay }, endDate: { gte: start } },
      select: { requesterId: true, startDate: true, endDate: true, leaveType: true, title: true } }),
    prisma.event.findMany({ where: { orgId: req.user.orgId, type: 'HOLIDAY', startAt: { lt: endEx }, endAt: { gte: start } }, select: { startAt: true, endAt: true } }),
  ]);
  const hol = new Set();
  for (const h of holidays) for (let t = Math.max(h.startAt.getTime(), start.getTime()); t <= Math.min(h.endAt.getTime(), lastDay.getTime()); t += 864e5) hol.add(ds(new Date(t)));
  const now = new Date(); const upto = now < lastDay ? now : lastDay;

  const people = users.map(u => {
    const myAtt = att.filter(a => a.userId === u.id);
    const attBy = new Map(myAtt.map(a => [ds(a.date), a]));
    const myLeaves = leaves.filter(l => l.requesterId === u.id).map(l => {
      const key = l.leaveType || 'annual', t = types.find(x => x.key === key) || { name: 'إجازة', paid: true };
      const from = l.startDate < start ? start : l.startDate, to = l.endDate > lastDay ? lastDay : l.endDate;
      return { key, name: t.name, paid: t.paid !== false, from: ds(from), to: ds(to), title: l.title };
    });
    const leaveOn = d => myLeaves.find(l => d >= l.from && d <= l.to);
    let workdays = 0, present = 0, absent = 0, paidLeave = 0, unpaidLeave = 0, late = 0, overtime = 0, early = 0;
    const days = [];
    for (let t = start.getTime(); t <= lastDay.getTime(); t += 864e5) {
      const dt = new Date(t), d = ds(dt), isWork = workDays.includes(dt.getUTCDay()) && !hol.has(d);
      const a = attBy.get(d), lv = leaveOn(d);
      let status = isWork ? '' : (hol.has(d) ? 'HOLIDAY' : 'OFF'), row = null;
      if (isWork) workdays++;
      if (a) { const mt = metrics(a, { shiftStart: u.shiftStart, shiftEnd: u.shiftEnd }, s); present++; late += mt.lateMin; overtime += mt.overtimeMin; early += mt.earlyMin; status = 'PRESENT';
        row = { checkIn: a.checkIn, checkOut: a.checkOut, lateMin: mt.lateMin, earlyMin: mt.earlyMin, overtimeMin: mt.overtimeMin, workedMin: mt.workedMin }; }
      else if (lv && isWork) { status = lv.paid ? 'LEAVE_PAID' : 'LEAVE_UNPAID'; if (lv.paid) paidLeave++; else unpaidLeave++; }
      else if (isWork && dt <= upto) { status = 'ABSENT'; absent++; }
      days.push({ date: d, status, leave: lv && isWork ? lv.name : null, ...(row || {}) });
    }
    const salary = num(u.salary), daily = salary != null ? salary / basis : null;
    const deductions = [];
    if (daily != null) {
      if (unpaidLeave) deductions.push({ label: 'إجازات بدون راتب', days: unpaidLeave, amount: Math.round(daily * unpaidLeave * 100) / 100 });
      if (absent) deductions.push({ label: 'غياب بدون إذن', days: absent, amount: Math.round(daily * absent * 100) / 100 });
    }
    const totalDeduction = deductions.reduce((a, b) => a + b.amount, 0);
    return {
      id: u.id, name: u.name, title: u.title, department: u.department, role: u.role,
      salary, dailyRate: daily != null ? Math.round(daily * 100) / 100 : null, deductions, totalDeduction, net: salary != null ? Math.round((salary - totalDeduction) * 100) / 100 : null,
      summary: { workdays, present, absent, paidLeave, unpaidLeave, lateMin: late, earlyMin: early, overtimeMin: overtime },
      leaves: myLeaves, days,
    };
  });
  await audit(req, 'hr.report', 'org', req.user.orgId, { month: q.month, count: people.length });
  res.json({ month: q.month, org: { name: req.org ? req.org.name : '', currency: (req.org && req.org.currency) || '' }, generatedAt: new Date().toISOString(), generatedBy: req.user.name, dayBasis: basis, people });
});

module.exports = router;