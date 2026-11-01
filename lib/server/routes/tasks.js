/* المهام والتكليفات — على طريقة Jira.
   - رقم المهمة: <بادئة المشروع>-<رقم> مثل NKH-12 (للمهام بلا مشروع: settings.taskKey أو TSK).
   - الأنواع: مهمة · خلل · قصة · ملحمة (Epic) · مهمة فرعية، مع أنواع تضيفها الشركة.
   - الحقول: وسوم، نقاط قصة، تقدير الوقت، تاريخ البدء/التسليم، الأم/الملحمة، السباق (Sprint).
   - الروابط بين المهام (تحجب/مرتبطة/مكرّرة)، المراقبون، سجل الساعات، وسجل تغييرات لكل حقل.
   - الإسناد: لنفسي أو لأي أحد ضمن نطاقي. المنفّذ يغيّر الحالة والنسبة ويعلّق؛ المُكلِّف أو رئيس المنفّذ يعدّل التفاصيل.
   - قائمة فرعية (Checklist): التقدّم يُحسب من البنود المنجزة. تكرار: تُنشأ نسخة جديدة عند الإنجاز. */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, idParam, toDate, fromDate, httpError } = require('../validate');
const { audit, notify } = require('../audit');
const { ancestors } = require('../hierarchy');
const { emit } = require('../integrations');
const { isValid } = require('../customItems');
const { prefixFor, createWithKey, keyOf, logChanges, nextKey } = require('../issues');
const { cleanCustomValues, mergeCustom } = require('../customFields');
const { runRules } = require('../automation');
const { userCaps } = require('../spacePerms');
const { taskVisibleWhere } = require('../visibility');

const router = express.Router();

/* وصول عبر اللوحات: عضو بلوحة مرتبطة بمشروع يرى مهام هذا المشروع (EDIT/MANAGE يحرّك الحالة أيضاً) */
const BOARD_RANK = { VIEW: 1, EDIT: 2, MANAGE: 3 };
router.use(async (req, res, next) => {
  try {
    req.boardProjects = new Map();
    if (!req.user) return next();
    const boards = await prisma.taskBoard.findMany({ where: { orgId: req.user.orgId }, select: { filters: true, members: true, createdBy: true, fields: true } });
    /* تعريفات حقول اللوحات تُعدّ حقولاً مخصصة صالحة لهذا الطلب (لقبول قيمها وفحصها) */
    const own = boards.flatMap(b => (Array.isArray(b.fields) ? b.fields : []));
    if (own.length) req.settings = { ...req.settings, customFields: [...((req.settings && req.settings.customFields) || []), ...own] };
    for (const b of boards) {
      const pid = (b.filters || {}).projectId;
      if (!pid) continue;
      const m = (Array.isArray(b.members) ? b.members : []).find(x => x.userId === req.user.id);
      const role = m ? m.role : (b.createdBy === req.user.id ? 'MANAGE' : null);
      if (!role) continue;
      if ((BOARD_RANK[role] || 0) > (req.boardProjects.get(pid) || 0)) req.boardProjects.set(pid, BOARD_RANK[role]);
    }
    /* المساحات (المشاريع): حقول المهام الخاصة بها + صلاحيات من يرى ويحرّك ويعدّل */
    const spaces = await prisma.project.findMany({ where: { orgId: req.user.orgId }, select: { id: true, settings: true } });
    const spaceFields = spaces.flatMap(s => ((s.settings || {}).fields || []));
    if (spaceFields.length) req.settings = { ...req.settings, customFields: [...((req.settings && req.settings.customFields) || []), ...spaceFields] };
    const full = req.can('admin') || req.can('boards.manage');
    req.hiddenSpaces = []; req.grantedSpaces = []; const capsBy = new Map();
    for (const s of spaces) {
      const caps = full ? null : userCaps(s.settings, req.user);
      if (!caps) continue;
      capsBy.set(s.id, new Set(caps));
      if (!caps.includes('view')) req.hiddenSpaces.push(s.id); else req.grantedSpaces.push(s.id);
    }
    /* خصائصي على لوحة/مساحة (بلا قاعدة صريحة = كل شيء كما كان حسب القواعد العامة) */
    req.spaceHas = (pid, cap) => (!pid || !capsBy.has(pid) ? true : capsBy.get(pid).has(cap));
    next();
  } catch (e) { next(e); }
});
const needCap = (req, pid, cap, msg) => { if (!req.spaceHas(pid, cap)) throw httpError(403, msg || 'صلاحيتك على هذه اللوحة لا تسمح بهذا الإجراء'); };

const RECUR = ['DAILY', 'WEEKLY', 'MONTHLY'];
const LINK_TYPES = ['BLOCKS', 'RELATES', 'DUPLICATES'];
const validStatus = (req, s) => isValid(req.settings, 'taskStatus', s);
const validPriority = (req, p) => isValid(req.settings, 'priority', p) || (typeof p === 'string' && /^bp_[a-z0-9]{3,12}$/.test(p));   // bp_… = أولوية خاصة بلوحة
const validIssueType = (req, t) => typeof t === 'string' && t.length <= 40;   // النوع نص حرّ اختياري ('' = بدون نوع)

const person = { select: { id: true, name: true, role: true } };
const parentSel = { select: { id: true, keyPrefix: true, number: true, title: true, issueType: true } };
const sprintSel = { select: { id: true, name: true, state: true } };
const projectSel = { select: { id: true, name: true, key: true } };

const parentJSON = p => (p ? { id: p.id, key: keyOf(p), title: p.title, issueType: p.issueType } : null);
const labelsOf = t => (Array.isArray(t.labels) ? t.labels : []);

