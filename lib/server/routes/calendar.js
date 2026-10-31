/* التقويم والمواعيد.
   التقويم = دمج: مواعيدي واجتماعاتي + فعاليات/عطل الشركة + مهامي بتاريخ تسليم + إجازات الفريق المعتمدة.
   الدعوة: أي موظف فعّال بالشركة (GET /directory). الفعاليات والعطل العامة: مدير فما فوق. */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, idParam, toDate, fromDate, httpError } = require('../validate');
const { level } = require('../permissions');
const { audit, notify } = require('../audit');
const { occurrences } = require('../recurrence');

const router = express.Router();

const { isValid } = require('../customItems');   /* الأنواع الأساسية + ما تضيفه الشركة من الإعدادات */
const person = { select: { id: true, name: true, role: true } };
const iso = z.string().datetime({ offset: true, message: 'وقت غير صالح' });

/* دليل الشركة المختصر للدعوات (أسماء فقط) */
router.get('/directory', async (req, res) => {
  const list = await prisma.user.findMany({
    where: { orgId: req.user.orgId, active: true },
    select: { id: true, name: true, role: true, title: true, department: true },
    orderBy: { name: 'asc' },
  });
  res.json(list);
});

const eventJSON = (e, myId) => ({
  id: e.id, type: e.type, customType: e.customType || null, title: e.title, description: e.description, location: e.location,
  startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, companyWide: e.companyWide,
  recurrence: e.recurrence || null, recurEvery: e.recurEvery || null, recurUntil: e.recurUntil ? e.recurUntil.toISOString().slice(0, 10) : null,
  creator: e.creator,
  attendees: (e.attendees || []).map(a => ({ id: a.user.id, name: a.user.name, response: a.response })),
  myResponse: ((e.attendees || []).find(a => a.userId === myId) || {}).response || null,
});

/* المرئي لي + التي تتقاطع مع النطاق (المتكررة تدخل إن لم تنتهِ قبل بداية النطاق) */
const visibleEvents = (req, from, to) => ({
  orgId: req.user.orgId,
  startAt: { lt: to },
  AND: [
    { OR: [{ companyWide: true }, { creatorId: req.user.id }, { attendees: { some: { userId: req.user.id } } }] },
    { OR: [
      { recurrence: null, endAt: { gte: from } },
      { recurrence: { not: null }, OR: [{ recurUntil: null }, { recurUntil: { gte: from } }] },
    ] },
  ],
});

router.get('/calendar', async (req, res) => {
  const q = z.object({ from: dateStr, to: dateStr }).parse(req.query);
  const fromD = toDate(q.from), toD = toDate(q.to);
  if (toD < fromD || (toD - fromD) / 864e5 > 93) throw httpError(400, 'نطاق التواريخ غير صالح');
  const toEnd = new Date(toD.getTime() + 864e5);

  const [events, tasks, leaves] = await Promise.all([
    prisma.event.findMany({
      where: visibleEvents(req, fromD, toEnd),
      include: { creator: person, attendees: { include: { user: person } } },
      orderBy: { startAt: 'asc' },
    }),
    prisma.task.findMany({
      where: { orgId: req.user.orgId, assigneeId: req.user.id, status: { not: 'DONE' }, dueDate: { gte: fromD, lte: toD } },
      select: { id: true, title: true, dueDate: true, priority: true },
    }),
    /* إجازات معتمدة: إجازتي + إجازات من تحتي */
    prisma.request.findMany({
      where: {
        orgId: req.user.orgId, type: 'LEAVE', status: 'APPROVED', requesterId: { in: [...req.scope] },
        startDate: { lte: toD }, endDate: { gte: fromD },
      },
      include: { requester: person },
    }),
  ]);

  /* توسيع المتكرر: كل مرّة تُرجَع كعنصر مستقل بنفس المعرّف (التعديل يطبّق على السلسلة) */
  const expanded = [];
  for (const e of events) {
    for (const o of occurrences(e, fromD, toEnd)) {
      expanded.push({ ...eventJSON({ ...e, startAt: o.startAt, endAt: o.endAt }, req.user.id), occurrence: o.occ, seriesStart: e.startAt });
    }
  }
  expanded.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  res.json({
    events: expanded,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, date: fromDate(t.dueDate), priority: t.priority })),
    leaves: leaves.map(l => ({ id: l.id, person: l.requester, startDate: fromDate(l.startDate), endDate: fromDate(l.endDate), mine: l.requesterId === req.user.id })),
  });
});

