/* P2: مفاتيح VAPID (Web Push) من متغيرات البيئة.
   - VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT: مطلوبة بالإنتاج (NODE_ENV=production).
     إذا ناقصة أو غلط: خطأ واضح يوقف التشغيل، وما نولّد ملف مفاتيح بصمت بمجلد الشغل.
   - التطوير بس: إذا المفاتيح مو بالبيئة و VAPID_FILE مضبوط، نقرا الملف أو نولّد مفاتيح جديدة بيه بصلاحية 600.
     إذا VAPID_FILE مو مضبوط: الإشعارات تنطفي ويه تحذير (ما نكتب بالمجلد الحالي).
   - ما نطبع قيمة أي مفتاح أبداً، بس أسماء المتغيرات.
   ملف نقي (crypto وfs بس) حتى ينختبر بدون web-push. */
const crypto = require('crypto');
const nodeFs = require('fs');
const nodePath = require('path');

const VARS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const DEV_SUBJECT = 'https://localhost';

class VapidConfigError extends Error {
  constructor(msg) { super('[web-push] ' + msg); this.name = 'VapidConfigError'; }
}

const isProd = env => (env.NODE_ENV || '').trim() === 'production';
const isBuildPhase = env => (env.NEXT_PHASE || '') === 'phase-production-build';

function decodeB64url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  return Buffer.from(s.replace(/=+$/, ''), 'base64url');
}
/* نفس الفحص اللي يسويه web-push: العام 65 بايت (نقطة P-256 غير مضغوطة)، والخاص 32 بايت */
function validKeys(pub, priv) {
  const p = decodeB64url(pub); const k = decodeB64url(priv);
  return Boolean(p && k && p.length === 65 && p[0] === 4 && k.length === 32);
}
function validSubject(s) {
  if (typeof s !== 'string' || !s) return false;
  if (/^mailto:\S+$/.test(s)) return true;
  try { return new URL(s).protocol === 'https:'; } catch (_) { return false; }
}
function generateKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: ecdh.getPrivateKey().toString('base64url') };
}

/* يرجّع { publicKey, privateKey, subject, source } أو null (الإشعارات مطفية بالتطوير)، ويرمي VapidConfigError إذا الإعداد غلط */
function resolveVapid(env = process.env, deps = {}) {
  const fs = deps.fs || nodeFs;
  const log = deps.log || console;
  const gen = deps.generate || generateKeys;
  const pub = (env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (env.VAPID_PRIVATE_KEY || '').trim();
  const subjectEnv = (env.VAPID_SUBJECT || '').trim();
  const prod = isProd(env);

  if (subjectEnv && !validSubject(subjectEnv)) throw new VapidConfigError('VAPID_SUBJECT لازم يبدي بـ mailto: أو يكون رابط https.');
  if (prod && !subjectEnv) throw new VapidConfigError('VAPID_SUBJECT مطلوب بالإنتاج (mailto: أو رابط https). ما نستعمل قيمة افتراضية.');
  const subject = subjectEnv || DEV_SUBJECT;

  if (pub || priv) {
    if (!pub || !priv) throw new VapidConfigError('لازم VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY سوية، واحد منهم ناقص.');
    if (!validKeys(pub, priv)) throw new VapidConfigError('VAPID_PUBLIC_KEY أو VAPID_PRIVATE_KEY صيغتها غلط (لازم base64url: العام 65 بايت والخاص 32 بايت).');
    return { publicKey: pub, privateKey: priv, subject, source: 'env' };
  }
  if (prod) {
    throw new VapidConfigError('VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY مطلوبة بالإنتاج. ما راح نولّد ملف مفاتيح تلقائياً. '
      + 'إذا اكو مفاتيح قديمة شغالة، انقلها لمتغيرات البيئة (لا تولّد جديدة، تنكسر الاشتراكات الموجودة).');
  }

  /* التطوير بس */
  const file = (env.VAPID_FILE || '').trim();
  if (!file) {
    log.warn('[web-push] الإشعارات مطفية بالتطوير: اضبط VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY، أو VAPID_FILE (مسار خارج مجلد المشروع).');
    return null;
  }
  const abs = nodePath.resolve(file);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (_) { /* غير موجود بعد */ }
  if (saved && validKeys(saved.publicKey, saved.privateKey)) {
    try {
      const mode = fs.statSync(abs).mode & 0o777;
      if (mode & 0o077) log.warn('[web-push] صلاحيات ملف VAPID_FILE أوسع من 600، يفضّل chmod 600.');
    } catch (_) { /* تجاهل */ }
    return { publicKey: saved.publicKey, privateKey: saved.privateKey, subject, source: 'file' };
  }
  const k = gen();
  fs.writeFileSync(abs, JSON.stringify({ publicKey: k.publicKey, privateKey: k.privateKey }, null, 2), { mode: 0o600 });
  fs.chmodSync(abs, 0o600);   // mode بالكتابة ما يطبق إذا الملف موجود قبل
  log.warn('[web-push] تولّدت مفاتيح تطوير جديدة بمسار VAPID_FILE (صلاحية 600).');
  return { publicKey: k.publicKey, privateKey: k.privateKey, subject, source: 'generated' };
}

/* يُستدعى من instrumentation.js عند تشغيل السيرفر: بالإنتاج أي نقص يطبع رسالة واضحة ويوقف العملية */
function assertVapidAtStartup(env = process.env, deps = {}) {
  const log = deps.log || console;
  const exit = deps.exit || (code => process.exit(code));
  if (!isProd(env) || isBuildPhase(env)) return true;
  try { resolveVapid(env, deps); return true; } catch (e) {
    log.error(e.message + ' المتغيرات المطلوبة: ' + VARS.join(', ') + '. السيرفر توقف.');
    exit(1);
    return false;
  }
}

module.exports = { resolveVapid, assertVapidAtStartup, validKeys, validSubject, generateKeys, VapidConfigError, VARS, DEV_SUBJECT };