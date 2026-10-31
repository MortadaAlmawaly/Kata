/* طلبات الموافقة (مصروف / شراء / ميزانية / إجازة) بسلسلة صعود حسب حدود الشركة:
   - الطلب يروح أولاً للرئيس المباشر النشط.
   - إذا مبلغ الطلب ≤ حد الموافق (org.approvalLimits[role]) → يُعتمد.
   - غير هيج يصعد تلقائياً للرئيس الأعلى منه وهكذا، والمدير التنفيذي بلا حد.
   - الإجازات يعتمدها الرئيس المباشر مباشرة (بدون مبلغ) ولكل نوع إجازة رصيده.
   - طلب المدير التنفيذي نفسه يُعتمد تلقائياً ويُسجَّل بالتدقيق.
   - نقاش على الطلب (تعليقات) بين صاحبه وكل من له علاقة بمساره. */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, idParam, toDate, fromDate, httpError, num } = require('../validate');
const { nearestActiveAncestor, ancestors } = require('../hierarchy');
const { need } = require('../auth');
const { audit, notify } = require('../audit');
const { leaveBalances, daysBetween } = require('./attendance');
const { emit } = require('../integrations');

const router = express.Router();

const { isValid } = require('../customItems');   /* أنواع الطلبات المضافة تُعامَل كالمصروف (بمبلغ وسلسلة اعتماد) */
const { requestVisibleWhere } = require('../visibility');
const person = { select: { id: true, name: true, role: true } };
const include = {
  requester: person,
  currentApprover: person,
  steps: { include: { approver: person }, orderBy: { id: 'asc' } },
  _count: { select: { comments: true } },
};

const requestJSON = r => ({
  id: r.id, type: r.type, title: r.title, details: r.details, amount: num(r.amount),
  startDate: fromDate(r.startDate), endDate: fromDate(r.endDate), leaveType: r.leaveType || null,
  status: r.status, requester: r.requester, currentApprover: r.currentApprover,
  createdAt: r.createdAt, decidedAt: r.decidedAt,
  comments: r._count ? r._count.comments : undefined,
  steps: r.steps.map(s => ({ approver: s.approver, decision: s.decision, note: s.note, createdAt: s.createdAt })),
});

/* هل يكفي هذا الموافق لاعتماد المبلغ؟ */
function withinLimit(org, role, type, amount) {
  if (type === 'LEAVE' || amount == null) return true;
  if (role === 'CEO') return true;
  const limit = Number(org.approvalLimits?.[role] ?? 0);
  return amount <= limit;
}

/* القاعدة صارت بـ visibility.js حتى يستعملها البحث نفسها */
const visibleWhere = requestVisibleWhere;

router.get('/requests', async (req, res) => {
  const { box } = z.object({ box: z.enum(['mine', 'inbox', 'team', 'decided']).default('mine') }).parse(req.query);
  const orgId = req.user.orgId, me = req.user.id;
  const where = { orgId };
  if (box === 'mine') where.requesterId = me;
  else if (box === 'inbox') Object.assign(where, { currentApproverId: me, status: 'PENDING' });
  else if (box === 'team') where.requesterId = { in: [...req.scope].filter(id => id !== me) };
  else where.steps = { some: { approverId: me } };
  const list = await prisma.request.findMany({ where, include, orderBy: { id: 'desc' }, take: 200 });
  res.json(list.map(requestJSON));
});

router.get('/requests/summary', async (req, res) => {
  const [inbox, mine] = await Promise.all([
    prisma.request.count({ where: { currentApproverId: req.user.id, status: 'PENDING' } }),
    prisma.request.count({ where: { requesterId: req.user.id, status: 'PENDING' } }),
  ]);
  res.json({ inbox, mine });
});

