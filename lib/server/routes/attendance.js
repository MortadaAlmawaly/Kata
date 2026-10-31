/* الحضور والإجازات.
   - تسجيل دخول/خروج يومي، ومقاييس مقابل ساعات الدوام: تأخير · خروج مبكر · إضافي.
   - دوام الشركة من الإعدادات (workStart/workEnd/graceMinutes)، ويمكن تخصيص دوام لكل موظف (shiftStart/shiftEnd).
   - أنواع إجازات متعددة (إعدادات الشركة): لكل نوع رصيد سنوي؛ «السنوية» تأخذ رصيد الموظف الخاص؛ الفارغ = غير محدود.
   - مدير قسم فما فوق (attendance.team): حالة فريقهم اليوم. */
const express = require('../express');
const prisma = require('../db');
const { z, toDate, fromDate, httpError, today } = require('../validate');
const { audit, notify } = require('../audit');

const router = express.Router();

const daysBetween = (a, b) => Math.round((b - a) / 864e5) + 1;   // شامل الطرفين
const hmToMin = hm => { const m = /^(\d{2}):(\d{2})$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };

/* دقائق اليوم المحلية بتوقيت الشركة */
function localMinutes(date, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    return +p.find(x => x.type === 'hour').value * 60 + +p.find(x => x.type === 'minute').value;
  } catch (e) { return date.getUTCHours() * 60 + date.getUTCMinutes(); }
}

/* مقاييس يوم حضور مقابل دوام الموظف (أو الشركة) */
function metrics(rec, user, settings) {
  const start = hmToMin(user.shiftStart) ?? hmToMin(settings.workStart) ?? 510;
  const end = hmToMin(user.shiftEnd) ?? hmToMin(settings.workEnd) ?? 930;
  const grace = settings.graceMinutes ?? 10;
  const inMin = localMinutes(rec.checkIn, settings.timezone);
  const outMin = rec.checkOut ? localMinutes(rec.checkOut, settings.timezone) : null;
  const late = inMin - start;
  return {
    lateMin: late > grace ? late : 0,
    earlyMin: outMin != null && outMin < end ? end - outMin : 0,
    overtimeMin: outMin != null && outMin - end >= 15 ? outMin - end : 0,
    workedMin: rec.checkOut ? Math.max(0, Math.round((rec.checkOut - rec.checkIn) / 60000)) : null,
  };
}

/* أيام الإجازات المعتمدة لمستخدم بسنة معيّنة (ولنوع محدد إن ذُكر؛ الفارغ يُحسب «سنوية») */
async function leaveUsed(userId, year, type) {
  const rows = await prisma.request.findMany({
    where: {
      requesterId: userId, type: 'LEAVE', status: 'APPROVED',
      startDate: { lte: toDate(`${year}-12-31`) }, endDate: { gte: toDate(`${year}-01-01`) },
    },
    select: { startDate: true, endDate: true, leaveType: true },
  });
  const ys = toDate(`${year}-01-01`), ye = toDate(`${year}-12-31`);
  return rows
    .filter(r => !type || (r.leaveType || 'annual') === type)
    .reduce((s, r) => s + daysBetween(r.startDate < ys ? ys : r.startDate, r.endDate > ye ? ye : r.endDate), 0);
}

/* رصيد كل نوع: [{key, name, paid, entitlement|null, used, remaining|null}] */
async function leaveBalances(user, settings, year) {
  const types = settings.leaveTypes || [];
  const rows = await prisma.request.findMany({
    where: {
      requesterId: user.id, type: 'LEAVE', status: 'APPROVED',
      startDate: { lte: toDate(`${year}-12-31`) }, endDate: { gte: toDate(`${year}-01-01`) },
    },
    select: { startDate: true, endDate: true, leaveType: true },
  });
  const ys = toDate(`${year}-01-01`), ye = toDate(`${year}-12-31`);
  const used = {};
  for (const r of rows) {
    const k = r.leaveType || 'annual';
    used[k] = (used[k] || 0) + daysBetween(r.startDate < ys ? ys : r.startDate, r.endDate > ye ? ye : r.endDate);
  }
  return types.map(t => {
    const entitlement = t.key === 'annual' ? user.leaveEntitlement : (t.days == null ? null : t.days);
    const u = used[t.key] || 0;
    return { key: t.key, name: t.name, paid: t.paid !== false, entitlement, used: u, remaining: entitlement == null ? null : entitlement - u };
  });
}

