/* لوحة مسؤول النظام (Admin) — منفصلة عن الهرم الوظيفي:
   - مصفوفة الصلاحيات: أقل دور لكل صلاحية + صلاحيات إضافية لأشخاص بعينهم + تعيين مسؤولين آخرين
   - الدعوات: رابط انضمام بتوكن، صلاحيته محدودة، يمكن إلغاؤه
   - إعدادات الشركة التفصيلية
   - تصدير بيانات الشركة
   - (مالك المنصة فقط) قائمة الشركات وإيقافها */
const crypto = require('crypto');
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { need, sha256, isPlatformAdmin, orgJSON, BCRYPT_ROUNDS } = require('../auth');
const { PERMS, CATALOG, LEVEL, ROLES, level } = require('../permissions');
const { settingsOf, DEFAULT_LIMITS } = require('../defaults');
const { CUSTOM_GROUPS, FALLBACK, customOf } = require('../customItems');
const { assertSeat } = require('../seats');
const bcrypt = require('bcryptjs');
const { audit, notify } = require('../audit');

const router = express.Router();

/* ═══════════ الصلاحيات ═══════════ */
router.get('/admin/permissions', need('admin'), async (req, res) => {
  const users = req.index.users.filter(u => u.active).map(u => {
    const full = req.index.byId.get(u.id);
    return { id: u.id, name: u.name, role: u.role, title: u.title };
  });
  const extras = await prisma.user.findMany({
    where: { orgId: req.user.orgId, active: true },
    select: { id: true, extraPerms: true, deniedPerms: true, isAdmin: true },
  });
  res.json({
    catalog: CATALOG,
    overrides: req.org.permissions || {},
    users: users.map(u => {
      const x = extras.find(e => e.id === u.id) || {};
      return { ...u, extraPerms: Array.isArray(x.extraPerms) ? x.extraPerms : [], deniedPerms: Array.isArray(x.deniedPerms) ? x.deniedPerms : [], isAdmin: !!x.isAdmin };
    }),
  });
});

/* أقل مستوى لكل صلاحية — القيم المطابقة للافتراضي تُحذف من التخزين */
router.put('/admin/permissions', need('admin'), async (req, res) => {
  const body = z.object({ overrides: z.record(z.string(), z.number().int().min(1).max(5)) }).parse(req.body);
  const clean = {};
  for (const [p, lvl] of Object.entries(body.overrides)) {
    if (!CATALOG[p]) throw httpError(400, 'صلاحية غير معروفة: ' + p);
    if (lvl !== CATALOG[p].min) clean[p] = lvl;
  }
  await prisma.organization.update({ where: { id: req.user.orgId }, data: { permissions: clean } });
  await audit(req, 'permissions.update', 'org', req.user.orgId, clean);
  res.status(204).end();
});

/* ═══════════ الأدمن الشامل ═══════════
   شخص واحد فقط (غير المدير التنفيذي) يتحكم بالنظام ككل. يعيّنه ويستبدله مدير الشركة وحده. */