/* تفصيل الطلب: التعليقات + مسار الاعتماد المتوقع (الخطوات المنجزة والحالية والقادمة) */
router.get('/requests/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.request.findFirst({ where: { id, ...visibleWhere(req) }, include });
  if (!r) throw httpError(404, 'الطلب غير موجود');
  const comments = await prisma.requestComment.findMany({
    where: { requestId: id }, include: { user: person }, orderBy: { id: 'asc' },
  });

  /* المسار: رؤساء صاحب الطلب بالتسلسل حتى أول من يكفي حدّه */
  const amount = num(r.amount);
  const chain = [];
  const decided = new Map(r.steps.map(s => [s.approver.id, s.decision]));
  for (const a of ancestors(req.index, r.requesterId).filter(x => x.active)) {
    const lim = a.role === 'CEO' ? null : Number(req.org.approvalLimits?.[a.role] ?? 0);
    const enough = withinLimit(req.org, a.role, r.type, amount);
    let state = 'FUTURE';
    if (decided.has(a.id)) state = decided.get(a.id) === 'REJECTED' ? 'REJECTED' : 'DONE';
    else if (r.currentApproverId === a.id) state = 'CURRENT';
    chain.push({ id: a.id, name: a.name, role: a.role, limit: lim, canFinalize: enough, state });
    if (enough) break;
  }
  /* الرئيس الأعلى من المعتمدين لم يعد مطلوباً إذا اكتمل الاعتماد */
  const shown = r.status === 'PENDING' || r.status === 'REJECTED'
    ? chain
    : chain.filter(c => c.state !== 'FUTURE');

  res.json({
    ...requestJSON(r),
    chain: shown,
    comments: comments.map(c => ({ id: c.id, body: c.body, user: c.user, createdAt: c.createdAt })),
  });
});

router.post('/requests', async (req, res) => {
  const data = z.object({
    type: z.string().min(1).max(40),
    title: z.string().trim().min(1, 'العنوان مطلوب').max(140),
    details: z.string().trim().max(4000).nullable().optional(),
    amount: z.number().positive('المبلغ لازم أكبر من صفر').max(999999999999).optional(),
    startDate: dateStr.optional(),
    endDate: dateStr.optional(),
    leaveType: z.string().max(20).optional(),
  }).parse(req.body);

  if (!isValid(req.settings, 'requestType', data.type)) throw httpError(400, 'نوع طلب غير معروف');
  let leaveType = null;
  if (data.type === 'LEAVE') {
    if (!data.startDate || !data.endDate) throw httpError(400, 'تاريخ بداية ونهاية الإجازة مطلوبان');
    if (data.endDate < data.startDate) throw httpError(400, 'نهاية الإجازة قبل بدايتها');
    leaveType = data.leaveType || 'annual';
    const balances = await leaveBalances(req.user, req.settings, +data.startDate.slice(0, 4));
    const bal = balances.find(b => b.key === leaveType);
    if (!bal) throw httpError(400, 'نوع إجازة غير معروف');
    const want = daysBetween(toDate(data.startDate), toDate(data.endDate));
    if (bal.remaining != null && want > bal.remaining) {
      throw httpError(400, `رصيد «${bal.name}» غير كافٍ: المتبقي ${bal.remaining} يوم والمطلوب ${want}`);
    }
  } else if (data.amount == null) {
    throw httpError(400, 'المبلغ مطلوب');
  }

  const approver = nearestActiveAncestor(req.index, req.user.id);
  const auto = !approver;      /* ما اكو رئيس (المدير التنفيذي) */
  const r = await prisma.request.create({
    data: {
      orgId: req.user.orgId, requesterId: req.user.id, type: data.type, title: data.title,
      details: data.details || null, amount: data.type === 'LEAVE' ? null : data.amount,
      startDate: data.startDate ? toDate(data.startDate) : null,
      endDate: data.endDate ? toDate(data.endDate) : null,
      leaveType,
      status: auto ? 'APPROVED' : 'PENDING',
      currentApproverId: auto ? null : approver.id,
      decidedAt: auto ? new Date() : null,
    },
  });
  if (auto) {
    await prisma.requestStep.create({ data: { requestId: r.id, approverId: req.user.id, decision: 'APPROVED', note: 'اعتماد ذاتي' } });
  } else {
    await notify([approver.id], `${req.user.name} قدّم طلباً بانتظار موافقتك: ${r.title}`, '#/requests', req.user.id, 'REQUEST', req.user.name);
  }
  await audit(req, 'request.create', 'request', r.id, { type: r.type, amount: data.amount ?? null });
  emit(req.user.orgId, 'request.created', { id: r.id, type: r.type, title: r.title, amount: data.amount ?? null, by: req.user.name });
  res.status(201).json({ id: r.id, status: r.status });
});

async function loadPending(req, id) {
  const r = await prisma.request.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!r) throw httpError(404, 'الطلب غير موجود');
  if (r.status !== 'PENDING') throw httpError(409, 'هذا الطلب تم البتّ فيه مسبقاً');
  return r;
}
/* الموافق المعيّن، أو المدير التنفيذي (تجاوز مسجَّل) */
function assertCanDecide(req, r) {
  if (r.currentApproverId !== req.user.id && req.user.role !== 'CEO') {
    throw httpError(403, 'هذا الطلب ليس بانتظار موافقتك');
  }
}
const noteSchema = z.object({ note: z.string().trim().max(500).optional() });