const body = z.object({
  type: z.string().min(1).max(40).default('MEETING'),
  customType: z.string().trim().min(1).max(40).nullable().optional(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(140),
  description: z.string().trim().max(4000).nullable().optional(),
  location: z.string().trim().max(140).nullable().optional(),
  startAt: iso,
  endAt: iso,
  allDay: z.boolean().default(false),
  companyWide: z.boolean().default(false),
  recurrence: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).nullable().optional(),
  recurEvery: z.number().int().min(1, 'عدد الساعات من 1 إلى 168').max(168, 'عدد الساعات من 1 إلى 168').nullable().optional(),
  recurUntil: dateStr.nullable().optional(),
  attendeeIds: z.array(z.number().int().positive()).max(100).default([]),
});

/* من هؤلاء عنده موعد متداخل؟ (للتنبيه، لا يمنع الحفظ) */
async function conflictsFor(orgId, userIds, startAt, endAt, exceptEventId) {
  if (!userIds.length) return [];
  const rows = await prisma.eventAttendee.findMany({
    where: {
      userId: { in: userIds }, response: { not: 'DECLINED' },
      event: { orgId, allDay: false, startAt: { lt: endAt }, endAt: { gt: startAt }, ...(exceptEventId && { id: { not: exceptEventId } }) },
    },
    include: { user: person },
  });
  return [...new Map(rows.map(r => [r.user.id, r.user.name])).values()];
}

async function resolveAttendees(req, ids) {
  const unique = [...new Set(ids)].filter(id => id !== req.user.id);
  if (!unique.length) return [];
  const found = await prisma.user.findMany({ where: { orgId: req.user.orgId, active: true, id: { in: unique } }, select: { id: true } });
  return found.map(u => u.id);
}

/* حدث واحد (للبحث الشامل وفتح التفاصيل) */
router.get('/events/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const e = await prisma.event.findFirst({
    where: { id, orgId: req.user.orgId, OR: [{ companyWide: true }, { creatorId: req.user.id }, { attendees: { some: { userId: req.user.id } } }] },
    include: { creator: person, attendees: { include: { user: person } } },
  });
  if (!e) throw httpError(404, 'الموعد غير موجود');
  res.json(eventJSON(e, req.user.id));
});
router.post('/events', async (req, res) => {
  const d = body.parse(req.body);
  const startAt = new Date(d.startAt), endAt = new Date(d.endAt);
  if (endAt < startAt) throw httpError(400, 'نهاية الموعد قبل بدايته');
  if (!isValid(req.settings, 'eventType', d.type)) throw httpError(400, 'نوع موعد غير معروف');
  if (d.type === 'OTHER' && !d.customType) throw httpError(400, 'اكتب اسم النوع');
  if (d.recurrence === 'HOURLY' && !d.recurEvery) throw httpError(400, 'حدّد التكرار كل كم ساعة');
  const companyWide = d.companyWide || d.type === 'HOLIDAY';
  if (companyWide && !req.can('events.company')) throw httpError(403, 'ليست لديك صلاحية فعاليات الشركة');

  const attendeeIds = await resolveAttendees(req, d.attendeeIds);
  const conflicts = await conflictsFor(req.user.orgId, [req.user.id, ...attendeeIds], startAt, endAt);
  const e = await prisma.event.create({
    data: {
      orgId: req.user.orgId, creatorId: req.user.id, type: d.type, customType: d.type === 'OTHER' ? d.customType : null, title: d.title,
      description: d.description || null, location: d.location || null,
      startAt, endAt, allDay: d.allDay, companyWide,
      recurrence: d.recurrence || null, recurEvery: d.recurrence === 'HOURLY' ? d.recurEvery : null, recurUntil: d.recurrence && d.recurUntil ? toDate(d.recurUntil) : null,
      attendees: { create: [{ userId: req.user.id, response: 'ACCEPTED' }, ...attendeeIds.map(userId => ({ userId }))] },
    },
  });
  await notify(attendeeIds, `${req.user.name} دعاك إلى: ${e.title}`, '#/calendar', req.user.id, 'EVENT', req.user.name);
  await audit(req, 'event.create', 'event', e.id, { type: e.type });
  res.status(201).json({ id: e.id, conflicts });
});

