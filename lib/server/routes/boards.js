/* لوحات المهام المتعددة: كل لوحة بأعمدتها وشكل بطاقاتها ومسميات حقولها الخاصة.
   - الأعمدة تشير لحالات الشركة (status) مع اسم ولون خاصين باللوحة؛ يمكن إنشاء حالة جديدة من اللوحة نفسها.
   - المرشّحات: مشروع و/أو أنواع مهام. البطاقة: الحقول الظاهرة والحقول المخصصة والكثافة واللون.
   - المسميات: تعيد تسمية حقول المهمة (المنفّذ، الأولوية…) داخل هذه اللوحة فقط.
   الإدارة: من يملك رؤية الفريق (مدير قسم فما فوق) أو مسؤول النظام. الجميع يرى اللوحات. */
const crypto = require('crypto');
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { audit } = require('../audit');
const { isValid, BUILTIN } = require('../customItems');
const { userCaps } = require('../spacePerms');

const router = express.Router();

const CARD_FIELDS = ['key', 'type', 'priority', 'assignee', 'points', 'due', 'labels', 'progress', 'checklist', 'comments', 'epic', 'timer'];
const DEFAULT_CARD = { fields: Object.fromEntries(CARD_FIELDS.map(k => [k, true])), custom: [], density: 'comfortable', color: 'none' };

/* دور المستخدم باللوحة: MANAGE (الأدمن/المدير التنفيذي فقط — هما من يتحكّم بشكل اللوحة والمهام) · EDIT · VIEW · null = لا يراها */
const RANK = { VIEW: 1, EDIT: 2, MANAGE: 3 };
/* صلاحية «إدارة اللوحات»: الأدمن والمدير التنفيذي افتراضياً، ويمنحها الأدمن لمن يشاء من الإعدادات ← الصلاحيات */
const cfg = req => req.can('boards.manage') || req.can('admin');
/* صلاحيات المساحات المرتبطة باللوحات (تُحمَّل مرة لكل طلب) */
async function loadSpaceMap(req) {
  if (req.spaceMap) return;
  const rows = await prisma.project.findMany({ where: { orgId: req.user.orgId }, select: { id: true, settings: true } });
  req.spaceMap = new Map(rows.map(r => [r.id, r.settings]));
}
function roleOf(req, b) {
  if (cfg(req)) return 'MANAGE';
  const pid = (b.filters || {}).projectId;
  if (pid && req.spaceMap) {
    const caps = userCaps(req.spaceMap.get(pid), req.user);
    if (caps && !caps.includes('view')) return null;                 // مخفية عنه
    if (caps && caps.includes('manageBoard')) return 'MANAGE';       // يخصّص هذه اللوحة
    if (caps && caps.includes('view')) return caps.some(c => ['create', 'edit', 'move'].includes(c)) ? 'EDIT' : 'VIEW';   // أُضيف يدوياً للوحة
  }
  if (Array.isArray((b.detail || {}).hiddenFor) && b.detail.hiddenFor.includes(req.user.id)) return null;   // لوحة مخفية عن هذا المستخدم
  const m = (Array.isArray(b.members) ? b.members : []).find(x => x.userId === req.user.id);
  if (m) return m.role === 'MANAGE' ? 'EDIT' : m.role;
  if (b.visibility === 'MEMBERS') return b.createdBy === req.user.id ? 'EDIT' : null;
  return 'EDIT';
}
const boardJSON = (b, role) => ({
  id: b.id, name: b.name, position: b.position, autoColumns: b.autoColumns, myRole: role,
  visibility: b.visibility || 'ALL', members: role === 'MANAGE' ? (Array.isArray(b.members) ? b.members : []) : undefined,
  columns: Array.isArray(b.columns) ? b.columns : [],
  filters: b.filters || {}, card: { ...DEFAULT_CARD, ...(b.card || {}), fields: { ...DEFAULT_CARD.fields, ...((b.card || {}).fields || {}) } },
  labels: b.labels || {}, fields: Array.isArray(b.fields) ? b.fields : [], detail: b.detail || {},
});
const need = req => { if (!cfg(req)) throw httpError(403, 'إنشاء اللوحات وتعديل شكل المهام لمن يملك صلاحية «إدارة اللوحات»'); };

/* أول مرة: لوحة رئيسية تتبع حالات الشركة */
async function ensureDefault(req) {
  const n = await prisma.taskBoard.count({ where: { orgId: req.user.orgId } });
  if (n) return;
  await prisma.taskBoard.create({
    data: { orgId: req.user.orgId, name: 'اللوحة الرئيسية', position: 0, autoColumns: true, columns: BUILTIN.taskStatus.map(s => ({ status: s })), createdBy: req.user.id },
  });
}

