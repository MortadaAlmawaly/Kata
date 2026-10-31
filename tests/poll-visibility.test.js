/* اختبار P3: جدول التحديث يوقف والصفحة مخفية، يرجع بتحديث فوري، وما يصير تداخل.
   مؤقتات وهمية من node:test (mock.timers). التشغيل: node --test tests/poll-visibility.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'lib', 'poll.js')).href);
const flush = () => new Promise(r => setImmediate(r));   // setImmediate مو وهمي، فيفرّغ الـ promises

function setup(t, { slow = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = { hidden: false, calls: 0, active: 0, maxActive: 0, release: [] };
  s.run = () => {
    s.calls++; s.active++; s.maxActive = Math.max(s.maxActive, s.active);
    if (!slow) { s.active--; return Promise.resolve(); }
    return new Promise(res => s.release.push(() => { s.active--; res(); }));
  };
  s.timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id) };
  return s;
}

test('تحديث فوري عند البدء وبعدين كل 30 ثانية', async t => {
  const { createVisibilityPoller } = await load();
  const s = setup(t);
  const p = createVisibilityPoller({ run: s.run, intervalMs: 30000, isHidden: () => s.hidden, timers: s.timers });
  p.start(); await flush();
  assert.equal(s.calls, 1);
  t.mock.timers.tick(29999); await flush(); assert.equal(s.calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(s.calls, 2);
  t.mock.timers.tick(30000); await flush(); assert.equal(s.calls, 3);
  p.stop();
  t.mock.timers.tick(120000); await flush(); assert.equal(s.calls, 3, 'بعد stop ماكو طلبات');
});

test('مخفية: ماكو طلبات؛ ظاهرة: تحديث فوري ويرجع الجدول', async t => {
  const { createVisibilityPoller } = await load();
  const s = setup(t);
  const p = createVisibilityPoller({ run: s.run, intervalMs: 30000, isHidden: () => s.hidden, timers: s.timers });
  p.start(); await flush();
  s.hidden = true; p.onVisibilityChange();
  assert.equal(p.state.scheduled, false);
  t.mock.timers.tick(10 * 60000); await flush();
  assert.equal(s.calls, 1, 'ولا طلب خلال 10 دقايق مخفية');
  s.hidden = false; p.onVisibilityChange(); await flush();
  assert.equal(s.calls, 2, 'تحديث فوري لما ترجع');
  t.mock.timers.tick(30000); await flush();
  assert.equal(s.calls, 3, 'الجدول رجع');
});

test('إذا المؤقت وصل والصفحة مخفية (بدون حدث) ما يطلب ويوقف الجدول', async t => {
  const { createVisibilityPoller } = await load();
  const s = setup(t);
  const p = createVisibilityPoller({ run: s.run, intervalMs: 30000, isHidden: () => s.hidden, timers: s.timers });
  p.start(); await flush();
  s.hidden = true;
  t.mock.timers.tick(30000); await flush();
  assert.equal(s.calls, 1);
  assert.equal(p.state.scheduled, false);
});

test('ماكو طلبات متداخلة: الطلب البطيء يمنع الثاني، والموعد الجاي بعد ما يخلص', async t => {
  const { createVisibilityPoller } = await load();
  const s = setup(t, { slow: true });
  const p = createVisibilityPoller({ run: s.run, intervalMs: 30000, isHidden: () => s.hidden, timers: s.timers });
  p.start(); await flush();
  assert.equal(s.calls, 1);
  s.hidden = true; p.onVisibilityChange(); s.hidden = false; p.onVisibilityChange(); await flush();
  t.mock.timers.tick(90000); await flush();
  assert.equal(s.calls, 1, 'ما بدا طلب ثاني والأول شغال');
  assert.equal(s.maxActive, 1);
  s.release.shift()(); await flush();
  assert.equal(p.state.scheduled, true);
  t.mock.timers.tick(30000); await flush();
  assert.equal(s.calls, 2);
  assert.equal(s.maxActive, 1);
  s.release.shift()(); await flush();
  p.stop();
});

test('خطأ بالتحديث ما يوقف الجدول', async t => {
  const { createVisibilityPoller } = await load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const p = createVisibilityPoller({ run: async () => { calls++; throw new Error('net'); }, intervalMs: 30000, isHidden: () => false,
    timers: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id) } });
  p.start(); await flush();
  t.mock.timers.tick(30000); await flush();
  assert.equal(calls, 2);
  p.stop();
});

test('البدء والصفحة مخفية: تحديث واحد (مثل قبل) وبعدين ينتظر لما تظهر', async t => {
  const { createVisibilityPoller } = await load();
  const s = setup(t); s.hidden = true;
  const p = createVisibilityPoller({ run: s.run, intervalMs: 30000, isHidden: () => s.hidden, timers: s.timers });
  p.start(); await flush();
  assert.equal(s.calls, 1);
  t.mock.timers.tick(300000); await flush();
  assert.equal(s.calls, 1);
  s.hidden = false; p.onVisibilityChange(); await flush();
  assert.equal(s.calls, 2);
  p.stop();
});