router.get('/admin/global-admin', need('admin'), async (req, res) => {
  const cur = await prisma.user.findFirst({ where: { orgId: req.user.orgId, isAdmin: true, active: true, role: { not: 'CEO' } }, select: { id: true, name: true, role: true, title: true } });
  res.json({
    current: cur || null,
    canManage: req.user.role === 'CEO',
    candidates: req.index.users.filter(u => u.active && u.role !== 'CEO').map(u => ({ id: u.id, name: u.name, role: u.role, title: u.title })),
  });
});
router.put('/admin/global-admin', need('admin'), async (req, res) => {
  if (req.user.role !== 'CEO') throw httpError(403, 'تعيين الأدمن الشامل أو استبداله لمدير الشركة فقط');
  const { userId } = z.object({ userId: z.number().int().positive().nullable() }).parse(req.body);
  if (userId) {
    const t = req.index.byId.get(userId);
    if (!t || !t.active || t.role === 'CEO') throw httpError(400, 'اختر موظفاً فعّالاً غير مدير الشركة');
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { orgId: req.user.orgId, isAdmin: true, role: { not: 'CEO' } }, data: { isAdmin: false } }),
    ...(userId ? [prisma.user.update({ where: { id: userId }, data: { isAdmin: true } })] : []),
  ]);
  await audit(req, 'admin.global', 'user', userId || req.user.id, { userId });
  if (userId) await notify([userId], 'عيّنك مدير الشركة أدمن شامل للنظام', null, req.user.id);
  res.status(204).end();
});
/* صلاحيات إضافية فردية (الأدمن الشامل يُعيَّن من قسمه الخاص فقط) */
router.put('/admin/users/:id/access', need('admin'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const body = z.object({
    extraPerms: z.array(z.string()).max(60).optional(),
    deniedPerms: z.array(z.string()).max(60).optional(),
    isAdmin: z.boolean().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const target = req.index.byId.get(id);
  if (!target) throw httpError(404, 'المستخدم غير موجود');
  if (body.extraPerms && body.extraPerms.some(p => !CATALOG[p])) throw httpError(400, 'صلاحية غير معروفة');
  if (body.deniedPerms && body.deniedPerms.some(p => !CATALOG[p])) throw httpError(400, 'صلاحية غير معروفة');
  if (body.extraPerms && body.deniedPerms) body.extraPerms = body.extraPerms.filter(p => !body.deniedPerms.includes(p));

  if (body.isAdmin !== undefined) throw httpError(400, 'الأدمن الشامل يُعيَّنه مدير الشركة فقط من قسم «الأدمن الشامل»');
  await prisma.user.update({
    where: { id },
    data: {
      ...(body.extraPerms && { extraPerms: [...new Set(body.extraPerms)] }),
      ...(body.deniedPerms && { deniedPerms: [...new Set(body.deniedPerms)] }),
    },
  });
  await audit(req, 'access.update', 'user', id, body);
  await notify([id], 'تم تحديث صلاحياتك من مسؤول النظام', null, req.user.id);
  res.status(204).end();
});

/* ═══════════ الدعوات ═══════════ */
const inviteJSON = i => ({
  id: i.id, email: i.email, name: i.name, role: i.role, managerId: i.managerId, title: i.title, department: i.department,
  status: i.status === 'PENDING' && i.expiresAt < new Date() ? 'EXPIRED' : i.status,
  expiresAt: i.expiresAt, createdAt: i.createdAt, acceptedAt: i.acceptedAt,
});

router.get('/invitations', async (req, res) => {
  if (!req.can('admin') && !req.can('users.invite')) throw httpError(403, 'ليست لديك صلاحية لهذا الإجراء');
  const list = await prisma.invitation.findMany({
    where: { orgId: req.user.orgId, ...(req.can('admin') ? {} : { invitedBy: req.user.id }) },
    orderBy: { id: 'desc' }, take: 200,
  });
  res.json(list.map(inviteJSON));
});

const baseUrl = req => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

router.post('/invitations', async (req, res) => {
  const admin = req.can('admin');
  if (!admin && !req.can('users.invite')) throw httpError(403, 'ليست لديك صلاحية لهذا الإجراء');
  const d = z.object({
    email: z.string().trim().toLowerCase().email('بريد غير صالح').max(191),
    name: z.string().trim().max(60).optional(),
    role: z.enum(ROLES).refine(r => r !== 'CEO', 'لا يمكن دعوة مدير تنفيذي آخر'),
    managerId: z.number().int().positive().optional(),
    title: z.string().trim().max(80).optional(),
    department: z.string().trim().max(60).optional(),
  }).parse(req.body);

  /* غير المسؤول: دور أقل من دوره ورئيس ضمن نطاقه. المسؤول: أي دور وأي رئيس بالشركة */
  if (!admin && level(d.role) >= level(req.user.role)) throw httpError(403, 'ما تقدر تدعو بدور بمستواك أو أعلى');
  let managerId = d.managerId ?? (admin ? null : req.user.id);
  if (managerId) {
    const m = req.index.byId.get(managerId);
    if (!m || !m.active) throw httpError(400, 'الرئيس المباشر غير موجود أو معطّل');
    if (!admin && !req.scope.has(managerId)) throw httpError(403, 'الرئيس المباشر خارج نطاقك');
    if (level(m.role) <= level(d.role)) throw httpError(400, 'الرئيس المباشر لازم يكون بمستوى أعلى من الدور');
  }
  if (await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } })) {
    throw httpError(409, 'هذا البريد مسجّل مسبقاً بحساب');
  }
  await assertSeat(req.user.orgId);
  const open = await prisma.invitation.findFirst({ where: { orgId: req.user.orgId, email: d.email, status: 'PENDING', expiresAt: { gt: new Date() } } });
  if (open) throw httpError(409, 'توجد دعوة سارية لهذا البريد — ألغها أولاً أو أعد إرسالها');

  const token = crypto.randomBytes(32).toString('base64url');
  const inv = await prisma.invitation.create({
    data: {
      orgId: req.user.orgId, invitedBy: req.user.id, email: d.email, name: d.name || null, role: d.role,
      managerId, title: d.title || null, department: d.department || null, tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + req.settings.inviteDays * 864e5),
    },
  });
  await audit(req, 'invite.create', 'invitation', inv.id, { email: d.email, role: d.role });
  /* الرابط يظهر مرة وحدة — نخزّن hash فقط. الإرسال بالبريد/واتساب يدوي أو عبر SMTP لاحقاً */
  res.status(201).json({ id: inv.id, link: `${baseUrl(req)}/join?token=${token}`, expiresAt: inv.expiresAt });
});

