/* التعاميم:
   COMPANY = كل الشركة (صلاحية announcements.company) · TEAM = فريق الكاتب بكل مستوياته (announcements.team)
   CUSTOM  = أشخاص يختارهم الكاتب يدوياً من دليل الشركة (يحتاج announcements.team أو company) */
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { descendants } = require('../hierarchy');
const { audit, notify } = require('../audit');
const { emit } = require('../integrations');

const router = express.Router();
const author = { select: { id: true, name: true, role: true } };

router.get('/announcements', async (req, res) => {
  const list = await prisma.announcement.findMany({
    where: { orgId: req.user.orgId },
    include: { author, recipients: { select: { userId: true } } },
    orderBy: [{ pinned: 'desc' }, { id: 'desc' }], take: 150,
  });
  const me = req.user.id;
  const visible = list.filter(a =>
    a.audience === 'COMPANY' || a.authorId === me
    || (a.audience === 'TEAM' && descendants(req.index, a.authorId).has(me))
    || (a.audience === 'CUSTOM' && a.recipients.some(r => r.userId === me)));
  res.json(visible.slice(0, 60).map(a => ({
    id: a.id, title: a.title, body: a.body, audience: a.audience, pinned: a.pinned,
    author: a.author, createdAt: a.createdAt,
    /* المستلمون يراهم الكاتب فقط */
    recipients: a.authorId === me && a.audience === 'CUSTOM'
      ? a.recipients.map(r => { const u = req.index.byId.get(r.userId); return u ? { id: u.id, name: u.name } : null; }).filter(Boolean)
      : undefined,
    recipientCount: a.audience === 'CUSTOM' ? a.recipients.length : undefined,
    canDelete: a.authorId === me || req.user.role === 'CEO',
  })));
});

router.post('/announcements', async (req, res) => {
  const d = z.object({
    title: z.string().trim().min(1, 'العنوان مطلوب').max(140),
    body: z.string().trim().min(1, 'النص مطلوب').max(8000),
    audience: z.enum(['COMPANY', 'TEAM', 'CUSTOM']).default('TEAM'),
    pinned: z.boolean().default(false),
    recipientIds: z.array(z.number().int().positive()).max(200).default([]),
  }).parse(req.body);

  if (d.audience === 'COMPANY' && !req.can('announcements.company')) throw httpError(403, 'ليست لديك صلاحية التعميم على الشركة');
  if (d.audience === 'TEAM' && !req.can('announcements.team')) throw httpError(403, 'ليست لديك صلاحية النشر للفريق');
  if (d.audience === 'CUSTOM' && !req.can('announcements.team') && !req.can('announcements.company')) {
    throw httpError(403, 'ليست لديك صلاحية النشر لأشخاص مختارين');
  }
  if (d.pinned && !req.can('announcements.company')) throw httpError(403, 'التثبيت يحتاج صلاحية تعميم الشركة');

  let recipients = [];
  if (d.audience === 'CUSTOM') {
    const found = await prisma.user.findMany({
      where: { orgId: req.user.orgId, active: true, id: { in: [...new Set(d.recipientIds)] } }, select: { id: true },
    });
    recipients = found.map(u => u.id).filter(id => id !== req.user.id);
    if (!recipients.length) throw httpError(400, 'اختر شخصاً واحداً على الأقل');
  }

  const a = await prisma.announcement.create({
    data: {
      orgId: req.user.orgId, authorId: req.user.id, title: d.title, body: d.body, audience: d.audience, pinned: d.pinned,
      ...(recipients.length && { recipients: { create: recipients.map(userId => ({ userId })) } }),
    },
  });
  const audience = d.audience === 'COMPANY' ? req.index.users.filter(u => u.active).map(u => u.id)
    : d.audience === 'CUSTOM' ? recipients : [...descendants(req.index, req.user.id)];
  await notify(audience, `تعميم جديد من ${req.user.name}: ${a.title}`, '#/announcements', req.user.id, 'ANNOUNCEMENT', req.user.name);
  await audit(req, 'announcement.create', 'announcement', a.id, { audience: d.audience, recipients: recipients.length || undefined });
  emit(req.user.orgId, 'announcement.created', { id: a.id, title: a.title, audience: a.audience, by: req.user.name });
  res.status(201).json({ id: a.id });
});

router.delete('/announcements/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const a = await prisma.announcement.findFirst({ where: { id, orgId: req.user.orgId }, select: { authorId: true } });
  if (!a) throw httpError(404, 'التعميم غير موجود');
  if (a.authorId !== req.user.id && req.user.role !== 'CEO') throw httpError(403, 'الحذف لكاتب التعميم');
  await prisma.announcement.delete({ where: { id } });
  res.status(204).end();
});

module.exports = router;
