const crypto = require('crypto');
const express = require('./express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('./express');
const prisma = require('./db');
const { z, httpError } = require('./validate');
const { effectivePerms, LEVEL, CATALOG } = require('./permissions');
const { loadIndex, scopeOf } = require('./hierarchy');
const { DEFAULT_LIMITS, settingsOf } = require('./defaults');
const { audit } = require('./audit');
const { assertSeat } = require('./seats');
const push = require('./push');
const { removeSubscriptionOnLogout } = require('./pushScope');
const { emit } = require('./integrations');
const { createLoginGuard } = require('./loginGuard');

const COOKIE = 'sid';
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);   // يمنع كشف البريد من زمن الرد

const sha256 = t => crypto.createHash('sha256').update(t).digest('hex');
const platformAdmins = () => (process.env.PLATFORM_ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isPlatformAdmin = u => platformAdmins().includes(u.email.toLowerCase());

function cookieOptions(expires) {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', ...(expires ? { expires } : {}) };
}

async function createSession(res, userId, days = 14) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + days * 864e5);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  res.cookie(COOKIE, token, cookieOptions(expiresAt));
}

/* يجهّز: req.user (مع الشركة) · req.index (شجرة الشركة) · req.scope (نفسي + من تحتي)
   · req.perms (الصلاحيات الفعلية) · req.can(perm) · req.settings */
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { org: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active || session.user.org.suspended) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    res.clearCookie(COOKIE, cookieOptions());
    return res.status(401).json({ error: 'انتهت الجلسة، سجّل الدخول مجدداً' });
  }
  req.user = session.user;
  req.org = session.user.org;
  req.settings = settingsOf(req.org);
  req.index = await loadIndex(req.user.orgId);
  req.scope = scopeOf(req.index, req.user);
  req.perms = effectivePerms(req.user, req.org);
  req.can = p => req.perms.has(p);
  next();
}

/* حارس صلاحية: need('audit.view') أو need('admin') */
const need = perm => (req, res, next) =>
  req.can(perm) ? next() : next(httpError(403, 'ليست لديك صلاحية لهذا الإجراء'));

const purgeExpiredSessions = () => prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

const publicUser = u => ({
  id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, department: u.department,
  phone: u.phone, managerId: u.managerId, mustChangePassword: u.mustChangePassword, isAdmin: u.isAdmin,
});
/* إعدادات الشركة بدون أسرار (توكن واتساب لا يغادر السيرفر) */
function publicSettings(o) {
  const s = { ...settingsOf(o) };
  if (s.whatsapp) s.whatsapp = { enabled: s.whatsapp.enabled !== false, phoneNumberId: s.whatsapp.phoneNumberId || '', countryCode: s.whatsapp.countryCode || '964', configured: !!s.whatsapp.token };
  return s;
}
const orgJSON = o => ({
  id: o.id, name: o.name, currency: o.currency, approvalLimits: o.approvalLimits,
  settings: publicSettings(o), permissions: o.permissions || {}, maxUsers: o.maxUsers ?? null,
});

/* ═══════════ Routes ═══════════ */
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
});

const email = z.string().trim().toLowerCase().email('بريد غير صالح').max(191);
const name = z.string().trim().min(1, 'الاسم مطلوب').max(60);
const passwordFor = min => z.string().min(min, `كلمة المرور ${min} أحرف على الأقل`).max(200);
const password = passwordFor(8);

/* تسجيل شركة جديدة: ينشئ الشركة + أول مستخدم (مدير تنفيذي ومسؤول نظام).
   يمكن إغلاقه من مالك المنصة بـ ALLOW_COMPANY_SIGNUP=false */
router.post('/auth/register-company', authLimiter, async (req, res) => {
  if (String(process.env.ALLOW_COMPANY_SIGNUP).toLowerCase() === 'false') {
    return res.status(403).json({ error: 'تسجيل الشركات مغلق حالياً. تواصل مع مزوّد المنصة.' });
  }
  const data = z.object({ company: z.string().trim().min(2, 'اسم الشركة مطلوب').max(100), name, email, password }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' });
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await prisma.$transaction(async tx => {
    const org = await tx.organization.create({ data: { name: data.company, approvalLimits: DEFAULT_LIMITS } });
    return tx.user.create({
      data: { orgId: org.id, name: data.name, email: data.email, passwordHash, role: 'CEO', title: 'المدير التنفيذي', isAdmin: true },
    });
  });
  await createSession(res, user.id);
  res.status(201).json(publicUser(user));
});

/* B3: قفل مؤقت لكل حساب (بذاكرة العملية، شوف loginGuard.js للحدود) */
const loginGuard = createLoginGuard();

router.post('/auth/login', authLimiter, async (req, res) => {
  const data = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
  const wait = loginGuard.check(data.email);
  if (wait) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({ error: 'محاولات دخول كثيرة على هذا الحساب، حاول بعد شوية' });
  }
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { org: true } });
  const ok = await bcrypt.compare(data.password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) { loginGuard.fail(data.email); return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' }); }
  loginGuard.success(data.email);
  if (!user.active) return res.status(403).json({ error: 'هذا الحساب معطّل — تواصل مع مسؤول النظام' });
  if (user.org.suspended) return res.status(403).json({ error: 'حساب الشركة موقوف — تواصل مع مزوّد المنصة' });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(res, user.id, settingsOf(user.org).sessionDays);
  res.json(publicUser(user));
});