/* إعادة إصدار الرابط (ينتهي القديم) */
router.post('/invitations/:id/renew', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const inv = await prisma.invitation.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!inv || (!req.can('admin') && inv.invitedBy !== req.user.id)) throw httpError(404, 'الدعوة غير موجودة');
  if (inv.status === 'ACCEPTED') throw httpError(409, 'تم قبول هذه الدعوة مسبقاً');
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + req.settings.inviteDays * 864e5);
  await prisma.invitation.update({ where: { id }, data: { tokenHash: sha256(token), status: 'PENDING', expiresAt } });
  res.json({ link: `${baseUrl(req)}/join?token=${token}`, expiresAt });
});

router.delete('/invitations/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const inv = await prisma.invitation.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!inv || (!req.can('admin') && inv.invitedBy !== req.user.id)) throw httpError(404, 'الدعوة غير موجودة');
  /* ?permanent=1 → حذف السجل نهائياً من القائمة (الرابط يتوقف). بدونها: إلغاء فقط ويبقى السجل */
  if (req.query.permanent === '1') {
    await prisma.invitation.delete({ where: { id } });
    await audit(req, 'invite.delete', 'invitation', id, { email: inv.email });
    return res.status(204).end();
  }
  if (inv.status === 'ACCEPTED') throw httpError(409, 'تم قبول هذه الدعوة مسبقاً');
  await prisma.invitation.update({ where: { id }, data: { status: 'REVOKED' } });
  await audit(req, 'invite.revoke', 'invitation', id, { email: inv.email });
  res.status(204).end();
});

/* المسميات المسموح بتخصيصها (مفاتيح ثابتة؛ الأسماء من اختيار الشركة) */
const LABEL_KEYS = {
  roles: ['EMPLOYEE', 'MANAGER', 'DIRECTOR', 'GM', 'CEO'],
  taskStatus: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'],
  priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  issueType: ['TASK', 'BUG', 'STORY', 'EPIC', 'SUBTASK'],
  requestType: ['EXPENSE', 'PURCHASE', 'BUDGET', 'LEAVE'],
  eventType: ['MEETING', 'APPOINTMENT', 'EVENT', 'HOLIDAY', 'OTHER'],
  projectStatus: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'DONE'],
  pages: ['dashboard', 'calendar', 'tasks', 'projects', 'goals', 'requests', 'attendance', 'announcements', 'team', 'reports', 'audit', 'settings'],
};
function cleanLabels(input) {
  const out = {};
  for (const [group, map] of Object.entries(input)) {
    if (!LABEL_KEYS[group]) throw httpError(400, 'مجموعة مسميات غير معروفة: ' + group);
    for (const [key, val] of Object.entries(map)) {
      if (!LABEL_KEYS[group].includes(key)) throw httpError(400, 'مسمى غير معروف: ' + key);
      const v = String(val).replace(/[\u0000-\u001f<>]/g, '').trim();
      if (v) (out[group] = out[group] || {})[key] = v;
    }
  }
  return out;
}

