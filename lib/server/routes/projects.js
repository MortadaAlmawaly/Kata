/* المشاريع: تجمّع مهام فرق متعددة بمالك وتواريخ وحالة. تقدّمها = متوسط تقدّم مهامها.
   الإنشاء: مدير قسم فما فوق. يراها: مالكها ومن فوقه ومن عنده مهمة فيها ضمن نطاقي. */
const express = require('../express');
const prisma = require('../db');
const { z, dateStr, idParam, toDate, fromDate, httpError } = require('../validate');
const { level } = require('../permissions');
const { ancestors } = require('../hierarchy');
const { projectVisibleWhere } = require('../visibility');
const { audit, notify } = require('../audit');
const { uniqueProjectKey, suggestKey, DEFAULT_PREFIX } = require('../issues');

const router = express.Router();
const { isValid } = require('../customItems');
const owner = { select: { id: true, name: true, role: true } };

function stats(tasks, today) {
  const open = tasks.filter(t => t.status !== 'DONE');
  return {
    tasks: tasks.length,
    done: tasks.length - open.length,
    overdue: open.filter(t => t.dueDate && fromDate(t.dueDate) < today).length,
    progress: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0,
  };
}
const projectJSON = (p, today) => ({
  id: p.id, key: p.key || null, name: p.name, description: p.description, status: p.status, owner: p.owner,
  startDate: fromDate(p.startDate), endDate: fromDate(p.endDate), ...stats(p.tasks, today),
});

router.get('/projects', async (req, res) => {
  const today = fromDate(new Date());
  const upper = ancestors(req.index, req.user.id).map(a => a.id);
  const list = await prisma.project.findMany({
    where: projectVisibleWhere(req, upper),   /* القاعدة بـ visibility.js (نفسها للبحث) */
    include: { owner, tasks: { select: { status: true, progress: true, dueDate: true } } },
    orderBy: [{ status: 'asc' }, { id: 'desc' }],
  });
  res.json(list.map(p => projectJSON(p, today)));
});

const body = z.object({
  name: z.string().trim().min(1, 'اسم المشروع مطلوب').max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  status: z.string().min(1).max(40).default('ACTIVE'),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'مفتاح المشروع 2–10 حروف إنكليزية/أرقام يبدأ بحرف').nullable().optional(),
  startDate: dateStr.nullable().optional(),
  endDate: dateStr.nullable().optional(),
  ownerId: z.number().int().positive().optional(),
});

router.post('/projects', async (req, res) => {
  if (!req.can('projects.manage')) throw httpError(403, 'ليست لديك صلاحية إنشاء المشاريع');
  const d = body.parse(req.body);
  if (!isValid(req.settings, 'projectStatus', d.status)) throw httpError(400, 'حالة مشروع غير معروفة');
  const reserved = String((req.settings && req.settings.taskKey) || DEFAULT_PREFIX).toUpperCase();
  if (d.key && d.key === reserved) throw httpError(400, 'هذا المفتاح محجوز للمهام بلا مشروع');
  if (d.key && await prisma.project.findFirst({ where: { orgId: req.user.orgId, key: d.key }, select: { id: true } })) throw httpError(409, 'مفتاح المشروع مستعمل');
  const ownerId = d.ownerId ?? req.user.id;
  if (!req.scope.has(ownerId)) throw httpError(403, 'المالك خارج نطاقك');
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw httpError(400, 'نهاية المشروع قبل بدايته');
  const p = await prisma.project.create({
    data: {
      orgId: req.user.orgId, ownerId, name: d.name, description: d.description || null, status: d.status,
      key: d.key || await uniqueProjectKey(req.user.orgId, suggestKey(d.name, Date.now() % 1000)),
      startDate: d.startDate ? toDate(d.startDate) : null, endDate: d.endDate ? toDate(d.endDate) : null,
    },
  });
  await audit(req, 'project.create', 'project', p.id, { ownerId });
  res.status(201).json({ id: p.id });
});