const taskJSON = t => ({
  id: t.id, key: keyOf(t), title: t.title, description: t.description, status: t.status, priority: t.priority,
  issueType: t.issueType == null ? '' : t.issueType, labels: labelsOf(t), storyPoints: t.storyPoints ?? null, estimateMin: t.estimateMin ?? null,
  progress: t.progress, dueDate: fromDate(t.dueDate), startDate: fromDate(t.startDate),
  goalId: t.goalId, projectId: t.projectId, project: t.project ? { id: t.project.id, name: t.project.name, key: t.project.key } : null,
  parentId: t.parentId || null, parent: parentJSON(t.parent), sprintId: t.sprintId || null, sprint: t.sprint || null,
  recurrence: t.recurrence || null,
  customFields: (t.customFields && typeof t.customFields === 'object') ? t.customFields : {},
  coverFileId: t.coverFileId || null,
  coverUrl: t.coverFileId ? '/api/attachments/' + t.coverFileId + '/file' : null,
  timer: t.timerUserId ? { userId: t.timerUserId, startedAt: t.timerStartedAt } : null,
  assignee: t.assignee, creator: t.creator, createdAt: t.createdAt, updatedAt: t.updatedAt, completedAt: t.completedAt, statusChangedAt: t.statusChangedAt || t.createdAt,
  comments: t._count ? t._count.comments : undefined,
  children: t._count && t._count.children != null ? t._count.children : undefined,
  checklist: t.items ? { done: t.items.filter(i => i.done).length, total: t.items.length } : undefined,
});

const listInclude = {
  assignee: person, creator: person, items: { select: { done: true } },
  parent: parentSel, sprint: sprintSel, project: projectSel,
  _count: { select: { comments: true, children: true } },
};

/* المهمة تظهر لي إذا المنفّذ ضمن نطاقي أو أنا اللي كلّفت بها (القاعدة صارت بـ visibility.js حتى يستعملها البحث نفسها) */
const visibleWhere = taskVisibleWhere;
const canManage = (req, t) => t.creatorId === req.user.id || (t.assigneeId !== req.user.id && req.scope.has(t.assigneeId));

router.get('/tasks', async (req, res) => {
  const q = z.object({
    scope: z.enum(['mine', 'team', 'all']).default('mine'),
    status: z.string().max(40).optional(),
    assigneeId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    sprintId: z.coerce.number().int().positive().optional(),
    parentId: z.coerce.number().int().positive().optional(),
  }).parse(req.query);
  if (q.status && !validStatus(req, q.status)) throw httpError(400, 'حالة غير معروفة');

  const where = visibleWhere(req);
  if (q.scope === 'mine') { delete where.OR; where.assigneeId = req.user.id; }
  else if (q.scope === 'team') {
    delete where.OR;
    where.assigneeId = { in: [...req.scope].filter(id => id !== req.user.id) };
  }
  if (q.assigneeId) {
    if (!req.scope.has(q.assigneeId)) throw httpError(403, 'خارج نطاقك');
    where.assigneeId = q.assigneeId;
  }
  if (q.projectId) where.projectId = q.projectId;
  where.archivedAt = null;   // المؤرشفة لا تظهر إلا من تبويب الأرشيف
  if (q.sprintId) where.sprintId = q.sprintId;
  if (q.parentId) where.parentId = q.parentId;
  if (q.status) where.status = q.status;
  /* المنتهية تظهر آخر 30 يوم فقط حتى القائمة ما تكبر */
  if (!q.status) where.AND = [...(where.AND || []), { OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: new Date(Date.now() - 30 * 864e5) } }] }];

  const tasks = await prisma.task.findMany({
    where, include: listInclude,
    orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
    take: 500,
  });
  res.json(tasks.map(taskJSON));
});

/* ── الأرشيف: المهام المنجزة منذ أكثر من (archiveAfterDays=90) يوماً تُقترح على مسؤول اللوحة؛ لا تُؤرشَف إلا بموافقته ويمكن استرجاعها ── */
const archiveDays = req => Math.max(7, Math.min(3650, Number((req.settings || {}).archiveAfterDays) || 90));
async function isBoardAdmin(req, pid) {
  if (req.can('admin') || req.can('boards.manage')) return true;
  const sp = await prisma.project.findFirst({ where: { id: pid, orgId: req.user.orgId }, select: { settings: true } });
  const caps = sp ? userCaps(sp.settings, req.user) : null;
  return !!(caps && caps.includes('manageBoard'));
}
async function boardAdminIds(req, pid) {
  const sp = await prisma.project.findFirst({ where: { id: pid, orgId: req.user.orgId }, select: { settings: true } });
  const out = [];
  for (const u of req.index.users) {
    if (!u.active) continue;
    if (u.isAdmin || u.role === 'CEO') { out.push(u.id); continue; }
    const caps = sp ? userCaps(sp.settings, u) : null;
    if (caps && caps.includes('manageBoard')) out.push(u.id);
  }
  return out;
}
const pidQuery = req => z.object({ projectId: z.coerce.number().int().positive() }).parse(req.query).projectId;
router.get('/tasks/archive-candidates', async (req, res) => {
  const pid = pidQuery(req);
  if (!(await isBoardAdmin(req, pid))) return res.json({ days: archiveDays(req), tasks: [] });
  const days = archiveDays(req);
  const rows = await prisma.task.findMany({
    where: { ...visibleWhere(req), projectId: pid, archivedAt: null, status: 'DONE', completedAt: { lt: new Date(Date.now() - days * 864e5) } },
    include: listInclude, orderBy: { completedAt: 'asc' }, take: 500,
  });
  if (rows.length) {
    /* تنبيه مسؤولي اللوحة (مرة كل 7 أيام كحد أقصى لكل لوحة) */
    const link = `#/tasks?archive=${pid}`;
    const admins = await boardAdminIds(req, pid);
    const recent = await prisma.notification.findMany({ where: { userId: { in: admins }, link, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } }, select: { userId: true } });
    const done = new Set(recent.map(r => r.userId));
    const todo = admins.filter(id => !done.has(id));
    if (todo.length) await notify(todo, `${rows.length} مهمة منجزة منذ أكثر من ${days} يوماً تنتظر موافقتك على نقلها للأرشيف`, link, req.user.id, 'TASK', 'الأرشيف');
  }
  res.json({ days, tasks: rows.map(taskJSON) });
});
router.get('/tasks/archive', async (req, res) => {
  const pid = pidQuery(req);
  const rows = await prisma.task.findMany({ where: { ...visibleWhere(req), projectId: pid, archivedAt: { not: null } }, include: listInclude, orderBy: { archivedAt: 'desc' }, take: 500 });
  res.json({ canRestore: await isBoardAdmin(req, pid), tasks: rows.map(t => ({ ...taskJSON(t), archivedAt: t.archivedAt })) });
});
const idsBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
async function setArchived(req, res, on) {
  const { ids } = idsBody.parse(req.body);
  const rows = await prisma.task.findMany({ where: { ...visibleWhere(req), id: { in: ids } }, select: { id: true, projectId: true } });
  const okIds = [];
  for (const t of rows) if (t.projectId && (await isBoardAdmin(req, t.projectId))) okIds.push(t.id);
  if (!okIds.length) throw httpError(403, 'الأرشفة والاسترجاع لمسؤول اللوحة فقط');
  await prisma.task.updateMany({ where: { id: { in: okIds } }, data: on ? { archivedAt: new Date(), archivedById: req.user.id } : { archivedAt: null, archivedById: null } });
  await audit(req, on ? 'task.archive' : 'task.unarchive', 'task', okIds[0], { count: okIds.length });
  res.json({ count: okIds.length });
}
router.post('/tasks/archive', (req, res) => setArchived(req, res, true));
router.post('/tasks/unarchive', (req, res) => setArchived(req, res, false));
/* كل الوسوم المستعملة بالشركة (للاقتراح) */
router.get('/task-labels', async (req, res) => {
  const rows = await prisma.task.findMany({ where: { orgId: req.user.orgId, labels: { not: null } }, select: { labels: true }, take: 2000 });
  const set = new Set();
  rows.forEach(r => labelsOf(r).forEach(l => set.add(l)));
  res.json([...set].sort());
});