/* ═══════════ إعدادات الشركة التفصيلية ═══════════ */
router.patch('/admin/settings', need('admin'), async (req, res) => {
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح');
  const money = z.number().min(0).max(999999999999);
  const d = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    approvalLimits: z.object({ MANAGER: money, DIRECTOR: money, GM: money }).optional(),
    settings: z.object({
      timezone: z.string().max(64).refine(tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } }, 'منطقة زمنية غير صالحة'),
      weekStart: z.number().int().min(0).max(6),
      workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      workStart: time,
      workEnd: time,
      leaveDefault: z.number().int().min(0).max(365),
      passwordMin: z.number().int().min(6).max(64),
      sessionDays: z.number().int().min(1).max(90),
      inviteDays: z.number().int().min(1).max(30),
      requireApprovalNote: z.boolean(),
      /* مسميات مخصّصة: { roles: {MANAGER: 'مشرف'}, taskStatus: {...}, ... } — الفارغ يرجع للافتراضي */
      labels: z.record(z.string(), z.record(z.string(), z.string().max(30))),
      graceMinutes: z.number().int().min(0).max(120),
      customFields: z.array(z.object({
        key: z.string().regex(/^[A-Za-z0-9_]{2,30}$/, 'مفتاح الحقل غير صالح'),
        name: z.string().trim().min(1).max(60),
        type: z.enum(['text', 'longtext', 'number', 'money', 'percent', 'rating', 'date', 'datetime', 'time', 'select', 'radio', 'multiselect', 'tags', 'user', 'users', 'checkbox', 'url', 'email', 'phone', 'color']),
        options: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
        section: z.enum(['main', 'side']).default('side'),
        card: z.boolean().default(false),
        issueTypes: z.array(z.string().max(30)).max(20).optional(),
      })).max(150),
      fieldLabels: z.record(z.string().regex(/^[A-Za-z0-9_:\-]{2,48}$/), z.string().trim().max(40)),
      typeLayouts: z.record(z.string().regex(/^[A-Za-z0-9_]{2,30}$/), z.object({
        description: z.array(z.string().regex(/^[A-Za-z0-9_:]{2,40}$/)).max(80),
        context: z.array(z.string().regex(/^[A-Za-z0-9_:]{2,40}$/)).max(80),
        sections: z.record(z.string().regex(/^[A-Za-z0-9_]{2,20}$/), z.string().trim().max(40)).optional(),
      })),
      hiddenItems: z.record(z.string().regex(/^[A-Za-z]{2,30}$/), z.array(z.string().max(40)).max(100)),
      fieldSections: z.object({ main: z.string().trim().max(40).optional(), side: z.string().trim().max(40).optional() }),
      automations: z.array(z.object({
        id: z.string().regex(/^[A-Za-z0-9_]{2,30}$/),
        name: z.string().trim().min(1).max(60),
        trigger: z.enum(['MANUAL', 'STATUS_CHANGED', 'CREATED']),
        status: z.string().max(40).optional(),
        actions: z.array(z.object({
          type: z.enum(['setStatus', 'setPriority', 'assign', 'addLabel', 'notify', 'comment', 'startTimer', 'stopTimer', 'setField']),
          value: z.any().optional(),
        })).min(1).max(8),
      })).max(60),      taskKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'بادئة المهام 2–10 حروف إنكليزية/أرقام تبدأ بحرف'),
      /* حالات مهام إضافية: بلا حد معقول للعدد (سقف الأمان 200) */
      customItems: z.object(Object.fromEntries(CUSTOM_GROUPS.map(g => [g, z.array(z.object({
        key: z.string().regex(/^[A-Za-z0-9_]{2,30}$/, 'مفتاح غير صالح'),
        name: z.string().trim().min(1).max(30),
      })).max(200).optional()]))).partial(),
      taskStatuses: z.array(z.object({
        key: z.string().regex(/^[A-Za-z0-9_]{2,30}$/, 'مفتاح الحالة غير صالح'),
        name: z.string().trim().min(1).max(30),
        board: z.number().int().positive().optional(),   // حالة خاصة بلوحة واحدة
      })).max(200),
      leaveTypes: z.array(z.object({
        key: z.string().regex(/^[a-z0-9_]{2,20}$/, 'مفتاح نوع الإجازة حروف إنكليزية صغيرة وأرقام'),
        name: z.string().trim().min(1).max(30),
        days: z.number().int().min(0).max(365).nullable(),
        paid: z.boolean(),
      })).min(1).max(12).refine(a => a.some(t => t.key === 'annual') && new Set(a.map(t => t.key)).size === a.length, 'نوع «annual» مطلوب والمفاتيح غير مكررة'),
    }).partial().optional(),
    applyLeaveToAll: z.boolean().optional(),   // تطبيق رصيد الإجازة الافتراضي على كل الموظفين
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);

  if (d.settings && d.settings.labels) d.settings.labels = cleanLabels(d.settings.labels);
  const cleanList = (arr, what) => {
    const list = arr.map(s => ({ key: s.key, name: s.name.replace(/[\u0000-\u001f<>]/g, '').trim(), ...(s.board ? { board: s.board } : {}) })).filter(s => s.name);
    if (new Set(list.map(s => s.key)).size !== list.length) throw httpError(400, `مفاتيح ${what} مكررة`);
    return list;
  };
  /* عنصر حُذف: سجلاته ترجع للقيمة الافتراضية حتى لا تضيع من الشاشات */
  const removedKeys = (before, after) => { const keep = new Set(after.map(s => s.key)); return before.map(s => s.key).filter(k => !keep.has(k)); };
  const orgId = req.user.orgId;
  if (d.settings && d.settings.taskStatuses) {
    const list = d.settings.taskStatuses = cleanList(d.settings.taskStatuses, 'الحالات');
    const gone = removedKeys(customOf(req.settings, 'taskStatus'), list);
    if (gone.length) await prisma.task.updateMany({ where: { orgId, status: { in: gone } }, data: { status: FALLBACK.taskStatus } });
  }
  if (d.settings && d.settings.customItems) {
    const next = { ...(req.settings.customItems || {}) };
    const tables = {
      priority: gone => prisma.task.updateMany({ where: { orgId, priority: { in: gone } }, data: { priority: FALLBACK.priority } }),
      issueType: gone => prisma.task.updateMany({ where: { orgId, issueType: { in: gone } }, data: { issueType: FALLBACK.issueType } }),
      requestType: gone => prisma.request.updateMany({ where: { orgId, type: { in: gone } }, data: { type: FALLBACK.requestType } }),
      eventType: gone => prisma.event.updateMany({ where: { orgId, type: { in: gone } }, data: { type: FALLBACK.eventType } }),
      projectStatus: gone => prisma.project.updateMany({ where: { orgId, status: { in: gone } }, data: { status: FALLBACK.projectStatus } }),
    };
    for (const g of CUSTOM_GROUPS) {
      if (!d.settings.customItems[g]) continue;
      const list = cleanList(d.settings.customItems[g], 'العناصر');
      const gone = removedKeys(customOf(req.settings, g), list);
      if (gone.length) await tables[g](gone);
      next[g] = list;
    }
    d.settings.customItems = next;
  }

  const l = d.approvalLimits;
  if (l && !(l.MANAGER <= l.DIRECTOR && l.DIRECTOR <= l.GM)) throw httpError(400, 'الحدود لازم تتصاعد: مدير القسم ≤ مدير الإدارة ≤ المدير العام');
  if (d.settings && d.settings.workStart && d.settings.workEnd && d.settings.workEnd <= d.settings.workStart) {
    throw httpError(400, 'نهاية الدوام قبل بدايته');
  }
  await prisma.organization.update({
    where: { id: req.user.orgId },
    data: {
      ...(d.name && { name: d.name }),
      ...(d.currency && { currency: d.currency }),
      ...(l && { approvalLimits: l }),
      ...(d.settings && { settings: { ...(req.org.settings || {}), ...d.settings } }),
    },
  });
  if (d.applyLeaveToAll) {
    const days = (d.settings && d.settings.leaveDefault) ?? req.settings.leaveDefault;
    await prisma.user.updateMany({ where: { orgId: req.user.orgId }, data: { leaveEntitlement: days } });
  }
  await audit(req, 'org.update', 'org', req.user.orgId, d);
  res.status(204).end();
});

