/* اختبار B1: البحث الشامل ما يطلّع للموظف نتائج برا صلاحيته.
   ما يحتاج قاعدة بيانات: نفحص كائن where اللي يتولد لـ Prisma، ونطبقه على بيانات وهمية
   بمطابق صغير يحاكي معاني Prisma المستعملة هنا (equals / in / notIn / contains / OR / AND / some).
   التشغيل: node --test tests/search-visibility.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSearchWhere, taskVisibleWhere, projectVisibleWhere, requestVisibleWhere } = require(path.join(__dirname, '..', 'lib', 'server', 'visibility'));

/* ---------- مطابق Prisma مصغّر ---------- */
function matchField(value, cond, row, key, db) {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== 'object') return value === cond;
  if ('some' in cond) return (db.rel[key] || (() => []))(row).some(r => matches(r, cond.some, db));
  if ('in' in cond) return cond.in.includes(value);
  if ('notIn' in cond) return value !== null && value !== undefined && !cond.notIn.includes(value);
  if ('contains' in cond) return String(value || '').includes(cond.contains);
  if ('not' in cond) return value !== cond.not;
  return matches(db.one[key](row), cond, db);   // فلتر على علاقة مفردة (task: {...})
}
function matches(row, where, db) {
  return Object.entries(where).every(([k, c]) => {
    if (k === 'OR') return c.some(w => matches(row, w, db));
    if (k === 'AND') return c.every(w => matches(row, w, db));
    return matchField(row[k], c, row, k, db);
  });
}

/* ---------- بيانات وهمية: شركتين ---------- */
// org 1: CEO(1) -> MANAGER(2) -> EMPLOYEE(3), EMPLOYEE(4) تحت المدير 2 ، EMPLOYEE(5) تحت الـ CEO مباشرة
// org 2: CEO(10)
const users = [
  { id: 1, orgId: 1, role: 'CEO', managerId: null },
  { id: 2, orgId: 1, role: 'MANAGER', managerId: 1 },
  { id: 3, orgId: 1, role: 'EMPLOYEE', managerId: 2 },
  { id: 4, orgId: 1, role: 'EMPLOYEE', managerId: 2 },
  { id: 5, orgId: 1, role: 'EMPLOYEE', managerId: 1 },
  { id: 10, orgId: 2, role: 'CEO', managerId: null },
];
const descendants = id => { const s = new Set(); const walk = p => users.filter(u => u.managerId === p).forEach(u => { s.add(u.id); walk(u.id); }); walk(id); return s; };
const ancestors = id => { const out = []; let u = users.find(x => x.id === id); while (u && u.managerId) { out.push(u.managerId); u = users.find(x => x.id === u.managerId); } return out; };
const scopeOf = u => (u.role === 'CEO' ? new Set(users.filter(x => x.orgId === u.orgId).map(x => x.id)) : new Set([u.id, ...descendants(u.id)]));
const reqFor = id => { const u = users.find(x => x.id === id); return { user: u, scope: scopeOf(u), boardProjects: new Map(), grantedSpaces: [], hiddenSpaces: [] }; };

const tasks = [
  { id: 101, orgId: 1, title: 'سري خطة رواتب', description: '', assigneeId: 2, creatorId: 1, projectId: null },
  { id: 102, orgId: 1, title: 'سري مهمة الموظف', description: '', assigneeId: 3, creatorId: 2, projectId: null },
  { id: 103, orgId: 1, title: 'سري مهمة زميل', description: '', assigneeId: 4, creatorId: 2, projectId: null },
  { id: 104, orgId: 1, title: 'سري بمساحة مخفية', description: '', assigneeId: 3, creatorId: 2, projectId: 900 },
  { id: 199, orgId: 2, title: 'سري شركة ثانية', description: '', assigneeId: 10, creatorId: 10, projectId: null },
];
const projects = [
  { id: 201, orgId: 1, name: 'سري مشروع الإدارة', description: '', ownerId: 1 },
  { id: 202, orgId: 1, name: 'سري مشروع موظف ثاني', description: '', ownerId: 5 },
  { id: 299, orgId: 2, name: 'سري مشروع شركة ثانية', description: '', ownerId: 10 },
];
const requests = [
  { id: 301, orgId: 1, type: 'LEAVE', title: 'سري إجازة المدير', details: '', requesterId: 2, currentApproverId: 1, steps: [{ approverId: 1 }] },
  { id: 302, orgId: 1, type: 'EXPENSE', title: 'سري مصروف المدير', details: '', requesterId: 2, currentApproverId: 1, steps: [{ approverId: 1 }] },
  { id: 303, orgId: 1, type: 'LEAVE', title: 'سري إجازة الموظف', details: '', requesterId: 3, currentApproverId: 2, steps: [{ approverId: 2 }] },
  { id: 304, orgId: 1, type: 'EXPENSE', title: 'سري مصروف زميل', details: '', requesterId: 4, currentApproverId: 2, steps: [{ approverId: 2 }] },
  { id: 305, orgId: 1, type: 'EXPENSE', title: 'سري مصروف موظف ثاني', details: '', requesterId: 5, currentApproverId: 1, steps: [{ approverId: 1 }] },
  { id: 399, orgId: 2, type: 'LEAVE', title: 'سري شركة ثانية', details: '', requesterId: 10, currentApproverId: 10, steps: [] },
];
const db = { rel: { tasks: p => tasks.filter(t => t.projectId === p.id), steps: r => r.steps }, one: {} };