/* بحث سريع بالرقم أو العنوان (لروابط المهام والأم/الملحمة) */
router.get('/tasks-search', async (req, res) => {
  const { q, type } = z.object({ q: z.string().trim().max(60).default(''), type: z.string().max(20).optional() }).parse(req.query);
  const m = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/.exec(q);
  const where = { ...visibleWhere(req), ...(type && { issueType: type }) };
  if (m) Object.assign(where, { keyPrefix: m[1].toUpperCase(), number: +m[2] });
  else if (q) where.title = { contains: q };
  const rows = await prisma.task.findMany({ where, select: { id: true, keyPrefix: true, number: true, title: true, issueType: true, status: true }, orderBy: { id: 'desc' }, take: 15 });
  res.json(rows.map(r => ({ id: r.id, key: keyOf(r), title: r.title, issueType: r.issueType, status: r.status })));
});

async function detailOf(req, id) {
  const t = await prisma.task.findFirst({
    where: { id, ...visibleWhere(req) },
    include: {
      assignee: person, creator: person, items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      comments: { include: { user: person }, orderBy: { id: 'asc' } },
      parent: parentSel, sprint: sprintSel, project: projectSel,
      children: { select: { id: true, keyPrefix: true, number: true, title: true, status: true, issueType: true, assignee: person } },
      worklogs: { include: { user: person }, orderBy: [{ workedOn: 'desc' }, { id: 'desc' }] },
      watchers: { include: { user: person } },
      history: { include: { user: person }, orderBy: { id: 'desc' }, take: 80 },
      linksFrom: { include: { to: { select: { id: true, keyPrefix: true, number: true, title: true, status: true, issueType: true } } } },
      linksTo: { include: { from: { select: { id: true, keyPrefix: true, number: true, title: true, status: true, issueType: true } } } },
    },
  });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  return t;
}

router.get('/tasks/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const t = await detailOf(req, id);
  const link = (l, other, direction) => ({
    id: l.id, type: l.type, direction,
    task: { id: other.id, key: keyOf(other), title: other.title, status: other.status, issueType: other.issueType },
  });
  const spent = t.worklogs.reduce((s, w) => s + w.minutes, 0);
  res.json({
    ...taskJSON(t),
    items: t.items.map(i => ({ id: i.id, text: i.text, done: i.done })),
    canManage: canManage(req, t),
    canUpdate: t.assigneeId === req.user.id || canManage(req, t),
    mentionable: mentionableIds(req, t, await boardPeopleIds(req, t.projectId)).map(uid => { const u = req.index.byId.get(uid); return { id: u.id, name: u.name, role: u.role }; }),
    comments: t.comments.map(c => ({ id: c.id, body: c.body, user: c.user, createdAt: c.createdAt, editedAt: c.editedAt || null })),
    childIssues: t.children.map(c => ({ id: c.id, key: keyOf(c), title: c.title, status: c.status, issueType: c.issueType, assignee: c.assignee })),
    worklogs: t.worklogs.map(w => ({ id: w.id, minutes: w.minutes, note: w.note, workedOn: fromDate(w.workedOn), user: w.user, mine: w.userId === req.user.id })),
    timeSpentMin: spent,
    links: [...t.linksFrom.map(l => link(l, l.to, 'out')), ...t.linksTo.map(l => link(l, l.from, 'in'))],
    watchers: t.watchers.map(w => w.user),
    watching: t.watchers.some(w => w.userId === req.user.id),
    history: t.history.map(h => ({ id: h.id, field: h.field, from: h.fromValue, to: h.toValue, user: h.user, createdAt: h.createdAt })),
  });
});

const base = {
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120),
  description: z.string().trim().max(10000).nullable().optional(),
  priority: z.string().min(1).max(40),
  issueType: z.string().trim().max(40),
  labels: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  storyPoints: z.number().min(0).max(1000).nullable().optional(),
  estimateMin: z.number().int().min(0).max(60 * 24 * 365).nullable().optional(),
  dueDate: dateStr.nullable().optional(),
  startDate: dateStr.nullable().optional(),
  goalId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  sprintId: z.number().int().positive().nullable().optional(),
  recurrence: z.enum(RECUR).nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  coverFileId: z.number().int().positive().nullable().optional(),
};
const activeIds = req => new Set(req.index.users.filter(u => u.active).map(u => u.id));

