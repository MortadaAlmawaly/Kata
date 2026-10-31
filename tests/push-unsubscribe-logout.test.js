/* اختبار P1: عند الخروج ينحذف بس اشتراك صاحب الجلسة (نفس userId ونفس orgId ونفس endpoint).
   التشغيل: node --test tests/push-unsubscribe-logout.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const scope = require(path.join(__dirname, '..', 'lib', 'server', 'pushScope'));

/* Prisma وهمي: يطبّق where على بيانات بالذاكرة (userId وendpointHash وuser.orgId) */
function mockPrisma() {
  const users = [{ id: 1, orgId: 10 }, { id: 2, orgId: 10 }, { id: 3, orgId: 20 }];
  const sessions = [{ id: 'sessA', userId: 1 }, { id: 'sessB', userId: 2 }, { id: 'sessC', userId: 3 }];
  const mk = (id, userId, endpoint) => ({ id, userId, endpoint, endpointHash: scope.endpointHash(endpoint) });
  let subs = [
    mk(1, 1, 'https://push.example/A-phone'),
    mk(2, 1, 'https://push.example/A-laptop'),
    mk(3, 2, 'https://push.example/B-phone'),
    mk(4, 3, 'https://push.example/C-phone'),
  ];
  const calls = [];
  const matches = (s, where) => {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'user') { const u = users.find(x => x.id === s.userId); if (!u || u.orgId !== v.orgId) return false; }
      else if (s[k] !== v) return false;
    }
    return true;
  };
  return {
    calls,
    get subs() { return subs; },
    session: {
      async findUnique({ where }) {
        const s = sessions.find(x => x.id === where.id);
        return s ? { ...s, user: users.find(u => u.id === s.userId) } : null;
      },
    },
    pushSubscription: {
      async deleteMany({ where }) {
        calls.push(where);
        assert.ok(where && Number.isInteger(where.userId) && where.user && Number.isInteger(where.user.orgId) && where.endpointHash,
          'كل حذف لازم يكون مقيّد بـ userId وorgId وendpointHash');
        const before = subs.length; subs = subs.filter(s => !matches(s, where));
        return { count: before - subs.length };
      },
    },
  };
}

test('الخروج يحذف بس اشتراك هذا الجهاز للمستخدم نفسه', async () => {
  const db = mockPrisma();
  const r = await scope.removeSubscriptionOnLogout(db, 'sessA', 'https://push.example/A-phone');
  assert.equal(r.count, 1);
  assert.deepEqual(db.subs.map(s => s.id), [2, 3, 4], 'جهاز A الثاني واشتراكات B وC باقية');
  assert.deepEqual(db.calls[0].user, { orgId: 10 });
  assert.equal(db.calls[0].userId, 1);
});

test('ما يگدر يحذف اشتراك مستخدم ثاني حتى لو أرسل الـ endpoint مالته', async () => {
  const db = mockPrisma();
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', 'https://push.example/B-phone')).count, 0, 'نفس الشركة');
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', 'https://push.example/C-phone')).count, 0, 'شركة ثانية');
  assert.equal(db.subs.length, 4);
});

test('orgId لازم يطابق شركة صاحب الاشتراك', async () => {
  const db = mockPrisma();
  const r = await scope.deleteOwnSubscription(db, { userId: 1, orgId: 20 }, 'https://push.example/A-phone');
  assert.equal(r.count, 0);
  assert.equal(db.subs.length, 4);
});

test('بدون جلسة صالحة أو بدون endpoint: ماكو حذف ولا استدعاء deleteMany', async () => {
  const db = mockPrisma();
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'no-such-session', 'https://push.example/A-phone')).count, 0);
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', undefined)).count, 0);
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', '')).count, 0);
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', { endpoint: 'x' })).count, 0);
  assert.equal((await scope.removeSubscriptionOnLogout(db, 'sessA', 'x'.repeat(2001))).count, 0);
  assert.equal((await scope.deleteOwnSubscription(db, { userId: 1 }, 'https://push.example/A-phone')).count, 0, 'orgId ناقص');
  assert.equal(db.calls.length, 0);
  assert.equal(db.subs.length, 4);
});

test('العميل: يرسل endpoint ويه الخروج ثم يسوي unsubscribe بالمتصفح', async () => {
  const { logoutWithPush } = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'pushClient.js')).href);
  const log = [];
  const sub = { endpoint: 'https://push.example/A-phone', unsubscribe: async () => { log.push('unsubscribe'); return true; } };
  const reg = { pushManager: { getSubscription: async () => sub } };
  const api = async (m, url, body) => { log.push([m, url, body]); return null; };
  const r = await logoutWithPush(api, { getRegistration: async () => reg });
  assert.equal(r.endpointSent, true);
  assert.deepEqual(log, [['POST', '/api/auth/logout', { endpoint: 'https://push.example/A-phone' }], 'unsubscribe']);
});

test('العميل: بدون اشتراك أو إذا فشل السيرفر، الخروج يكمل', async () => {
  const { logoutWithPush } = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'pushClient.js')).href);
  const calls = [];
  await logoutWithPush(async (m, u, b) => { calls.push(b); }, { getRegistration: async () => null });
  assert.deepEqual(calls, [{}]);
  let unsub = 0;
  const sub = { endpoint: 'https://push.example/x', unsubscribe: async () => { unsub++; } };
  await logoutWithPush(async () => { throw new Error('network'); }, { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) });
  assert.equal(unsub, 1, 'الإلغاء المحلي يصير حتى لو فشل الطلب');
  const hang = new Promise(() => {});
  const t0 = Date.now();
  await logoutWithPush(async (m, u, b) => { calls.push(b); }, { getRegistration: () => hang, timeoutMs: 50 });
  assert.ok(Date.now() - t0 < 1000, 'ما يتعلّق إذا الـ service worker ما رد');
});