const run = (id, q = 'سري', extra = {}) => {
  const req = Object.assign(reqFor(id), extra);
  const w = buildSearchWhere(req, q, ancestors(id));
  const ids = (rows, where) => rows.filter(r => matches(r, where, db)).map(r => r.id).sort((a, b) => a - b);
  return { w, tasks: ids(tasks, w.task), projects: ids(projects, w.project), requests: ids(requests, w.request) };
};

/* ---------- الاختبارات ---------- */
test('الموظف (3) يشوف بس شغله: ما تطلع مهام/طلبات المدير ولا الزملاء', () => {
  const r = run(3);
  assert.deepEqual(r.tasks, [102, 104]);
  assert.deepEqual(r.requests, [303]);            // إجازته بس، لا إجازة المدير (301) ولا مصروفه (302) ولا مصروف زميل (304)
  assert.deepEqual(r.projects, [201]);            // مالكه رئيسه الأعلى (CEO) -> مسموح حسب قاعدة projects.js
  assert.ok(!r.requests.includes(301) && !r.requests.includes(302), 'تسريب طلب مدير لموظف');
});

test('الموظف ما يشوف مهام بمساحة مخفية عنه (hiddenSpaces)', () => {
  const r = run(3, 'سري', { hiddenSpaces: [900] });
  assert.deepEqual(r.tasks, [102]);
});

test('المدير (2) يشوف فريقه + الطلبات اللي هو موافق عليها، مو طلبات موظف برا فريقه', () => {
  const r = run(2);
  assert.deepEqual(r.tasks, [101, 102, 103, 104]);
  assert.deepEqual(r.requests, [301, 302, 303, 304]);
  assert.ok(!r.requests.includes(305));
  assert.ok(!r.projects.includes(202));
});

test('الـ CEO (1) يشوف كل الشركة بس ما يعبر لشركة ثانية', () => {
  const r = run(1);
  assert.deepEqual(r.tasks, [101, 102, 103, 104]);
  assert.deepEqual(r.projects, [201, 202]);
  assert.deepEqual(r.requests, [301, 302, 303, 304, 305]);
});

test('orgId دائماً من الجلسة وبالمستوى الأعلى وداخل فلتر الرؤية', () => {
  for (const id of [1, 2, 3, 10]) {
    const { w } = run(id);
    const org = users.find(u => u.id === id).orgId;
    for (const k of ['task', 'project', 'request']) {
      assert.equal(w[k].orgId, org);
      assert.equal(w[k].AND[0].orgId, org);
    }
    for (const [k, rel] of [['taskComment', 'task'], ['projectComment', 'project'], ['requestComment', 'request']]) assert.equal(w[k][rel].orgId, org);
  }
  assert.deepEqual(run(10).requests, [399]);
});

test('مفاتيح الرؤية ما تنكتب فوقها: ماكو OR بالمستوى الأعلى، والرؤية والبحث كل واحد بعنصر AND', () => {
  const req = reqFor(3);
  const w = buildSearchWhere(req, 'x', ancestors(3));
  const pairs = [['task', taskVisibleWhere(req)], ['project', projectVisibleWhere(req, ancestors(3))], ['request', requestVisibleWhere(req)]];
  for (const [k, vis] of pairs) {
    assert.equal(w[k].OR, undefined, k + ': OR بالمستوى الأعلى معناه رجعت المشكلة');
    assert.equal(w[k].AND.length, 2);
    assert.deepEqual(w[k].AND[0], vis, k + ': فلتر الرؤية لازم يطابق قاعدة الوحدة الأصلية');
    assert.ok(Array.isArray(w[k].AND[1].OR));
  }
});

test('إثبات المشكلة القديمة: الدمج بـ spread كان يمسح الرؤية ويسرّب للموظف', () => {
  const req = reqFor(3);
  const reqVis = requestVisibleWhere(req);
  const old = { ...reqVis, OR: [{ title: { contains: 'سري' } }, { details: { contains: 'سري' } }] };
  const leaked = requests.filter(r => matches(r, old, db)).map(r => r.id);
  assert.ok(leaked.includes(301) && leaked.includes(302), 'الشكل القديم لازم يسرّب، وهذا يثبت إن الاختبار يكشف المشكلة');
});