async function assertGoal(req, goalId) {
  if (!goalId) return;
  const g = await prisma.goal.findFirst({ where: { id: goalId, orgId: req.user.orgId }, select: { ownerId: true } });
  if (!g) throw httpError(400, 'الهدف غير موجود');
}
async function assertProject(req, projectId) {
  if (!projectId) return;
  const p = await prisma.project.findFirst({ where: { id: projectId, orgId: req.user.orgId }, select: { id: true } });
  if (!p) throw httpError(400, 'المساحة غير موجودة');
}
async function assertParent(req, parentId, selfId, issueType) {
  if (!parentId) { if (issueType === 'SUBTASK') throw httpError(400, 'المهمة الفرعية تحتاج مهمة أم'); return; }
  if (parentId === selfId) throw httpError(400, 'لا يمكن أن تكون المهمة أماً لنفسها');
  const p = await prisma.task.findFirst({ where: { id: parentId, ...visibleWhere(req) }, select: { id: true, parentId: true, issueType: true } });
  if (!p) throw httpError(400, 'المهمة الأم غير موجودة');
  if (issueType === 'EPIC') throw httpError(400, 'الملحمة لا تتبع مهمة أخرى');
  if (selfId && p.parentId === selfId) throw httpError(400, 'هذا الربط يسوّي حلقة');
}
async function assertSprint(req, sprintId) {
  if (!sprintId) return;
  const s = await prisma.sprint.findFirst({ where: { id: sprintId, orgId: req.user.orgId }, select: { state: true } });
  if (!s) throw httpError(400, 'السباق غير موجود');
  if (s.state === 'CLOSED') throw httpError(400, 'السباق مغلق');
}
const cleanLabels = arr => [...new Set((arr || []).map(x => x.trim()).filter(Boolean))].slice(0, 20);

router.post('/tasks', async (req, res) => {
  if (!req.can('tasks.create')) throw httpError(403, 'ليست لديك صلاحية إنشاء مهام');
  const data = z.object({
    ...base, priority: base.priority.default('MEDIUM'), issueType: base.issueType.default(''),
    assigneeId: z.number().int().positive().optional(),
    items: z.array(z.string().trim().min(1).max(140)).max(40).optional(),
  }).parse(req.body);
  if (!validPriority(req, data.priority)) throw httpError(400, 'أولوية غير معروفة');
  if (!validIssueType(req, data.issueType)) throw httpError(400, 'نوع مهمة غير معروف');
  const assigneeId = data.assigneeId ?? req.user.id;
  if (assigneeId !== req.user.id && !req.can('tasks.assign')) throw httpError(403, 'ليست لديك صلاحية إسناد المهام لغيرك');
  if (!req.scope.has(assigneeId)) throw httpError(403, 'تقدر تسند مهام لنفسك أو لمن تحتك فقط');
  const assignee = req.index.byId.get(assigneeId);
  if (!assignee || !assignee.active) throw httpError(400, 'المنفّذ غير موجود أو معطّل');
  if (data.recurrence && !data.dueDate) throw httpError(400, 'المهمة المتكررة تحتاج تاريخ تسليم');
  if (data.startDate && data.dueDate && data.dueDate < data.startDate) throw httpError(400, 'التسليم قبل البدء');
  await assertGoal(req, data.goalId);
  await assertProject(req, data.projectId);
  needCap(req, data.projectId, 'create', 'صلاحيتك على هذه اللوحة لا تسمح بإنشاء مهام فيها');
  await assertParent(req, data.parentId, null, data.issueType);
  await assertSprint(req, data.sprintId);

  const cf = mergeCustom({}, cleanCustomValues(req.settings, data.customFields, activeIds(req)));
  const prefix = await prefixFor(req.user.orgId, req.settings, data.projectId);
  const t = await createWithKey(req.user.orgId, prefix, {
    title: data.title, description: data.description || null, customFields: cf,
    priority: data.priority, issueType: data.issueType, labels: cleanLabels(data.labels),
    storyPoints: data.storyPoints ?? null, estimateMin: data.estimateMin ?? null,
    dueDate: data.dueDate ? toDate(data.dueDate) : null, startDate: data.startDate ? toDate(data.startDate) : null,
    goalId: data.goalId || null, projectId: data.projectId || null, parentId: data.parentId || null,
    sprintId: data.sprintId || null, recurrence: data.recurrence || null,
    assigneeId, creatorId: req.user.id,
    ...(data.items && data.items.length && { items: { create: data.items.map((text, position) => ({ text, position })) } }),
  });
  /* المنشئ يراقب مهمته تلقائياً، والمنفّذ أيضاً */
  await prisma.taskWatcher.createMany({ data: [...new Set([req.user.id, assigneeId])].map(userId => ({ taskId: t.id, userId })), skipDuplicates: true });
  if (assigneeId !== req.user.id) {
    await notify([assigneeId], `${req.user.name} كلّفك بمهمة: ${keyOf(t)} ${t.title}`, '#/tasks', req.user.id, 'TASK', req.user.name);
  }
  await audit(req, 'task.create', 'task', t.id, { assigneeId, key: keyOf(t) });
  await runRules(req, t.id, 'CREATED').catch(err => console.error('automation:', err.message));
  emit(req.user.orgId, 'task.created', { id: t.id, key: keyOf(t), title: t.title, assigneeId, by: req.user.name });
  res.status(201).json({ id: t.id, key: keyOf(t) });
});

/* يضيف فترة التكرار لتاريخ (UTC) */
function nextDate(d, rule) {
  const x = new Date(d.getTime());
  if (rule === 'DAILY') x.setUTCDate(x.getUTCDate() + 1);
  else if (rule === 'WEEKLY') x.setUTCDate(x.getUTCDate() + 7);
  else { const day = x.getUTCDate(); x.setUTCMonth(x.getUTCMonth() + 1); if (x.getUTCDate() !== day) x.setUTCDate(0); }
  return x;
}

const FIELD_LABEL = { title: 'title', description: 'description', status: 'status', priority: 'priority', issueType: 'issueType', assignee: 'assignee',
  storyPoints: 'storyPoints', estimateMin: 'estimateMin', dueDate: 'dueDate', startDate: 'startDate', labels: 'labels', parent: 'parent', sprint: 'sprint', project: 'project', progress: 'progress' };