router.post('/requests/:id/approve', need('requests.approve'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { note } = noteSchema.parse(req.body ?? {});
  const r = await loadPending(req, id);
  assertCanDecide(req, r);
  const amount = num(r.amount);

  let finalStatus = 'APPROVED';
  let nextApprover = null;
  if (!withinLimit(req.org, req.user.role, r.type, amount)) {
    nextApprover = nearestActiveAncestor(req.index, req.user.id);
    if (nextApprover) finalStatus = 'PENDING';       /* يصعد للأعلى */
  }

  await prisma.$transaction(async tx => {
    /* شرط الحالة يمنع قرارين متزامنين */
    const upd = await tx.request.updateMany({
      where: { id, status: 'PENDING' },
      data: finalStatus === 'APPROVED'
        ? { status: 'APPROVED', currentApproverId: null, decidedAt: new Date() }
        : { currentApproverId: nextApprover.id },
    });
    if (!upd.count) throw httpError(409, 'هذا الطلب تم البتّ فيه مسبقاً');
    await tx.requestStep.create({
      data: {
        requestId: id, approverId: req.user.id,
        decision: finalStatus === 'APPROVED' ? 'APPROVED' : 'ESCALATED',
        note: note || (r.currentApproverId !== req.user.id ? 'تجاوز من المدير التنفيذي' : null),
      },
    });
  });

  if (finalStatus === 'APPROVED') {
    await notify([r.requesterId], `تمت الموافقة على طلبك: ${r.title}`, '#/requests', req.user.id, 'REQUEST', req.user.name);
    emit(req.user.orgId, 'request.approved', { id, title: r.title, type: r.type, amount, requesterId: r.requesterId, by: req.user.name });
  } else {
    await notify([nextApprover.id], `طلب بانتظار موافقتك (صعد لتجاوزه حد الموافقة): ${r.title}`, '#/requests', req.user.id, 'REQUEST', req.user.name);
    await notify([r.requesterId], `وافق ${req.user.name} على طلبك وصعد للمستوى الأعلى: ${r.title}`, '#/requests', req.user.id, 'REQUEST', req.user.name);
  }
  await audit(req, 'request.approve', 'request', id, { result: finalStatus, amount });
  res.json({ status: finalStatus });
});

router.post('/requests/:id/reject', need('requests.approve'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { note } = noteSchema.parse(req.body ?? {});
  if (req.settings.requireApprovalNote && !note) throw httpError(400, 'اكتب سبب الرفض');
  const r = await loadPending(req, id);
  assertCanDecide(req, r);
  await prisma.$transaction(async tx => {
    const upd = await tx.request.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', currentApproverId: null, decidedAt: new Date() },
    });
    if (!upd.count) throw httpError(409, 'هذا الطلب تم البتّ فيه مسبقاً');
    await tx.requestStep.create({ data: { requestId: id, approverId: req.user.id, decision: 'REJECTED', note: note || null } });
  });
  await notify([r.requesterId], `تم رفض طلبك: ${r.title}${note ? ' — ' + note : ''}`, '#/requests', req.user.id, 'REQUEST', req.user.name);
  emit(req.user.orgId, 'request.rejected', { id, title: r.title, type: r.type, requesterId: r.requesterId, by: req.user.name, note: note || null });
  await audit(req, 'request.reject', 'request', id);
  res.status(204).end();
});

/* صاحب الطلب يلغيه قبل البتّ */
router.post('/requests/:id/cancel', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await loadPending(req, id);
  if (r.requesterId !== req.user.id) throw httpError(403, 'الإلغاء لصاحب الطلب فقط');
  await prisma.request.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED', currentApproverId: null, decidedAt: new Date() },
  });
  await audit(req, 'request.cancel', 'request', id);
  res.status(204).end();
});

/* ── نقاش على الطلب ── */
router.post('/requests/:id/comments', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const r = await prisma.request.findFirst({
    where: { id, ...visibleWhere(req) },
    select: { id: true, title: true, requesterId: true, currentApproverId: true, steps: { select: { approverId: true } } },
  });
  if (!r) throw httpError(404, 'الطلب غير موجود');
  await prisma.requestComment.create({ data: { requestId: id, userId: req.user.id, body } });
  /* يُشعَر: صاحب الطلب، الموافق الحالي، ومن سبق أن قرّر عليه */
  const to = [r.requesterId, r.currentApproverId, ...r.steps.map(s => s.approverId)].filter(Boolean);
  await notify(to, `${req.user.name} علّق على الطلب «${r.title}»`, '#/requests', req.user.id, 'REQUEST', req.user.name);
  res.status(201).end();
});

module.exports = router;