/* ═══════════ تصدير بيانات الشركة (نسخة احتياطية JSON) ═══════════ */
router.get('/admin/export', need('admin'), async (req, res) => {
  const orgId = req.user.orgId;
  const [users, tasks, goals, projects, requests, events, announcements] = await Promise.all([
    prisma.user.findMany({ where: { orgId }, select: { id: true, name: true, email: true, role: true, title: true, department: true, managerId: true, active: true, createdAt: true } }),
    prisma.task.findMany({ where: { orgId } }),
    prisma.goal.findMany({ where: { orgId }, include: { keyResults: true } }),
    prisma.project.findMany({ where: { orgId } }),
    prisma.request.findMany({ where: { orgId }, include: { steps: true } }),
    prisma.event.findMany({ where: { orgId }, include: { attendees: true } }),
    prisma.announcement.findMany({ where: { orgId } }),
  ]);
  await audit(req, 'org.export', 'org', orgId);
  res.setHeader('Content-Disposition', 'attachment; filename="company-export.json"');
  res.json({ exportedAt: new Date().toISOString(), org: orgJSON(req.org), users, tasks, goals, projects, requests, events, announcements });
});

/* ═══════════ مالك المنصة (PLATFORM_ADMINS بالـ .env) ═══════════ */
const platformOnly = (req, res, next) => (isPlatformAdmin(req.user) ? next() : next(httpError(403, 'ليست لديك صلاحية لهذا الإجراء')));