router.patch('/tasks/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = z.object({
    ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.optional()])),
    status: z.string().max(40).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    assigneeId: z.number().int().positive().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  if (data.status !== undefined && !validStatus(req, data.status)) throw httpError(400, 'حالة غير معروفة');
  if (data.priority !== undefined && !validPriority(req, data.priority)) throw httpError(400, 'أولوية غير معروفة');
  if (data.issueType !== undefined && !validIssueType(req, data.issueType)) throw httpError(400, 'نوع مهمة غير معروف');

  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) }, include: { items: true, parent: parentSel, sprint: sprintSel, project: projectSel } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  const grantedHere = !!t.projectId && req.grantedSpaces.includes(t.projectId);
  const manage = canManage(req, t) || (grantedHere && req.spaceHas(t.projectId, 'edit'));
  const isAssignee = t.assigneeId === req.user.id;
  if (data.customFields !== undefined) needCap(req, t.projectId, 'edit', 'صلاحيتك على هذه اللوحة لا تسمح بتعديل تفاصيل المهام');

  const detailFields = ['title', 'description', 'priority', 'issueType', 'labels', 'storyPoints', 'estimateMin', 'dueDate', 'startDate',
    'goalId', 'projectId', 'parentId', 'sprintId', 'assigneeId', 'recurrence', 'coverFileId'];
  if (data.status !== undefined && data.status !== t.status) needCap(req, t.projectId, 'move', 'صلاحيتك على هذه اللوحة لا تسمح بنقل المهام');
  if (detailFields.some(k => data[k] !== undefined && k !== 'assigneeId')) needCap(req, t.projectId, 'edit', 'صلاحيتك على هذه اللوحة لا تسمح بتعديل تفاصيل المهام');
  if (data.progress !== undefined) needCap(req, t.projectId, 'move');
  if (data.status !== undefined && data.status !== t.status && !req.can('tasks.move')) throw httpError(403, 'ليست لديك صلاحية نقل المهام أو تغيير حالتها');
  if (detailFields.some(k => data[k] !== undefined && k !== 'assigneeId') && !req.can('tasks.edit')) throw httpError(403, 'ليست لديك صلاحية تعديل تفاصيل المهام');
  if (data.assigneeId !== undefined && data.assigneeId !== t.assigneeId) needCap(req, t.projectId, 'assign', 'صلاحيتك على هذه اللوحة لا تسمح بإسناد المهام');
  if (data.assigneeId !== undefined && data.assigneeId !== t.assigneeId && !req.can('tasks.assign')) throw httpError(403, 'ليست لديك صلاحية إسناد المهام');
  if (!manage && detailFields.some(k => data[k] !== undefined)) {
    throw httpError(403, 'تعديل تفاصيل المهمة لمن كلّف بها أو لرئيس المنفّذ');
  }
  const boardRank = Math.max(t.projectId ? (req.boardProjects.get(t.projectId) || 0) : 0, grantedHere ? 2 : 0);
  if (!manage && !isAssignee) {
    if (boardRank < 2) throw httpError(403, 'ليست لديك صلاحية على هذه المهمة');
    if (Object.keys(data).some(k => !['status', 'progress'].includes(k))) throw httpError(403, 'صلاحيتك على هذه اللوحة نقل المهام بين الأعمدة فقط');
  }

  const upd = {};
  const changes = [];
  if (data.customFields !== undefined) {
    const clean = cleanCustomValues(req.settings, data.customFields, activeIds(req));
    const cur = (t.customFields && typeof t.customFields === 'object') ? t.customFields : {};
    for (const [k, v] of Object.entries(clean)) changes.push({ field: 'custom:' + k, from: Array.isArray(cur[k]) ? cur[k].join('، ') : cur[k], to: Array.isArray(v) ? v.join('، ') : v });
    upd.customFields = mergeCustom(cur, clean);
  }
  const nameOf = uid => (req.index.byId.get(uid) || {}).name || String(uid);
  for (const k of ['title', 'description', 'priority', 'recurrence', 'storyPoints', 'estimateMin']) {
    if (data[k] !== undefined) { upd[k] = data[k]; changes.push({ field: FIELD_LABEL[k] || k, from: t[k], to: data[k] }); }
  }
  if (data.issueType !== undefined) { await assertParent(req, data.parentId !== undefined ? data.parentId : t.parentId, id, data.issueType); upd.issueType = data.issueType; changes.push({ field: 'issueType', from: t.issueType, to: data.issueType }); }
  if (data.labels !== undefined) { upd.labels = cleanLabels(data.labels); changes.push({ field: 'labels', from: labelsOf(t).join('، '), to: upd.labels.join('، ') }); }
  if (data.dueDate !== undefined) { upd.dueDate = data.dueDate ? toDate(data.dueDate) : null; changes.push({ field: 'dueDate', from: fromDate(t.dueDate), to: data.dueDate }); }
  if (data.startDate !== undefined) { upd.startDate = data.startDate ? toDate(data.startDate) : null; changes.push({ field: 'startDate', from: fromDate(t.startDate), to: data.startDate }); }
  if (data.goalId !== undefined) { await assertGoal(req, data.goalId); upd.goalId = data.goalId; }
  if (data.coverFileId !== undefined) {
    if (data.coverFileId) {
      const a = await prisma.attachment.findFirst({ where: { id: data.coverFileId, orgId: req.user.orgId, entity: 'task', entityId: id, mime: { startsWith: 'image/' } }, select: { id: true } });
      if (!a) throw httpError(400, 'الغلاف لازم يكون صورة مرفقة بهذه المهمة');
    }
    upd.coverFileId = data.coverFileId;
  }
  if (data.projectId !== undefined && data.projectId !== t.projectId) {
    await assertProject(req, data.projectId);
    upd.projectId = data.projectId;
    /* نقل لمشروع آخر = بادئة ورقم جديدان (مثل Jira) */
    const prefix = await prefixFor(req.user.orgId, req.settings, data.projectId);
    if (prefix !== t.keyPrefix) Object.assign(upd, await nextKey(prisma, req.user.orgId, prefix));
    const np = data.projectId ? await prisma.project.findUnique({ where: { id: data.projectId }, select: { name: true } }) : null;
    changes.push({ field: 'project', from: t.project && t.project.name, to: np && np.name });
  }
  if (data.parentId !== undefined && data.parentId !== t.parentId) {
    await assertParent(req, data.parentId, id, data.issueType || t.issueType);
    upd.parentId = data.parentId;
    const np = data.parentId ? await prisma.task.findUnique({ where: { id: data.parentId }, select: { keyPrefix: true, number: true, id: true } }) : null;
    changes.push({ field: 'parent', from: t.parent && keyOf(t.parent), to: np && keyOf(np) });
  }
  if (data.sprintId !== undefined && data.sprintId !== t.sprintId) {
    await assertSprint(req, data.sprintId);
    upd.sprintId = data.sprintId;
    const ns = data.sprintId ? await prisma.sprint.findUnique({ where: { id: data.sprintId }, select: { name: true } }) : null;
    changes.push({ field: 'sprint', from: t.sprint && t.sprint.name, to: ns && ns.name });
  }
  if (data.assigneeId !== undefined && data.assigneeId !== t.assigneeId) {
    const a = req.index.byId.get(data.assigneeId);
    if (!a || !a.active || !req.scope.has(a.id)) throw httpError(403, 'تقدر تسند لنفسك أو لمن تحتك فقط');
    upd.assigneeId = a.id;
    changes.push({ field: 'assignee', from: nameOf(t.assigneeId), to: a.name });
  }
  if (upd.startDate !== undefined || upd.dueDate !== undefined) {
    const s = upd.startDate !== undefined ? upd.startDate : t.startDate, d = upd.dueDate !== undefined ? upd.dueDate : t.dueDate;
    if (s && d && d < s) throw httpError(400, 'التسليم قبل البدء');
  }
  if (data.progress !== undefined) { upd.progress = data.progress; changes.push({ field: 'progress', from: t.progress, to: data.progress }); }
  if (data.status !== undefined) {
    upd.status = data.status;
    upd.statusChangedAt = new Date();
    changes.push({ field: 'status', from: t.status, to: data.status });
    if (data.status === 'DONE') { upd.progress = 100; upd.completedAt = new Date(); }
    else if (t.status === 'DONE') upd.completedAt = null;
  }
  await prisma.task.update({ where: { id }, data: upd });
  await logChanges(id, req.user.id, changes.filter(c => c.field !== 'description').concat(
    data.description !== undefined && data.description !== t.description ? [{ field: 'description', from: null, to: '(عُدِّل الوصف)' }] : []));

  /* المراقبون: يُبلَّغون بتغيّر الحالة */
  if (data.status !== undefined && data.status !== t.status) {
    const ws = await prisma.taskWatcher.findMany({ where: { taskId: id, userId: { not: req.user.id } }, select: { userId: true } });
    if (ws.length) await notify(ws.map(w => w.userId), `${req.user.name} غيّر حالة ${keyOf(t)}`, `#/tasks?open=${id}`, req.user.id, 'TASK', req.user.name);
  }
  if (upd.assigneeId) {
    await prisma.taskWatcher.createMany({ data: [{ taskId: id, userId: upd.assigneeId }], skipDuplicates: true });
    await notify([upd.assigneeId], `${req.user.name} أسند لك مهمة: ${keyOf(t)} ${t.title}`, '#/tasks', req.user.id, 'TASK', req.user.name);
  }
  if (data.status === 'DONE' && t.status !== 'DONE') {
    await notify([t.creatorId], `${req.user.name} أنجز المهمة: ${keyOf(t)} ${t.title}`, '#/tasks', req.user.id, 'TASK', req.user.name);
    emit(req.user.orgId, 'task.done', { id, key: keyOf(t), title: t.title, assigneeId: upd.assigneeId || t.assigneeId, by: req.user.name });
    /* مهمة متكررة: ننشئ النسخة التالية */
    const rule = upd.recurrence !== undefined ? upd.recurrence : t.recurrence;
    if (rule) {
      const from = (upd.dueDate !== undefined ? upd.dueDate : t.dueDate) || new Date();
      const pid = upd.projectId !== undefined ? upd.projectId : t.projectId;
      const prefix = await prefixFor(req.user.orgId, req.settings, pid);
      await createWithKey(req.user.orgId, prefix, {
        title: upd.title ?? t.title, description: upd.description !== undefined ? upd.description : t.description,
        priority: upd.priority ?? t.priority, issueType: upd.issueType ?? t.issueType, labels: upd.labels ?? labelsOf(t),
        storyPoints: upd.storyPoints !== undefined ? upd.storyPoints : t.storyPoints,
        dueDate: nextDate(from, rule), recurrence: rule,
        goalId: upd.goalId !== undefined ? upd.goalId : t.goalId, projectId: pid,
        parentId: upd.parentId !== undefined ? upd.parentId : t.parentId,
        assigneeId: upd.assigneeId || t.assigneeId, creatorId: t.creatorId,
        items: { create: t.items.map((i, position) => ({ text: i.text, position })) },
      });
    }
  }
  if (data.status === 'REVIEW' && t.status !== 'REVIEW') {
    await notify([t.creatorId], `${req.user.name} أرسل للمراجعة: ${keyOf(t)} ${t.title}`, '#/tasks', req.user.id, 'TASK', req.user.name);
  }
  if (data.status !== undefined && data.status !== t.status) await runRules(req, id, 'STATUS_CHANGED', { status: data.status }).catch(err => console.error('automation:', err.message));
  await audit(req, 'task.update', 'task', id, Object.keys(data));
  res.status(204).end();
});