router.get('/leave-balance', async (req, res) => {
  const year = new Date().getUTCFullYear();
  const types = await leaveBalances(req.user, req.settings, year);
  const annual = types.find(t => t.key === 'annual') || { entitlement: req.user.leaveEntitlement, used: 0, remaining: req.user.leaveEntitlement };
  /* الحقول القديمة (entitlement/used/remaining) = السنوية — للتوافق مع لوحة المتابعة */
  res.json({ year, entitlement: annual.entitlement, used: annual.used, remaining: annual.remaining, types });
});

router.get('/attendance/today', async (req, res) => {
  const date = toDate(today(req.query.today));
  const row = await prisma.attendance.findUnique({ where: { userId_date: { userId: req.user.id, date } } });
  res.json({
    date: fromDate(date), checkIn: row ? row.checkIn : null, checkOut: row ? row.checkOut : null,
    ...(row ? metrics(row, req.user, req.settings) : {}),
    shift: { start: req.user.shiftStart || req.settings.workStart, end: req.user.shiftEnd || req.settings.workEnd },
  });
});

router.post('/attendance/check-in', async (req, res) => {
  const { today: t } = z.object({ today: z.string().optional() }).parse(req.body ?? {});
  const date = toDate(today(t));
  const exists = await prisma.attendance.findUnique({ where: { userId_date: { userId: req.user.id, date } } });
  if (exists) throw httpError(409, 'سجّلت حضورك اليوم مسبقاً');
  const rec = await prisma.attendance.create({ data: { userId: req.user.id, date, checkIn: new Date() } });
  res.status(201).json({ checkIn: rec.checkIn, ...metrics(rec, req.user, req.settings) });
});

router.post('/attendance/check-out', async (req, res) => {
  const { today: t } = z.object({ today: z.string().optional() }).parse(req.body ?? {});
  const date = toDate(today(t));
  const r = await prisma.attendance.updateMany({
    where: { userId: req.user.id, date, checkOut: null }, data: { checkOut: new Date() },
  });
  if (!r.count) throw httpError(409, 'لا يوجد حضور مفتوح لتسجيل الخروج');
  res.status(204).end();
});

/* سجل شهر: لي، أو لمن بنطاقي — مع المقاييس */
router.get('/attendance', async (req, res) => {
  const q = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    userId: z.coerce.number().int().positive().optional(),
  }).parse(req.query);
  const userId = q.userId ?? req.user.id;
  if (!req.scope.has(userId)) throw httpError(403, 'خارج نطاقك');
  const target = req.index.byId.get(userId);
  const [y, m] = q.month.split('-').map(Number);
  const rows = await prisma.attendance.findMany({
    where: { userId, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
    orderBy: { date: 'asc' },
  });
  const full = userId === req.user.id ? req.user : await prisma.user.findUnique({ where: { id: userId }, select: { shiftStart: true, shiftEnd: true } });
  res.json(rows.map(r => ({
    date: fromDate(r.date), checkIn: r.checkIn, checkOut: r.checkOut,
    ...metrics(r, { shiftStart: full.shiftStart, shiftEnd: full.shiftEnd, ...target }, req.settings),
  })));
});