router.get('/platform/orgs', platformOnly, async (req, res) => {
  const [orgs, active, ceos] = await Promise.all([
    prisma.organization.findMany({ include: { _count: { select: { users: true, tasks: true } } }, orderBy: { id: 'asc' } }),
    prisma.user.groupBy({ by: ['orgId'], where: { active: true }, _count: { _all: true } }),
    prisma.user.findMany({ where: { role: 'CEO' }, select: { orgId: true, name: true, email: true, lastLoginAt: true }, orderBy: { id: 'asc' } }),
  ]);
  const act = new Map(active.map(a => [a.orgId, a._count._all]));
  const ceoBy = new Map();
  ceos.forEach(c => { if (!ceoBy.has(c.orgId)) ceoBy.set(c.orgId, c); });
  res.json(orgs.map(o => ({
    id: o.id, name: o.name, users: o._count.users, activeUsers: act.get(o.id) || 0, maxUsers: o.maxUsers,
    ceo: ceoBy.get(o.id) ? { name: ceoBy.get(o.id).name, email: ceoBy.get(o.id).email, lastLoginAt: ceoBy.get(o.id).lastLoginAt } : null,
    tasks: o._count.tasks, suspended: o.suspended, createdAt: o.createdAt,
  })));
});

/* إضافة شركة من مالك المنصة: تُنشأ الشركة ومديرها التنفيذي (مسؤول النظام) بكلمة مرور مؤقتة تُعرض مرة واحدة */
router.post('/platform/orgs', platformOnly, async (req, res) => {
  const d = z.object({
    company: z.string().trim().min(2, 'اسم الشركة مطلوب').max(100),
    name: z.string().trim().min(1, 'اسم المدير مطلوب').max(60),
    email: z.string().trim().toLowerCase().email('بريد غير صالح').max(191),
    maxUsers: z.number().int().min(1, 'الحد الأدنى 1').max(100000).nullable().optional(),
  }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } })) throw httpError(409, 'هذا البريد مسجّل مسبقاً');
  const password = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const created = await prisma.$transaction(async tx => {
    const org = await tx.organization.create({ data: { name: d.company, approvalLimits: DEFAULT_LIMITS, maxUsers: d.maxUsers ?? null } });
    await tx.user.create({
      data: { orgId: org.id, name: d.name, email: d.email, passwordHash, role: 'CEO', title: 'المدير التنفيذي', isAdmin: true, mustChangePassword: true },
    });
    return org;
  });
  await audit(req, 'platform.org.create', 'org', created.id, { name: d.company, maxUsers: d.maxUsers ?? null });
  res.status(201).json({ id: created.id, tempPassword: password });
});

/* تعديل شركة: الإيقاف/التفعيل و/أو الحد الأقصى للمستخدمين (null = بلا حد) و/أو الاسم */
router.patch('/platform/orgs/:id', platformOnly, async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({
    suspended: z.boolean().optional(),
    maxUsers: z.number().int().min(1, 'الحد الأدنى 1').max(100000).nullable().optional(),
    name: z.string().trim().min(2).max(100).optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  if (d.suspended === true && id === req.user.orgId) throw httpError(400, 'لا يمكن إيقاف شركتك الحالية');
  await prisma.organization.update({
    where: { id },
    data: {
      ...(d.suspended !== undefined && { suspended: d.suspended }),
      ...(d.maxUsers !== undefined && { maxUsers: d.maxUsers }),
      ...(d.name && { name: d.name }),
    },
  });
  if (d.suspended) await prisma.session.deleteMany({ where: { user: { orgId: id } } });
  await audit(req, 'platform.org.update', 'org', id, d);
  res.status(204).end();
});

module.exports = router;