router.delete('/tasks/:id', async (req, res) => {
  if (!req.can('tasks.delete')) throw httpError(403, 'ليست لديك صلاحية حذف المهام');
  const id = idParam.parse(req.params.id);
  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  needCap(req, t.projectId, 'delete', 'صلاحيتك على هذه اللوحة لا تسمح بحذف المهام');
  if (!canManage(req, t) && !(req.grantedSpaces.includes(t.projectId) && req.spaceHas(t.projectId, 'delete'))) throw httpError(403, 'الحذف لمن كلّف بالمهمة أو لرئيس المنفّذ');
  await prisma.task.delete({ where: { id } });
  await audit(req, 'task.delete', 'task', id, { title: t.title, key: keyOf(t) });
  res.status(204).end();
});

/* ── قائمة البنود (Checklist) ── */
async function ownTask(req, id) {
  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) }, select: { id: true, assigneeId: true, creatorId: true, projectId: true } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  if (t.assigneeId !== req.user.id && !canManage(req, t)) throw httpError(403, 'ليست لديك صلاحية على هذه المهمة');
  return t;
}
/* التقدّم = نسبة البنود المنجزة */
async function syncProgress(taskId) {
  const items = await prisma.taskItem.findMany({ where: { taskId }, select: { done: true } });
  if (!items.length) return;
  const p = Math.round((items.filter(i => i.done).length / items.length) * 100);
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: p, ...(p === 100 && t.status === 'TODO' ? { status: 'IN_PROGRESS', statusChangedAt: new Date() } : {}), ...(p > 0 && p < 100 && t.status === 'TODO' ? { status: 'IN_PROGRESS', statusChangedAt: new Date() } : {}) },
  });
}

