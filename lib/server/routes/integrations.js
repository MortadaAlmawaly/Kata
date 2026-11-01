/* التكاملات (الإعدادات ← التكاملات):
   - اشتراك التقويم ICS لكل مستخدم (رابط بتوكن سرّي).
   - Webhooks للشركة (مسؤول النظام): إضافة/إيقاف/حذف/اختبار.
   - WhatsApp Cloud API (مسؤول النظام): معرّف الرقم + التوكن (يُحفظ بالسيرفر ولا يُرجَع). */
const crypto = require('crypto');
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { need } = require('../auth');
const { assertSafeUrl, deliver, sendWhatsApp } = require('../integrations');
const { audit } = require('../audit');

const router = express.Router();
const baseUrl = req => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/* ── اشتراك التقويم ── */
router.get('/integrations/ics', async (req, res) => {
  let token = req.user.icsToken;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    await prisma.user.update({ where: { id: req.user.id }, data: { icsToken: token } });
  }
  res.json({ url: `${baseUrl(req)}/cal/${token}.ics` });
});
router.post('/integrations/ics/reset', async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  await prisma.user.update({ where: { id: req.user.id }, data: { icsToken: token } });
  res.json({ url: `${baseUrl(req)}/cal/${token}.ics` });
});

/* ── Webhooks ── */
const EVENTS = ['task.created', 'task.done', 'request.created', 'request.approved', 'request.rejected', 'announcement.created', 'user.joined'];
const hookJSON = h => ({ id: h.id, url: h.url, events: h.events, active: h.active, lastStatus: h.lastStatus, lastAt: h.lastAt });

router.get('/integrations/webhooks', need('admin'), async (req, res) => {
  const list = await prisma.webhook.findMany({ where: { orgId: req.user.orgId }, orderBy: { id: 'asc' } });
  res.json({ available: EVENTS, hooks: list.map(hookJSON) });
});

router.post('/integrations/webhooks', need('admin'), async (req, res) => {
  const d = z.object({
    url: z.string().trim().url().max(300),
    events: z.array(z.enum([...EVENTS, '*'])).min(1),
  }).parse(req.body);
  try { await assertSafeUrl(d.url); } catch (e) { throw httpError(400, e.message); }
  if ((await prisma.webhook.count({ where: { orgId: req.user.orgId } })) >= 10) throw httpError(400, 'الحد الأقصى 10 روابط');
  const secret = crypto.randomBytes(24).toString('hex');
  const h = await prisma.webhook.create({ data: { orgId: req.user.orgId, url: d.url, events: d.events, secret } });
  await audit(req, 'webhook.create', 'webhook', h.id, { url: d.url });
  /* المفتاح السرّي يظهر مرة وحدة (للتحقق من التوقيع بالطرف الآخر) */
  res.status(201).json({ id: h.id, secret });
});

router.patch('/integrations/webhooks/:id', need('admin'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const d = z.object({ active: z.boolean().optional(), events: z.array(z.enum([...EVENTS, '*'])).min(1).optional() })
    .refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const r = await prisma.webhook.updateMany({ where: { id, orgId: req.user.orgId }, data: d });
  if (!r.count) throw httpError(404, 'غير موجود');
  res.status(204).end();
});

router.delete('/integrations/webhooks/:id', need('admin'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await prisma.webhook.deleteMany({ where: { id, orgId: req.user.orgId } });
  if (!r.count) throw httpError(404, 'غير موجود');
  res.status(204).end();
});

router.post('/integrations/webhooks/:id/test', need('admin'), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const h = await prisma.webhook.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!h) throw httpError(404, 'غير موجود');
  const status = await deliver(h, 'ping', { message: 'اختبار من كاتا', by: req.user.name });
  res.json({ status });
});

/* ── WhatsApp ── */
router.patch('/integrations/whatsapp', need('admin'), async (req, res) => {
  const d = z.object({
    enabled: z.boolean().optional(),
    phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, 'معرّف الرقم أرقام فقط').optional(),
    token: z.string().trim().min(20).max(600).optional(),
    countryCode: z.string().trim().regex(/^\d{1,4}$/).optional(),
  }).refine(o => Object.keys(o).length > 0, 'لا يوجد شيء للتحديث').parse(req.body);
  const cur = (req.org.settings && req.org.settings.whatsapp) || {};
  const next = { ...cur, ...d };
  await prisma.organization.update({
    where: { id: req.user.orgId },
    data: { settings: { ...(req.org.settings || {}), whatsapp: next } },
  });
  await audit(req, 'integration.whatsapp', 'org', req.user.orgId, { enabled: next.enabled !== false, tokenChanged: !!d.token });
  res.status(204).end();
});

router.post('/integrations/whatsapp/test', need('admin'), async (req, res) => {
  const cfg = req.org.settings && req.org.settings.whatsapp;
  if (!cfg || !cfg.token) throw httpError(400, 'أكمل إعدادات واتساب أولاً');
  if (!req.user.phone) throw httpError(400, 'أضف رقم هاتفك بالإعدادات ← حسابي أولاً');
  const ok = await sendWhatsApp(cfg, req.user.phone, 'كاتا: رسالة اختبار');
  res.json({ ok });
});

module.exports = router;
