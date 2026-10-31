/* اختبار B3: عنوان العميل من X-Forwarded-For الموثوق، والقفل لكل حساب. التشغيل: node --test tests/login-guard.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoginGuard } = require(path.join(__dirname, '..', 'lib', 'server', 'loginGuard'));

/* clientIp معرّفة بـ express.js، وexpress.js ما يحتاج مكتبات خارجية */
const { clientIp } = require(path.join(__dirname, '..', 'lib', 'server', 'express'));

test('clientIp: القيمة المزوّرة باليسار ما تأثر', () => {
  assert.equal(clientIp('6.6.6.6, 203.0.113.7', 1), '203.0.113.7');
  assert.equal(clientIp('1.1.1.1, 2.2.2.2, 203.0.113.7, 10.0.0.2', 2), '203.0.113.7');
  assert.equal(clientIp('203.0.113.7', 3), '203.0.113.7');
  assert.equal(clientIp('6.6.6.6', 0), '0.0.0.0');
  assert.equal(clientIp('', 1), '0.0.0.0');
  assert.equal(clientIp('not-an-ip<script>', 1), '0.0.0.0');
});

test('القفل بعد 5 محاولات فاشلة، ويتصفر بالدخول الناجح', () => {
  let t = 0; const g = createLoginGuard({ maxFails: 5, windowMin: 15, lockMin: 15, now: () => t });
  for (let i = 0; i < 4; i++) g.fail('USER-A.example');
  assert.equal(g.check('user-a.example'), 0);
  g.fail('user-a.example');
  assert.equal(g.check('user-a.example'), 15 * 60);
  t += 15 * 60000;
  assert.equal(g.check('user-a.example'), 0);
  for (let i = 0; i < 5; i++) g.fail('user-a.example');
  assert.equal(g.check('user-a.example'), 30 * 60, 'القفل الثاني يتضاعف');
  g.success('user-a.example');
  assert.equal(g.check('user-a.example'), 0);
});

test('المحاولات القديمة برا النافذة ما تنحسب', () => {
  let t = 0; const g = createLoginGuard({ maxFails: 3, windowMin: 1, lockMin: 1, now: () => t });
  g.fail('user-b.example'); g.fail('user-b.example');
  t += 61000;
  g.fail('user-b.example');
  assert.equal(g.check('user-b.example'), 0);
});

test('الذاكرة محدودة', () => {
  const g = createLoginGuard({ maxEntries: 100 });
  for (let i = 0; i < 1000; i++) g.fail('u' + i + '.example');
  assert.ok(g._size() <= 100);
});