router.post('/tasks/:id/items', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { text } = z.object({ text: z.string().trim().min(1).max(140) }).parse(req.body);
  await ownTask(req, id);
  if ((await prisma.taskItem.count({ where: { taskId: id } })) >= 40) throw httpError(400, 'الحد الأقصى 40 بنداً');
  const max = await prisma.taskItem.aggregate({ where: { taskId: id }, _max: { position: true } });
  const it = await prisma.taskItem.create({ data: { taskId: id, text, position: (max._max.position ?? -1) + 1 } });
  await syncProgress(id);
  res.status(201).json({ id: it.id });
});

router.patch('/task-items/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({ done: z.boolean().optional(), text: z.string().trim().min(1).max(140).optional() })
    .refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const it = await prisma.taskItem.findUnique({ where: { id } });
  if (!it) throw httpError(404, 'البند غير موجود');
  await ownTask(req, it.taskId);
  await prisma.taskItem.update({ where: { id }, data: d });
  await syncProgress(it.taskId);
  res.status(204).end();
});

router.delete('/task-items/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const it = await prisma.taskItem.findUnique({ where: { id } });
  if (!it) throw httpError(404, 'البند غير موجود');
  await ownTask(req, it.taskId);
  await prisma.taskItem.delete({ where: { id } });
  await syncProgress(it.taskId);
  res.status(204).end();
});

/* من يقدر يُشار إليه بهذه المهمة = من يقدر يشوفها: المنفّذ، المُكلِّف، رؤساء المنفّذ، والمدير التنفيذي */
/* من أُضيف يدوياً لهذه اللوحة (يملك خاصية العرض) — يظهرون بقائمة @ ويصلهم الإشعار */
async function boardPeopleIds(req, projectId) {
  if (!projectId) return [];
  const sp = await prisma.project.findFirst({ where: { id: projectId, orgId: req.user.orgId }, select: { settings: true } });
  if (!sp) return [];
  return req.index.users.filter(u => u.active && (userCaps(sp.settings, u) || []).includes('view')).map(u => u.id);
}
function mentionableIds(req, t, extra = []) {
  const ids = new Set([t.assigneeId, t.creatorId, ...ancestors(req.index, t.assigneeId).map(a => a.id), ...extra]);
  for (const u of req.index.users) if (u.role === 'CEO') ids.add(u.id);
  return [...ids].filter(id => id !== req.user.id && req.index.byId.get(id) && req.index.byId.get(id).active);
}

router.post('/tasks/:id/comments', async (req, res) => {
  if (!req.can('tasks.comment')) throw httpError(403, 'ليست لديك صلاحية التعليق على المهام');
  const id = idParam.parse(req.params.id);
  /* الإشارة بالنص: @[رقم_المستخدم] — الواجهة تحوّل @الاسم إليها */
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) }, select: { id: true, keyPrefix: true, number: true, title: true, assigneeId: true, creatorId: true, projectId: true } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  needCap(req, t.projectId, 'comment', 'صلاحيتك على هذه اللوحة لا تسمح بالتعليق');
  await prisma.taskComment.create({ data: { taskId: id, userId: req.user.id, body } });

  const allowed = new Set(mentionableIds(req, t, await boardPeopleIds(req, t.projectId)));
  const mentioned = [...new Set([...body.matchAll(/@\[(\d+)\]/g)].map(m => +m[1]))].filter(x => allowed.has(x));
  if (mentioned.length) {
    await notify(mentioned, `${req.user.name} أشار إليك في «${keyOf(t)} ${t.title}»`, `#/tasks?open=${id}`, req.user.id, 'MENTION', req.user.name);
  }
  const ws = await prisma.taskWatcher.findMany({ where: { taskId: id }, select: { userId: true } });
  const rest = [...new Set([t.assigneeId, t.creatorId, ...ws.map(w => w.userId)])].filter(x => !mentioned.includes(x) && x !== req.user.id);
  await notify(rest, `${req.user.name} علّق على: ${keyOf(t)} ${t.title}`, `#/tasks?open=${id}`, req.user.id, 'TASK', req.user.name);
  await audit(req, 'task.comment', 'task', id, { mentions: mentioned.length });
  res.status(201).end();
});

