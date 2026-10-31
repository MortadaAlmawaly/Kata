/* إعدادات الشركة تُعدَّل من لوحة المسؤول (routes/admin.js). هنا: قراءة + سجل التدقيق */
const express = require('../express');
const prisma = require('../db');
const { z } = require('../validate');
const { need, orgJSON } = require('../auth');

const router = express.Router();

router.get('/org', (req, res) => res.json(orgJSON(req.org)));

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
