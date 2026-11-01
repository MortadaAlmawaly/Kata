/* إعدادات الشركة تُعدَّل من لوحة المسؤول (routes/admin.js). هنا: قراءة + سجل التدقيق */
const express = require('../express');
const prisma = require('../db');
const { z } = require('../validate');
const { need, orgJSON } = require('../auth');

const router = express.Router();

router.get('/org', (req, res) => res.json(orgJSON(req.org)));

/* تخطيط الهيكل المرئي: مواضع البطاقات وجهة ربط كل شخص بمديره (يمين/يسار/أسفل). يقرؤه الجميع ويعدّله من يدير المستخدمين */
const num = z.number().finite().min(-5000).max(5000);
const layoutBody = z.object({
  pos: z.record(z.string().regex(/^\d{1,12}$/), z.object({ x: num, y: num })).default({}),
  side: z.record(z.string().regex(/^\d{1,12}$/), z.enum(['l', 'r', 'b'])).default({}),
  colors: z.record(z.string().regex(/^\d{1,12}$/), z.string().regex(/^#[0-9a-fA-F]{6}$/)).default({}),   // لون سلك كل شخص
  wire: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal('')]).default(''),                       // لون كل الأسلاك
}).refine(d => Object.keys(d.pos).length <= 2000 && Object.keys(d.side).length <= 2000 && Object.keys(d.colors).length <= 2000, 'عدد كبير');
router.get('/org/layout', (req, res) => {
  const l = (req.org.settings || {}).orgLayout || {};
  res.json({ pos: l.pos || {}, side: l.side || {}, colors: l.colors || {}, wire: l.wire || '' });
});
router.put('/org/layout', need('users.manage'), async (req, res) => {
  const layout = layoutBody.parse(req.body);
  await prisma.organization.update({ where: { id: req.user.orgId }, data: { settings: { ...(req.org.settings || {}), orgLayout: layout } } });
  res.status(204).end();
});

router.get('/audit', need('audit.view'), async (req, res) => {
  const q = z.object({ before: z.coerce.number().int().positive().optional() }).parse(req.query);
  const rows = await prisma.auditLog.findMany({
    where: { orgId: req.user.orgId, ...(q.before && { id: { lt: q.before } }) },
    orderBy: { id: 'desc' },
    take: 100,
  });
  res.json(rows.map(r => ({
    id: r.id, actor: r.actorName, action: r.action, entity: r.entity, entityId: r.entityId, meta: r.meta, createdAt: r.createdAt,
  })));
});

module.exports = router;