router.get('/boards', async (req, res) => {
  await ensureDefault(req);
  await loadSpaceMap(req);
  const list = await prisma.taskBoard.findMany({ where: { orgId: req.user.orgId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  res.json(list.map(b => [b, roleOf(req, b)]).filter(([, r]) => r).map(([b, r]) => boardJSON(b, r)));
});

const body = z.object({
  name: z.string().trim().min(1, 'اسم اللوحة مطلوب').max(60),
  position: z.number().int().min(0).max(999).optional(),
  autoColumns: z.boolean().optional(),
  columns: z.array(z.object({
    status: z.string().max(40).optional(),
    newName: z.string().trim().min(1).max(40).optional(),   // ينشئ حالة جديدة للشركة
    name: z.string().trim().max(40).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    max: z.number().int().min(1).max(999).nullable().optional(),   // حد WIP الأعلى
    min: z.number().int().min(1).max(999).nullable().optional(),   // حد WIP الأدنى
    noCreate: z.boolean().optional(),   // true = لا يُسمح بإنشاء مهام جديدة بهذا العمود
  })).max(30),
  filters: z.object({
    projectId: z.number().int().positive().nullable().optional(),
    issueTypes: z.array(z.string().max(30)).max(20).optional(),
  }).optional(),
  card: z.object({
    fields: z.record(z.string(), z.boolean()).optional(),
    custom: z.array(z.string().max(40)).max(40).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    color: z.enum(['none', 'priority', 'type', 'assignee', 'jql']).optional(),
    rules: z.array(z.object({ jql: z.string().trim().min(1).max(300), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().trim().max(40).optional() })).max(20).optional(),
    daysInColumn: z.boolean().optional(),
  }).optional(),
  labels: z.record(z.string().regex(/^[A-Za-z0-9_:\-]{2,48}$/), z.string().trim().max(40)).optional(),
  fields: z.array(z.object({
    key: z.string().regex(/^[A-Za-z0-9_]{2,30}$/),
    name: z.string().trim().min(1).max(60),
    type: z.enum(['text', 'longtext', 'number', 'money', 'percent', 'rating', 'date', 'datetime', 'time', 'select', 'radio', 'multiselect', 'tags', 'user', 'users', 'checkbox', 'url', 'email', 'phone', 'color']),
    options: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
    section: z.enum(['main', 'side']).default('side'),
    card: z.boolean().default(false),
  })).max(60).optional(),
  detail: z.object({
    hide: z.array(z.string().max(48)).max(100).optional(), order: z.array(z.string().max(30)).max(40).optional(),
    types: z.array(z.object({ key: z.string().regex(/^bt_[a-z0-9]{3,12}$/), name: z.string().trim().min(1).max(40) })).max(30).optional(),
    icon: z.object({ k: z.string().regex(/^[a-z]{2,20}$/), c: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
    hiddenFor: z.array(z.number().int().positive()).max(500).optional(),
    transitions: z.array(z.object({ from: z.string().max(40), to: z.string().max(40) })).max(600).optional(),
    wfPos: z.record(z.string().max(40), z.object({ x: z.number().min(-5000).max(5000), y: z.number().min(-5000).max(5000) })).optional(),
    priorities: z.array(z.object({ key: z.string().regex(/^bp_[a-z0-9]{3,12}$/), name: z.string().trim().min(1).max(40) })).max(20).optional(),
    typeLayouts: z.record(z.string().regex(/^[A-Za-z0-9_]{2,30}$/), z.object({
      description: z.array(z.string().regex(/^[A-Za-z0-9_:]{2,40}$/)).max(80), context: z.array(z.string().regex(/^[A-Za-z0-9_:]{2,40}$/)).max(80),
      sections: z.record(z.string().regex(/^[A-Za-z0-9_]{2,20}$/), z.string().trim().max(40)).optional(),
    })).optional(),
  }).optional(),
  visibility: z.enum(['ALL', 'MEMBERS']).optional(),
  members: z.array(z.object({ userId: z.number().int().positive(), role: z.enum(['VIEW', 'EDIT', 'MANAGE']) })).max(200).optional(),
});

/* يحوّل الأعمدة إلى [{status,name,color}] وينشئ الحالات الجديدة بإعدادات الشركة */
async function resolveColumns(req, columns, boardId) {
  const out = [];
  const created = [];
  const seen = new Set();
  let settings = null;
  for (const c of columns) {
    let status = c.status;
    if (!status && c.newName) {
      if (!settings) {
        const org = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { settings: true } });
        settings = { ...(org.settings || {}) };
        settings.taskStatuses = Array.isArray(settings.taskStatuses) ? [...settings.taskStatuses] : [];
      }
      status = 's' + crypto.randomBytes(5).toString('hex');
      settings.taskStatuses.push({ key: status, name: c.newName, ...(boardId ? { board: boardId } : {}) });   // الحالة الجديدة خاصة بهذه اللوحة
      created.push(status);
    }
    if (!status) throw httpError(400, 'عمود بلا حالة');
    if (!(settings ? isValid({ ...req.settings, taskStatuses: settings.taskStatuses }, 'taskStatus', status) : isValid(req.settings, 'taskStatus', status))) throw httpError(400, 'حالة عمود غير معروفة');
    if (seen.has(status)) throw httpError(400, 'حالة مكررة بين الأعمدة');
    seen.add(status);
    out.push({ status, ...(c.name ? { name: c.name } : {}), ...(c.color ? { color: c.color } : {}), ...(c.max ? { max: c.max } : {}), ...(c.min ? { min: c.min } : {}), ...(c.noCreate ? { noCreate: true } : {}) });
  }
  if (settings) {
    await prisma.organization.update({ where: { id: req.user.orgId }, data: { settings } });
  }
  out.created = created;   // خاصية جانبية (لا تُحفظ مع JSON)
  return out;
}

/* ملكية الحالات: الحالة الجديدة التي تُنشأ من لوحة تخصّها وحدها */
async function ownStatuses(req, boardId, keys) {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { settings: true } });
  const settings = { ...(org.settings || {}) };
  settings.taskStatuses = (Array.isArray(settings.taskStatuses) ? settings.taskStatuses : []).map(s => (keys.includes(s.key) ? { ...s, board: boardId } : s));
  await prisma.organization.update({ where: { id: req.user.orgId }, data: { settings } });
}
async function releaseStatuses(req, boardId) {   // عند حذف اللوحة تصير حالاتها عامة بدل أن تضيع
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { settings: true } });
  const settings = { ...(org.settings || {}) };
  if (!Array.isArray(settings.taskStatuses)) return;
  settings.taskStatuses = settings.taskStatuses.map(s => { if (s.board !== boardId) return s; const { board, ...rest } = s; void board; return rest; });
  await prisma.organization.update({ where: { id: req.user.orgId }, data: { settings } });
}