router.post('/auth/logout', async (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) {
    /* P1: إذا العميل أرسل endpoint اشتراك هذا الجهاز، نحذفه قبل حذف الجلسة (بس إذا يخص صاحب الجلسة وشركته) */
    const endpoint = req.body && typeof req.body === 'object' ? req.body.endpoint : undefined;
    try { await removeSubscriptionOnLogout(prisma, sha256(token), endpoint); } catch (e) { console.error('push logout cleanup:', e.message); }
    await prisma.session.deleteMany({ where: { id: sha256(token) } });
  }
  res.clearCookie(COOKIE, cookieOptions());
  res.status(204).end();
});

/* ── الدعوات: صفحة الانضمام (بدون تسجيل دخول) ── */
async function loadInvite(token) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { org: true, inviter: { select: { name: true } } },
  });
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date() || inv.org.suspended) {
    throw httpError(404, 'رابط الدعوة غير صالح أو منتهي');
  }
  return inv;
}

router.get('/auth/invite/:token', authLimiter, async (req, res) => {
  const inv = await loadInvite(req.params.token);
  const lbl = (settingsOf(inv.org).labels || {}).roles || {};
  res.json({ company: inv.org.name, email: inv.email, name: inv.name, role: inv.role, roleLabel: lbl[inv.role] || null, inviter: inv.inviter.name, passwordMin: settingsOf(inv.org).passwordMin });
});

router.post('/auth/invite/:token/accept', authLimiter, async (req, res) => {
  const inv = await loadInvite(req.params.token);
  const s = settingsOf(inv.org);
  const data = z.object({ name, password: passwordFor(s.passwordMin) }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } })) {
    throw httpError(409, 'هذا البريد مسجّل مسبقاً');
  }
  await assertSeat(inv.orgId, { countPending: false });   /* مقعد الدعوة نفسها محسوب أصلاً */
  /* الرئيس لازم يكون ما زال فعّالاً وبمستوى أعلى من الدور */
  let managerId = inv.managerId;
  if (managerId) {
    const m = await prisma.user.findFirst({ where: { id: managerId, orgId: inv.orgId, active: true }, select: { role: true } });
    if (!m || LEVEL[m.role] <= LEVEL[inv.role]) managerId = null;
  }
  if (!managerId && inv.role !== 'CEO') {
    const ceo = await prisma.user.findFirst({ where: { orgId: inv.orgId, role: 'CEO', active: true }, select: { id: true } });
    managerId = ceo ? ceo.id : null;
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await prisma.$transaction(async tx => {
    const u = await tx.user.create({
      data: {
        orgId: inv.orgId, name: data.name, email: inv.email, passwordHash, role: inv.role, managerId,
        title: inv.title, department: inv.department, leaveEntitlement: s.leaveDefault,
      },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    return u;
  });
  await createSession(res, user.id, s.sessionDays);
  emit(inv.orgId, 'user.joined', { id: user.id, name: user.name, role: user.role });
  res.status(201).json(publicUser(user));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.user),
    org: orgJSON(req.org),
    level: LEVEL[req.user.role],
    perms: [...req.perms],
    permCatalog: CATALOG,
    platformAdmin: isPlatformAdmin(req.user),
    notifyPrefs: req.user.notifyPrefs || {},
  });
});

router.patch('/me', requireAuth, async (req, res) => {
  const data = z.object({
    name: name.optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    notifyPrefs: z.object({
      mention: z.boolean(), task: z.boolean(), request: z.boolean(), event: z.boolean(), announcement: z.boolean(), whatsapp: z.boolean(),
    }).partial().optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.notifyPrefs && { notifyPrefs: { ...(req.user.notifyPrefs || {}), ...data.notifyPrefs } }),
    },
  });
  res.status(204).end();
});

/* تغيير كلمة المرور: يلغي كل الجلسات الأخرى */
router.post('/me/password', authLimiter, requireAuth, async (req, res) => {
  const data = z.object({ current: z.string().min(1).max(200), next: passwordFor(req.settings.passwordMin) }).parse(req.body);
  if (!(await bcrypt.compare(data.current, req.user.passwordHash))) throw httpError(403, 'كلمة المرور الحالية غير صحيحة');
  const keep = sha256(req.cookies[COOKIE]);
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(data.next, BCRYPT_ROUNDS), mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: req.user.id, id: { not: keep } } }),
  ]);
  await audit(req, 'password.change', 'user', req.user.id);
  res.status(204).end();
});

/* ── الإشعارات (الجرس) ── */
router.get('/notifications', requireAuth, async (req, res) => {
  const q = z.object({ type: z.enum(['all', 'mention']).default('all') }).parse(req.query);
  const where = { userId: req.user.id, ...(q.type === 'mention' && { type: 'MENTION' }) };
  const [items, unread, unreadMentions] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { id: 'desc' }, take: 40 }),
    prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    prisma.notification.count({ where: { userId: req.user.id, read: false, type: 'MENTION' } }),
  ]);
  res.json({
    unread, unreadMentions,
    items: items.map(n => ({ id: n.id, type: n.type, actor: n.actorName, text: n.text, link: n.link, read: n.read, createdAt: n.createdAt })),
  });
});
router.post('/notifications/read', requireAuth, async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }).parse(req.body ?? {});
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false, ...(ids && { id: { in: ids } }) }, data: { read: true },
  });
  res.status(204).end();
});

/* ── Web Push ── */
router.get('/push/key', requireAuth, (req, res) => res.json({ key: push.publicKey() }));
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const sub = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }) }).parse(req.body);
  await push.subscribe(req.user.id, sub);
  res.status(204).end();
});
router.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(req.body);
  await push.unsubscribe(req.user.id, endpoint, req.user.orgId);
  res.status(204).end();
});

module.exports = {
  router, requireAuth, need, purgeExpiredSessions, BCRYPT_ROUNDS, orgJSON, sha256, isPlatformAdmin, platformAdmins,
};