/* تعديل حضور موظف من نطاقي (تصحيح نسيان البصمة…): إنشاء أو تعديل سجل يوم. يُسجَّل بالتدقيق ويُبلَّغ الموظف. */
const attParams = z.object({ userId: z.coerce.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const attBody = z.object({
  checkIn: z.string().datetime({ offset: true, message: 'وقت الحضور غير صالح' }),
  checkOut: z.string().datetime({ offset: true, message: 'وقت الخروج غير صالح' }).nullable().optional(),
});
function canEditAttendance(req, userId) {
  if (!req.can('attendance.team')) throw httpError(403, 'ليست لديك صلاحية لهذا الإجراء');
  if (userId === req.user.id) throw httpError(403, 'لا يمكنك تعديل حضورك بنفسك');
  if (!req.scope.has(userId)) throw httpError(403, 'خارج نطاقك');
}
router.put('/attendance/:userId/:date', async (req, res) => {
  const { userId, date: ds } = attParams.parse(req.params);
  canEditAttendance(req, userId);
  const d = attBody.parse(req.body);
  const checkIn = new Date(d.checkIn), checkOut = d.checkOut ? new Date(d.checkOut) : null;
  if (checkOut && checkOut <= checkIn) throw httpError(400, 'الخروج لازم يكون بعد الحضور');
  if (checkOut && checkOut - checkIn > 24 * 36e5) throw httpError(400, 'المدة أكثر من 24 ساعة');
  const date = toDate(ds);
  await prisma.attendance.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, checkIn, checkOut },
    update: { checkIn, checkOut },
  });
  await audit(req, 'attendance.edit', 'user', userId, { date: ds });
  await notify([userId], `${req.user.name} عدّل سجل حضورك ليوم ${ds}`, '#/attendance', req.user.id, 'TASK', req.user.name);
  res.status(204).end();
});
router.delete('/attendance/:userId/:date', async (req, res) => {
  const { userId, date: ds } = attParams.parse(req.params);
  canEditAttendance(req, userId);
  const r = await prisma.attendance.deleteMany({ where: { userId, date: toDate(ds) } });
  if (!r.count) throw httpError(404, 'لا يوجد سجل بهذا اليوم');
  await audit(req, 'attendance.delete', 'user', userId, { date: ds });
  res.status(204).end();
});

/* حالة الفريق اليوم */
router.get('/attendance/team', async (req, res) => {
  if (!req.can('attendance.team')) throw httpError(403, 'ليست لديك صلاحية لهذا الإجراء');
  const day = today(req.query.today);
  const date = toDate(day);
  const ids = [...req.scope].filter(id => id !== req.user.id && req.index.byId.get(id).active);
  const [att, leaves, shifts] = await Promise.all([
    prisma.attendance.findMany({ where: { userId: { in: ids }, date } }),
    prisma.request.findMany({
      where: { requesterId: { in: ids }, type: 'LEAVE', status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
      select: { requesterId: true },
    }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, shiftStart: true, shiftEnd: true } }),
  ]);
  const attBy = new Map(att.map(a => [a.userId, a]));
  const shiftBy = new Map(shifts.map(s => [s.id, s]));
  const onLeave = new Set(leaves.map(l => l.requesterId));
  res.json({
    date: day,
    people: ids.map(id => {
      const u = req.index.byId.get(id), a = attBy.get(id);
      const met = a ? metrics(a, shiftBy.get(id) || {}, req.settings) : null;
      return {
        id, name: u.name, role: u.role, title: u.title,
        status: onLeave.has(id) ? 'LEAVE' : a ? (a.checkOut ? 'LEFT' : 'PRESENT') : 'ABSENT',
        checkIn: a ? a.checkIn : null, checkOut: a ? a.checkOut : null,
        lateMin: met ? met.lateMin : 0, overtimeMin: met ? met.overtimeMin : 0,
      };
    }),
  });
});

module.exports = router;
module.exports.leaveUsed = leaveUsed;
module.exports.leaveBalances = leaveBalances;
module.exports.daysBetween = daysBetween;
module.exports.metrics = metrics;