/* تعديل/حذف تعليق: صاحب التعليق، أو مسؤول النظام، أو من يملك صلاحية الحذف على اللوحة */
async function commentOf(req) {
  const id = idParam.parse(req.params.id), cid = idParam.parse(req.params.cid);
  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) }, select: { id: true, projectId: true } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  const c = await prisma.taskComment.findFirst({ where: { id: cid, taskId: id } });
  if (!c) throw httpError(404, 'التعليق غير موجود');
  return { t, c, id, cid };
}
router.patch('/tasks/:id/comments/:cid', async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const { t, c, cid } = await commentOf(req);
  if (c.userId !== req.user.id) throw httpError(403, 'يمكنك تعديل تعليقاتك فقط');
  needCap(req, t.projectId, 'comment', 'صلاحيتك على هذه اللوحة لا تسمح بالتعليق');
  await prisma.taskComment.update({ where: { id: cid }, data: { body, editedAt: new Date() } });
  await audit(req, 'task.comment.edit', 'task', t.id, { comment: cid });
  res.status(204).end();
});
router.delete('/tasks/:id/comments/:cid', async (req, res) => {
  const { t, c, cid } = await commentOf(req);
  const mod = req.can('admin') || (t.projectId && req.spaceHas && req.spaceHas(t.projectId, 'delete'));
  if (c.userId !== req.user.id && !mod) throw httpError(403, 'يمكنك حذف تعليقاتك فقط');
  await prisma.taskComment.delete({ where: { id: cid } });
  await audit(req, 'task.comment.delete', 'task', t.id, { comment: cid });
  res.status(204).end();
});
/* ── سجل الساعات (Work log) ── */
router.post('/tasks/:id/worklog', async (req, res) => {
  if (!req.can('tasks.worklog')) throw httpError(403, 'ليست لديك صلاحية تسجيل ساعات العمل');
  const id = idParam.parse(req.params.id);
  const d = z.object({
    minutes: z.number().int().min(1, 'المدة أكبر من صفر').max(24 * 60),
    note: z.string().trim().max(255).nullable().optional(),
    workedOn: dateStr.optional(),
  }).parse(req.body);
  const ot = await ownTask(req, id);
  if (ot && ot.projectId !== undefined) needCap(req, ot.projectId, 'comment', 'صلاحيتك على هذه اللوحة لا تسمح بتسجيل الساعات');
  const w = await prisma.taskWorklog.create({
    data: { taskId: id, userId: req.user.id, minutes: d.minutes, note: d.note || null, workedOn: toDate(d.workedOn || fromDate(new Date())) },
  });
  await logChanges(id, req.user.id, [{ field: 'worklog', from: null, to: `${d.minutes} د` }]);
  res.status(201).json({ id: w.id });
});

router.delete('/task-worklogs/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const w = await prisma.taskWorklog.findUnique({ where: { id } });
  if (!w) throw httpError(404, 'السجل غير موجود');
  const t = await ownTask(req, w.taskId);
  if (w.userId !== req.user.id && !canManage(req, t)) throw httpError(403, 'الحذف لصاحب السجل أو مدير المهمة');
  await prisma.taskWorklog.delete({ where: { id } });
  res.status(204).end();
});

/* ── روابط المهام ── */
router.post('/tasks/:id/links', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({ toId: z.number().int().positive(), type: z.enum(LINK_TYPES) }).parse(req.body);
  if (d.toId === id) throw httpError(400, 'لا يمكن ربط المهمة بنفسها');
  await ownTask(req, id);
  const other = await prisma.task.findFirst({ where: { id: d.toId, ...visibleWhere(req) }, select: { id: true } });
  if (!other) throw httpError(404, 'المهمة المطلوب ربطها غير موجودة');
  try { await prisma.taskLink.create({ data: { fromId: id, toId: d.toId, type: d.type } }); }
  catch (e) { if (e && e.code === 'P2002') throw httpError(409, 'هذا الرابط موجود'); throw e; }
  await logChanges(id, req.user.id, [{ field: 'link', from: null, to: d.type }]);
  res.status(201).end();
});

router.delete('/task-links/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const l = await prisma.taskLink.findUnique({ where: { id } });
  if (!l) throw httpError(404, 'الرابط غير موجود');
  await ownTask(req, l.fromId);
  await prisma.taskLink.delete({ where: { id } });
  res.status(204).end();
});

/* ── المراقبة (Watch) ── */
router.post('/tasks/:id/watch', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { on } = z.object({ on: z.boolean() }).parse(req.body);
  const t = await prisma.task.findFirst({ where: { id, ...visibleWhere(req) }, select: { id: true } });
  if (!t) throw httpError(404, 'المهمة غير موجودة');
  if (on) await prisma.taskWatcher.createMany({ data: [{ taskId: id, userId: req.user.id }], skipDuplicates: true });
  else await prisma.taskWatcher.deleteMany({ where: { taskId: id, userId: req.user.id } });
  res.status(204).end();
});

/* ── مؤقّت العمل: بدء/إيقاف (يسجّل الوقت تلقائياً بسجل الساعات) ── */
router.post('/tasks/:id/timer', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { action } = z.object({ action: z.enum(['start', 'stop']) }).parse(req.body);
  await ownTask(req, id);
  const t = await prisma.task.findUnique({ where: { id } });
  if (action === 'start') {
    if (t.timerUserId) throw httpError(409, t.timerUserId === req.user.id ? 'المؤقّت يعمل مسبقاً' : 'شخص آخر يعمل على هذه المهمة الآن');
    const upd = { timerUserId: req.user.id, timerStartedAt: new Date() };
    if (t.status === 'TODO') upd.status = 'IN_PROGRESS';
    await prisma.task.update({ where: { id }, data: upd });
    await logChanges(id, req.user.id, [{ field: 'timer', from: null, to: 'بدء' }, ...(upd.status ? [{ field: 'status', from: 'TODO', to: 'IN_PROGRESS' }] : [])]);
    return res.status(204).end();
  }
  if (!t.timerUserId) throw httpError(409, 'لا يوجد مؤقّت يعمل');
  if (t.timerUserId !== req.user.id && !canManage(req, t)) throw httpError(403, 'المؤقّت لشخص آخر');
  const mins = Math.min(1440, Math.max(1, Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000)));
  await prisma.taskWorklog.create({ data: { taskId: id, userId: t.timerUserId, minutes: mins, note: 'مؤقّت العمل', workedOn: new Date() } });
  await prisma.task.update({ where: { id }, data: { timerUserId: null, timerStartedAt: null } });
  await logChanges(id, req.user.id, [{ field: 'worklog', from: null, to: mins + ' د' }]);
  res.json({ minutes: mins });
});

/* ── تشغيل قاعدة أتمتة يدوية من داخل المهمة ── */
router.post('/tasks/:id/automation/:ruleId', async (req, res) => {
  const id = idParam.parse(req.params.id);
  await ownTask(req, id);
  const ran = await runRules(req, id, 'MANUAL', { ruleId: req.params.ruleId });
  if (!ran.length) throw httpError(404, 'القاعدة غير موجودة');
  res.json({ ran });
});

module.exports = router;
module.exports.taskJSON = taskJSON;
