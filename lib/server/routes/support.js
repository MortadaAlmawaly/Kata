/* الدعم: مدير الشركة (CEO أو مسؤول النظام) يرسل رسالة لفريق كاتا، ويرى رسائله وحالتها.
   الرسائل تُقرأ وتُعالَج من داشبورد مالك المنصة (جدول SupportMessage). */
const express = require('../express');
const prisma = require('../db');
const { z, httpError } = require('../validate');
const { audit } = require('../audit');

const router = express.Router();
const HOURLY_LIMIT = 5;

router.get('/support', async (req, res) => {
  if (!req.can('admin')) throw httpError(403, 'إرسال رسائل الدعم لمدير الشركة أو مسؤول النظام');
  const list = await prisma.supportMessage.findMany({
    where: { orgId: req.user.orgId }, orderBy: { id: 'desc' }, take: 50,
    include: { user: { select: { name: true } } },
  });
  res.json(list.map(m => ({ id: m.id, subject: m.subject, body: m.body, status: m.status, createdAt: m.createdAt, by: m.user.name })));
});

router.post('/support', async (req, res) => {
  if (!req.can('admin')) throw httpError(403, 'إرسال رسائل الدعم لمدير الشركة أو مسؤول النظام');
  const d = z.object({
    subject: z.string().trim().min(3, 'اكتب عنوانًا للرسالة (3 أحرف على الأقل)').max(140),
    body: z.string().trim().min(5, 'اكتب نص الرسالة').max(4000),
  }).parse(req.body);
  /* حد لكل مستخدم بالساعة يمنع إغراق صندوق الدعم */
  const recent = await prisma.supportMessage.count({ where: { userId: req.user.id, createdAt: { gt: new Date(Date.now() - 3600e3) } } });
  if (recent >= HOURLY_LIMIT) throw httpError(429, 'أرسلت عدة رسائل مؤخرًا، حاول بعد قليل');
  const m = await prisma.supportMessage.create({ data: { orgId: req.user.orgId, userId: req.user.id, subject: d.subject, body: d.body } });
  await audit(req, 'support.send', 'support', m.id);
  res.status(201).json({ id: m.id });
});

module.exports = router;