async function ownEvent(req, id) {
  const e = await prisma.event.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!e) throw httpError(404, 'الموعد غير موجود');
  return e;
}

router.patch('/events/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const e = await ownEvent(req, id);
  if (e.creatorId !== req.user.id) throw httpError(403, 'التعديل لمن أنشأ الموعد');
  const d = body.partial().parse(req.body);
  const startAt = d.startAt ? new Date(d.startAt) : e.startAt;
  const endAt = d.endAt ? new Date(d.endAt) : e.endAt;
  if (endAt < startAt) throw httpError(400, 'نهاية الموعد قبل بدايته');

  await prisma.$transaction(async tx => {
    await tx.event.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.location !== undefined && { location: d.location }),
        ...(d.allDay !== undefined && { allDay: d.allDay }),
        ...(d.customType !== undefined && e.type === 'OTHER' && d.customType && { customType: d.customType }),
        ...(d.recurrence !== undefined && { recurrence: d.recurrence, recurEvery: d.recurrence === 'HOURLY' ? d.recurEvery || e.recurEvery || 1 : null, recurUntil: d.recurrence && d.recurUntil ? toDate(d.recurUntil) : null }),
        startAt, endAt,
      },
    });
    if (d.attendeeIds) {
      const ids = await resolveAttendees(req, d.attendeeIds);
      await tx.eventAttendee.deleteMany({ where: { eventId: id, userId: { notIn: [req.user.id, ...ids] } } });
      for (const userId of ids) {
        await tx.eventAttendee.upsert({ where: { eventId_userId: { eventId: id, userId } }, create: { eventId: id, userId }, update: {} });
      }
    }
  });
  const others = await prisma.eventAttendee.findMany({ where: { eventId: id, userId: { not: req.user.id } }, select: { userId: true } });
  await notify(others.map(o => o.userId), `تم تعديل الموعد: ${d.title || e.title}`, '#/calendar', req.user.id, 'EVENT', req.user.name);
  res.status(204).end();
});

router.delete('/events/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const e = await ownEvent(req, id);
  if (e.creatorId !== req.user.id && req.user.role !== 'CEO') throw httpError(403, 'الحذف لمن أنشأ الموعد');
  const others = await prisma.eventAttendee.findMany({ where: { eventId: id, userId: { not: req.user.id } }, select: { userId: true } });
  await prisma.event.delete({ where: { id } });
  await notify(others.map(o => o.userId), `أُلغي الموعد: ${e.title}`, '#/calendar', req.user.id, 'EVENT', req.user.name);
  await audit(req, 'event.delete', 'event', id, { title: e.title });
  res.status(204).end();
});

/* ردّ المدعو: قبول أو اعتذار */
router.post('/events/:id/respond', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { response } = z.object({ response: z.enum(['ACCEPTED', 'DECLINED']) }).parse(req.body);
  const r = await prisma.eventAttendee.updateMany({ where: { eventId: id, userId: req.user.id }, data: { response } });
  if (!r.count) throw httpError(404, 'لست مدعواً لهذا الموعد');
  const e = await prisma.event.findUnique({ where: { id }, select: { creatorId: true, title: true } });
  await notify([e.creatorId], `${req.user.name} ${response === 'ACCEPTED' ? 'قبل' : 'اعتذر عن'}: ${e.title}`, '#/calendar', req.user.id, 'EVENT', req.user.name);
  res.status(204).end();
});

module.exports = router;