router.patch('/projects/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = body.partial().parse(req.body);
  if (d.status !== undefined && !isValid(req.settings, 'projectStatus', d.status)) throw httpError(400, 'حالة مشروع غير معروفة');
  const p = await prisma.project.findFirst({ where: { id, orgId: req.user.orgId }, select: { ownerId: true, key: true } });
  if (!p || !req.scope.has(p.ownerId)) throw httpError(404, 'المشروع غير موجود');
  if (d.key && d.key !== p.key) {
    const reserved = String((req.settings && req.settings.taskKey) || DEFAULT_PREFIX).toUpperCase();
    if (d.key === reserved) throw httpError(400, 'هذا المفتاح محجوز للمهام بلا مشروع');
    if (await prisma.project.findFirst({ where: { orgId: req.user.orgId, key: d.key, id: { not: id } }, select: { id: true } })) throw httpError(409, 'مفتاح المشروع مستعمل');
    await prisma.task.updateMany({ where: { orgId: req.user.orgId, projectId: id }, data: { keyPrefix: d.key } });   /* تُعاد تسمية أرقام مهامه */
  }
  await prisma.project.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.key && { key: d.key }),
      ...(d.startDate !== undefined && { startDate: d.startDate ? toDate(d.startDate) : null }),
      ...(d.endDate !== undefined && { endDate: d.endDate ? toDate(d.endDate) : null }),
    },
  });
  await audit(req, 'project.update', 'project', id, Object.keys(d));
  res.status(204).end();
});

router.delete('/projects/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const p = await prisma.project.findFirst({ where: { id, orgId: req.user.orgId }, select: { ownerId: true, name: true } });
  if (!p || !req.scope.has(p.ownerId)) throw httpError(404, 'المشروع غير موجود');
  await prisma.project.delete({ where: { id } });   // المهام تبقى بدون مشروع
  await audit(req, 'project.delete', 'project', id, { name: p.name });
  res.status(204).end();
});


/* تفاصيل مشروع (للنافذة المنبثقة): مهامه + التعليقات + من يمكن الإشارة إليه */
async function projectAccess(req, id) {
  const upper = ancestors(req.index, req.user.id).map(a => a.id);
  return prisma.project.findFirst({
    where: { id, ...projectVisibleWhere(req, upper) },
    include: {
      owner,
      tasks: {
        select: { id: true, title: true, status: true, priority: true, progress: true, dueDate: true, assignee: { select: { id: true, name: true } } },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
      },
    },
  });
}
function projectMentionable(req, p) {
  const ids = new Set([p.ownerId, ...p.tasks.map(t => t.assignee.id), ...ancestors(req.index, p.ownerId).map(a => a.id)]);
  for (const u of req.index.users) if (u.role === 'CEO') ids.add(u.id);
  return [...ids].filter(i => i !== req.user.id && req.index.byId.get(i) && req.index.byId.get(i).active);
}

router.get('/projects/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const p = await projectAccess(req, id);
  if (!p) throw httpError(404, 'المشروع غير موجود');
  const comments = await prisma.projectComment.findMany({
    where: { projectId: id }, include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { id: 'asc' },
  });
  res.json({
    ...projectJSON(p, fromDate(new Date())),
    canEdit: req.scope.has(p.ownerId) && req.can('projects.manage'),
    tasksList: p.tasks.map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, progress: t.progress,
      dueDate: fromDate(t.dueDate), assignee: t.assignee,
    })),
    comments: comments.map(c => ({ id: c.id, body: c.body, user: c.user, createdAt: c.createdAt })),
    mentionable: projectMentionable(req, p).map(uid => { const u = req.index.byId.get(uid); return { id: u.id, name: u.name, role: u.role }; }),
  });
});

router.post('/projects/:id/comments', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { body: text } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const p = await projectAccess(req, id);
  if (!p) throw httpError(404, 'المشروع غير موجود');
  await prisma.projectComment.create({ data: { projectId: id, userId: req.user.id, body: text } });
  const allowed = new Set(projectMentionable(req, p));
  const mentioned = [...new Set([...text.matchAll(/@\[(\d+)\]/g)].map(m => +m[1]))].filter(x => allowed.has(x));
  if (mentioned.length) {
    await notify(mentioned, `${req.user.name} أشار إليك في مشروع «${p.name}»`, '#/projects', req.user.id, 'MENTION', req.user.name);
  }
  if (p.ownerId !== req.user.id && !mentioned.includes(p.ownerId)) {
    await notify([p.ownerId], `${req.user.name} علّق على مشروعك: ${p.name}`, '#/projects', req.user.id, 'TASK', req.user.name);
  }
  res.status(201).end();
});
module.exports = router;
