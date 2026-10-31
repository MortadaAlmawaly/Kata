const prisma = require('./db');
const push = require('./push');
const { sendWhatsApp } = require('./integrations');

/* سجل تدقيق — فشله ما يوقف العملية الأصلية */
async function audit(req, action, entity, entityId = null, meta = null) {
  try {
    await prisma.auditLog.create({
      data: { orgId: req.user.orgId, actorId: req.user.id, actorName: req.user.name, action, entity, entityId, meta: meta ?? undefined },
    });
  } catch (e) { console.error('audit failed:', e.message); }
}

/* نوع الإشعار ← مفتاح التفضيل بحساب المستخدم */
const PREF_KEY = { MENTION: 'mention', TASK: 'task', REQUEST: 'request', EVENT: 'event', ANNOUNCEMENT: 'announcement' };

/* إشعار داخل التطبيق (الجرس) + Web Push لمجموعة مستخدمين.
   type = MENTION للإشارات (@) — تظهر بتبويب خاص وبجرس أبرز. تفضيلات المستخدم تُحترم. */
async function notify(userIds, text, link = null, exceptId = null, type = 'INFO', actorName = null) {
  const ids = [...new Set(userIds)].filter(id => id && id !== exceptId);
  if (!ids.length) return;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, notifyPrefs: true, phone: true, org: { select: { settings: true } } } });
    const key = PREF_KEY[type];
    const target = users.filter(u => !key || !u.notifyPrefs || u.notifyPrefs[key] !== false).map(u => u.id);
    if (!target.length) return;
    await prisma.notification.createMany({
      data: target.map(userId => ({ userId, type, actorName, text: text.slice(0, 255), link })),
    });
    /* WhatsApp (اختياري): لمن فعّله وله رقم، وكانت الشركة مفعّلة الربط */
    for (const u of users) {
      if (!target.includes(u.id) || !u.phone || !(u.notifyPrefs && u.notifyPrefs.whatsapp === true)) continue;
      const cfg = u.org && u.org.settings && u.org.settings.whatsapp;
      if (cfg && cfg.enabled !== false) sendWhatsApp(cfg, u.phone, `كاتا\n${text}`);
    }
    /* Push بالخلفية — ما ننتظره */
    push.sendToUsers(target, {
      title: type === 'MENTION' ? 'إشارة إليك' : 'كاتا',
      body: text, url: link ? '/' + link : '/', tag: type.toLowerCase(),
    });
  } catch (e) { console.error('notify failed:', e.message); }
}

module.exports = { audit, notify };
