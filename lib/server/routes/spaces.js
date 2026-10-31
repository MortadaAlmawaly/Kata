/* المساحات (Spaces): كل مساحة = مشروع بخلفية خاصة وحقول مهام وصلاحيات مستقلة، وتضم لوحات (boards) ولكل لوحة سير عملها (أعمدتها).
   - الإنشاء والتعديل لمن يملك «إدارة اللوحات» (أو مسؤول النظام / المدير التنفيذي).
   - الحقول: تظهر بمهام هذه المساحة فقط. الصلاحيات: لكل شخص أو دور مستوى (مخفي / عرض / تحريك / تعديل) على مهام المساحة. */
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { audit } = require('../audit');
const { uniqueProjectKey, suggestKey, DEFAULT_PREFIX } = require('../issues');

const router = express.Router();
const cfg = req => req.can('boards.manage') || req.can('admin');
const { CAPS, PRESETS, LEGACY } = require('../spacePerms');
const permVal = z.union([z.enum([...Object.keys(PRESETS), ...Object.keys(LEGACY)]), z.object({ caps: z.array(z.enum(CAPS)).max(CAPS.length) })]);

const fieldDef = z.object({
  key: z.string().regex(/^[A-Za-z0-9_]{2,30}$/),
  name: z.string().trim().min(1).max(60),
  type: z.enum(['text', 'longtext', 'number', 'money', 'percent', 'rating', 'date', 'datetime', 'time', 'select', 'radio', 'multiselect', 'tags', 'user', 'users', 'checkbox', 'url', 'email', 'phone', 'color']),
  options: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  section: z.enum(['main', 'side']).default('side'),
  card: z.boolean().default(false),
});
const bg = z.string().trim().max(255).regex(/^(#[0-9a-fA-F]{6}|linear-gradient\([#0-9a-zA-Z ,.%()-]{3,200}\)|\/[\w\-./]{1,200}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{20,200000})$/, 'خلفية غير صالحة');
const body = z.object({
  name: z.string().trim().min(1, 'اسم المساحة مطلوب').max(120),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'مفتاح المساحة 2–10 حروف إنكليزية/أرقام يبدأ بحرف').nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  background: bg.nullable().optional(),
  fields: z.array(fieldDef).max(80).optional(),
  perms: z.object({
    users: z.record(z.string().regex(/^\d{1,9}$/), permVal).optional(),
    roles: z.record(z.enum(['EMPLOYEE', 'MANAGER', 'DIRECTOR', 'GM', 'CEO']), permVal).optional(),
  }).optional(),
});

const spaceJSON = (p, boards, full) => ({
  id: p.id, key: p.key, name: p.name, description: p.description, background: p.background || null,
  fields: (p.settings || {}).fields || [],
  perms: full ? ((p.settings || {}).perms || { users: {}, roles: {} }) : undefined,
  boards: boards.filter(b => ((b.filters || {}).projectId) === p.id).map(b => ({ id: b.id, name: b.name })),
  canManage: !!full,
});

router.get('/spaces', async (req, res) => {
  const full = cfg(req);
  const [list, boards] = await Promise.all([
    prisma.project.findMany({ where: { orgId: req.user.orgId }, orderBy: { id: 'asc' } }),
    prisma.taskBoard.findMany({ where: { orgId: req.user.orgId }, select: { id: true, name: true, filters: true } }),
  ]);
  const { userCaps } = require('../spacePerms');
  const visible = list.filter(p => { if (full) return true; const c = userCaps(p.settings, req.user); return !c || c.includes('view'); });
  res.json(visible.map(p => spaceJSON(p, boards, full)));
});

router.post('/spaces', async (req, res) => {
  if (!cfg(req)) throw httpError(403, 'إنشاء المساحات لمن يملك صلاحية «إدارة اللوحات»');
  const d = body.pick({ name: true, key: true, description: true, background: true }).parse(req.body);
  const reserved = String((req.settings && req.settings.taskKey) || DEFAULT_PREFIX).toUpperCase();
  if (d.key && d.key === reserved) throw httpError(400, 'هذا المفتاح محجوز للمهام بلا مساحة');
  if (d.key && await prisma.project.findFirst({ where: { orgId: req.user.orgId, key: d.key }, select: { id: true } })) throw httpError(409, 'مفتاح المساحة مستعمل');
  const p = await prisma.project.create({
    data: {
      orgId: req.user.orgId, ownerId: req.user.id, name: d.name, description: d.description || null, status: 'ACTIVE',
      key: d.key || await uniqueProjectKey(req.user.orgId, suggestKey(d.name, Date.now() % 1000)),
      background: d.background || null, settings: { fields: [], perms: { users: {}, roles: {} } },
    },
  });
  await audit(req, 'space.create', 'project', p.id, { name: d.name });
  res.status(201).json({ id: p.id });
});

router.patch('/spaces/:id', async (req, res) => {
  if (!cfg(req)) throw httpError(403, 'تعديل المساحات لمن يملك صلاحية «إدارة اللوحات»');
  const id = idParam.parse(req.params.id);
  const d = body.partial().parse(req.body);
  const p = await prisma.project.findFirst({ where: { id, orgId: req.user.orgId }, select: { key: true, settings: true } });
  if (!p) throw httpError(404, 'المساحة غير موجودة');
  if (d.key && d.key !== p.key) {
    const reserved = String((req.settings && req.settings.taskKey) || DEFAULT_PREFIX).toUpperCase();
    if (d.key === reserved) throw httpError(400, 'هذا المفتاح محجوز للمهام بلا مساحة');
    if (await prisma.project.findFirst({ where: { orgId: req.user.orgId, key: d.key, id: { not: id } }, select: { id: true } })) throw httpError(409, 'مفتاح المساحة مستعمل');
    await prisma.task.updateMany({ where: { orgId: req.user.orgId, projectId: id }, data: { keyPrefix: d.key } });
  }
  if (d.fields) {
    const keys = new Set();
    for (const f of d.fields) { if (keys.has(f.key)) throw httpError(400, 'مفتاح حقل مكرّر'); keys.add(f.key); }
  }
  const settings = { ...(p.settings || {}) };
  if (d.fields) settings.fields = d.fields;
  if (d.perms) settings.perms = { users: d.perms.users || {}, roles: d.perms.roles || {} };
  await prisma.project.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.key && { key: d.key }),
      ...(d.background !== undefined && { background: d.background }),
      settings,
    },
  });
  await audit(req, 'space.update', 'project', id, Object.keys(d));
  res.status(204).end();
});

router.delete('/spaces/:id', async (req, res) => {
  if (!cfg(req)) throw httpError(403, 'حذف المساحات لمن يملك صلاحية «إدارة اللوحات»');
  const id = idParam.parse(req.params.id);
  const p = await prisma.project.findFirst({ where: { id, orgId: req.user.orgId }, select: { name: true } });
  if (!p) throw httpError(404, 'المساحة غير موجودة');
  await prisma.project.delete({ where: { id } });   // المهام تبقى بدون مساحة
  await audit(req, 'space.delete', 'project', id, { name: p.name });
  res.status(204).end();
});

module.exports = router;