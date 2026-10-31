/* اختبار P2: مفاتيح VAPID من البيئة، والإنتاج يفشل بوضوح بدل ما يولّد ملف.
   كل المفاتيح هنا تتولّد وقت الاختبار (مو مفاتيح حقيقية)، والاختبار ما يطبع أي قيمة.
   التشغيل: node --test tests/vapid-env.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v = require(path.join(__dirname, '..', 'lib', 'server', 'vapidConfig'));

const quiet = { warn() {}, error() {} };
const k = v.generateKeys();
const SUBJ = 'https://kata.example/contact';

/* fs وهمي يسجّل أي كتابة: الإنتاج لازم ما يكتب شي */
const noWriteFs = { readFileSync() { throw new Error('no read expected'); }, writeFileSync() { throw new Error('write in prod!'); }, chmodSync() { throw new Error('chmod in prod!'); }, statSync() { throw new Error('x'); } };

test('المفاتيح المولّدة بصيغة صحيحة', () => {
  assert.ok(v.validKeys(k.publicKey, k.privateKey));
  assert.ok(!v.validKeys(k.privateKey, k.publicKey));
  assert.ok(!v.validKeys('abc', 'def'));
});

test('الإنتاج: المفاتيح والـ subject من البيئة', () => {
  const r = v.resolveVapid({ NODE_ENV: 'production', VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: SUBJ }, { fs: noWriteFs, log: quiet });
  assert.equal(r.source, 'env');
  assert.equal(r.subject, SUBJ);
  assert.equal(r.publicKey, k.publicKey);
});

test('الإنتاج: مفاتيح ناقصة = خطأ واضح بأسماء المتغيرات، وبدون كتابة ملف', () => {
  assert.throws(() => v.resolveVapid({ NODE_ENV: 'production', VAPID_SUBJECT: SUBJ, VAPID_FILE: '/tmp/x.json' }, { fs: noWriteFs, log: quiet }),
    e => e instanceof v.VapidConfigError && /VAPID_PUBLIC_KEY/.test(e.message) && /VAPID_PRIVATE_KEY/.test(e.message));
});

test('الإنتاج: VAPID_SUBJECT مطلوب وما اكو قيمة افتراضية', () => {
  assert.throws(() => v.resolveVapid({ NODE_ENV: 'production', VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey }, { fs: noWriteFs, log: quiet }),
    e => /VAPID_SUBJECT/.test(e.message));
  assert.throws(() => v.resolveVapid({ NODE_ENV: 'production', VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'http://insecure.example' }, { fs: noWriteFs, log: quiet }),
    e => /VAPID_SUBJECT/.test(e.message));
});

test('مفتاح واحد بس أو صيغة غلط = خطأ (حتى بالتطوير)', () => {
  assert.throws(() => v.resolveVapid({ VAPID_PUBLIC_KEY: k.publicKey }, { log: quiet }), /سوية/);
  assert.throws(() => v.resolveVapid({ VAPID_PUBLIC_KEY: 'bad', VAPID_PRIVATE_KEY: 'bad' }, { log: quiet }), /صيغتها غلط/);
});

test('رسالة الخطأ ما بيها قيمة المفتاح', () => {
  try { v.resolveVapid({ NODE_ENV: 'production', VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: 'x' + k.privateKey, VAPID_SUBJECT: SUBJ }, { log: quiet }); assert.fail('لازم يرمي'); }
  catch (e) { assert.ok(!e.message.includes(k.publicKey) && !e.message.includes(k.privateKey)); }
});

test('التطوير بدون مفاتيح وبدون VAPID_FILE: مطفي وما ينكتب شي', () => {
  const warns = [];
  const r = v.resolveVapid({ NODE_ENV: 'development' }, { fs: noWriteFs, log: { warn: m => warns.push(m) } });
  assert.equal(r, null);
  assert.ok(warns.some(m => /VAPID_FILE/.test(m)));
});

test('التطوير ويه VAPID_FILE: يولّد الملف بصلاحية 600 ويرجع يقراه', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vapid-test-'));
  const file = path.join(dir, 'dev-vapid.json');
  try {
    const old = process.umask(0o000);   // حتى نتأكد الصلاحية ما تعتمد على umask
    let r1;
    try { r1 = v.resolveVapid({ NODE_ENV: 'development', VAPID_FILE: file }, { log: quiet }); } finally { process.umask(old); }
    assert.equal(r1.source, 'generated');
    assert.equal(r1.subject, v.DEV_SUBJECT);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const r2 = v.resolveVapid({ NODE_ENV: 'development', VAPID_FILE: file }, { log: quiet });
    assert.equal(r2.source, 'file');
    assert.equal(r2.publicKey, r1.publicKey);
    /* ملف موجود بصلاحية 644: الكتابة فوقه (إذا تالف) لازم ترجعه 600 */
    fs.writeFileSync(file, '{}'); fs.chmodSync(file, 0o644);
    v.resolveVapid({ NODE_ENV: 'development', VAPID_FILE: file }, { log: quiet });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('فحص التشغيل: الإنتاج الناقص يوقف بـ exit(1)، والبناء والتطوير ما يتأثرون', () => {
  const codes = []; const errs = [];
  const deps = { exit: c => codes.push(c), log: { error: m => errs.push(m), warn() {} }, fs: noWriteFs };
  assert.equal(v.assertVapidAtStartup({ NODE_ENV: 'production' }, deps), false);
  assert.deepEqual(codes, [1]);
  assert.ok(/VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT/.test(errs[0]));
  assert.equal(v.assertVapidAtStartup({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }, deps), true);
  assert.equal(v.assertVapidAtStartup({ NODE_ENV: 'development' }, deps), true);
  assert.equal(v.assertVapidAtStartup({ NODE_ENV: 'production', VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: SUBJ }, deps), true);
  assert.deepEqual(codes, [1]);
});