router.post('/boards', async (req, res) => {
  need(req);
  const d = body.parse(req.body);
  const columns = await resolveColumns(req, d.columns.length ? d.columns : BUILTIN.taskStatus.map(s => ({ status: s })));
  const max = await prisma.taskBoard.aggregate({ where: { orgId: req.user.orgId }, _max: { position: true } });
  const createdStatuses = columns.created || [];
  const b = await prisma.taskBoard.create({
    data: { orgId: req.user.orgId, name: d.name, position: (max._max.position ?? -1) + 1, autoColumns: false, columns, filters: d.filters || {}, card: d.card || DEFAULT_CARD, labels: d.labels || {}, fields: d.fields || [], detail: d.detail || {}, visibility: d.visibility || 'ALL',
      members: d.visibility === 'MEMBERS' ? (d.members || []) : [], createdBy: req.user.id },
  });
  if (createdStatuses.length) await ownStatuses(req, b.id, createdStatuses);
  await audit(req, 'board.create', 'board', b.id, { name: b.name });
  res.status(201).json({ id: b.id });
});

router.patch('/boards/:id', async (req, res) => {
  await loadSpaceMap(req);
  const id = idParam.parse(req.params.id);
  const d = body.partial().parse(req.body);
  const cur = await prisma.taskBoard.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!cur) throw httpError(404, 'اللوحة غير موجودة');
  if (roleOf(req, cur) !== 'MANAGE') throw httpError(403, 'تخصيص اللوحة لمن يملك صلاحية «إدارة اللوحات» أو خاصية «تخصيص اللوحة» عليها');
  const data = {};
  if (d.visibility !== undefined) data.visibility = d.visibility;
  if (d.members !== undefined) {
    const ok = new Set(req.index.users.filter(u => u.active).map(u => u.id));
    data.members = [...new Map(d.members.filter(m => ok.has(m.userId)).map(m => [m.userId, m])).values()];
  }
  if (d.name !== undefined) data.name = d.name;
  if (d.position !== undefined) data.position = d.position;
  if (d.autoColumns !== undefined) data.autoColumns = d.autoColumns;
  if (d.columns !== undefined) { data.columns = [...await resolveColumns(req, d.columns, id)]; if (d.autoColumns === undefined) data.autoColumns = false; }
  if (d.filters !== undefined) data.filters = d.filters;
  if (d.card !== undefined) data.card = d.card;
  if (d.labels !== undefined) data.labels = d.labels;
  if (d.fields !== undefined) data.fields = d.fields;
  if (d.detail !== undefined) data.detail = d.detail;
  await prisma.taskBoard.update({ where: { id }, data });
  await audit(req, 'board.update', 'board', id, Object.keys(d));
  res.status(204).end();
});

router.delete('/boards/:id', async (req, res) => {
  await loadSpaceMap(req);
  need(req);
  const id = idParam.parse(req.params.id);
  const cur = await prisma.taskBoard.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!cur) throw httpError(404, 'اللوحة غير موجودة');
  if (roleOf(req, cur) !== 'MANAGE') throw httpError(403, 'حذف اللوحة لمن يملك صلاحية «إدارة اللوحات»');
  if ((await prisma.taskBoard.count({ where: { orgId: req.user.orgId } })) <= 1) throw httpError(409, 'لا يمكن حذف آخر لوحة');
  await prisma.taskBoard.delete({ where: { id } });
  await releaseStatuses(req, id);
  await audit(req, 'board.delete', 'board', id, { name: cur.name });
  res.status(204).end();
});

module.exports = router;
module.exports.RANK = RANK;
