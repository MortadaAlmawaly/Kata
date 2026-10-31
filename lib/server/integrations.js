/* التكاملات الخارجية:
   - Webhooks: إرسال الأحداث لرابط تحدده الشركة (n8n / Zapier / نظام داخلي) بتوقيع HMAC-SHA256.
   - WhatsApp Cloud API (اختياري): إشعارات نصية للأرقام المسجّلة لمن فعّلها.
   كل الإرسال بالخلفية وفشله لا يوقف أي عملية أصلية. */
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const prisma = require('./db');

/* ── حماية SSRF: نمنع الوجهات الداخلية ── */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

async function assertSafeUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch (e) { throw new Error('رابط غير صالح'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && process.env.NODE_ENV !== 'production')) throw new Error('الرابط لازم يكون https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('وجهة غير مسموحة');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('وجهة غير مسموحة');
  return u;
}

const sign = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex');

async function deliver(hook, event, payload) {
  const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
  let status = 0;
  try {
    const u = await assertSafeUrl(hook.url);
    const res = await fetch(u, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(6000),
      headers: { 'Content-Type': 'application/json', 'X-Routine-Event': event, 'X-Routine-Signature': 'sha256=' + sign(hook.secret, body) },
      body,
    });
    status = res.status;
  } catch (e) { status = 0; }
  await prisma.webhook.update({ where: { id: hook.id }, data: { lastStatus: status, lastAt: new Date() } }).catch(() => {});
  return status;
}

/* يطلق حدثاً لكل Webhook نشط يشترك به (بدون انتظار) */
function emit(orgId, event, payload) {
  prisma.webhook.findMany({ where: { orgId, active: true } }).then(list => {
    list.filter(h => Array.isArray(h.events) && (h.events.includes('*') || h.events.includes(event)))
      .forEach(h => deliver(h, event, payload));
  }).catch(() => {});
}

/* ── WhatsApp Cloud API ── */
function normalizePhone(raw, countryCode = '964') {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  return d.length >= 8 ? d : null;
}

async function sendWhatsApp(cfg, phone, text) {
  if (!cfg || !cfg.phoneNumberId || !cfg.token) return false;
  const to = normalizePhone(phone, cfg.countryCode || '964');
  if (!to) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 900) } }),
    });
    return res.ok;
  } catch (e) { return false; }
}

module.exports = { assertSafeUrl, deliver, emit, sendWhatsApp, normalizePhone };
