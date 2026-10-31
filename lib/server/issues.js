/* أساس «المهام على طريقة Jira»:
   - رقم المهمة = <بادئة>-<رقم> مثل NKH-12. البادئة = مفتاح المشروع، وللمهام بلا مشروع: settings.taskKey (الافتراضي TSK).
   - سجل تغييرات (History) لكل حقل مهم.
   - backfill: يملأ أرقام المهام القديمة ومفاتيح المشاريع الناقصة مرة واحدة عند الإقلاع (آمن للتكرار). */
const prisma = require('./db');

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const DEFAULT_PREFIX = 'TSK';

/* مفتاح مشروع مقترح من اسمه: الحروف اللاتينية الأولى، وإلا P<id> */
function suggestKey(name, id) {
  const latin = String(name || '').match(/[A-Za-z0-9]+/g);
  if (latin) {
    const k = latin.map(w => w[0]).join('').toUpperCase().slice(0, 4);
    if (KEY_RE.test(k)) return k;
    const w = latin.join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (KEY_RE.test(w)) return w;
  }
  return 'P' + id;
}

async function prefixFor(orgId, settings, projectId) {
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, orgId }, select: { id: true, key: true, name: true } });
    if (p) {
      if (p.key) return p.key;
      const key = await uniqueProjectKey(orgId, suggestKey(p.name, p.id));
      await prisma.project.update({ where: { id: p.id }, data: { key } });
      return key;
    }
  }
  const k = String((settings && settings.taskKey) || DEFAULT_PREFIX).toUpperCase();
  return KEY_RE.test(k) ? k : DEFAULT_PREFIX;
}

async function uniqueProjectKey(orgId, want) {
  let key = want, i = 2;
  while (await prisma.project.findFirst({ where: { orgId, key }, select: { id: true } })) key = (want.slice(0, 8) + i++).slice(0, 10);
  return key;
}

/* يحجز رقماً تالياً داخل المعاملة (يعيد المحاولة عند تعارض نادر) */
async function nextKey(client, orgId, prefix) {
  const m = await client.task.aggregate({ where: { orgId, keyPrefix: prefix }, _max: { number: true } });
  return { keyPrefix: prefix, number: (m._max.number || 0) + 1 };
}

/* ينشئ مهمة بمفتاح فريد؛ data بدون keyPrefix/number */
async function createWithKey(orgId, prefix, data, include) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const k = await nextKey(prisma, orgId, prefix);
    try {
      return await prisma.task.create({ data: { ...data, orgId, ...k }, ...(include ? { include } : {}) });
    } catch (e) {
      if (!(e && e.code === 'P2002')) throw e;
    }
  }
  throw new Error('تعذّر حجز رقم المهمة');
}

const keyOf = t => `${t.keyPrefix || DEFAULT_PREFIX}-${t.number || t.id}`;

/* سجل التغييرات */
async function logChanges(taskId, userId, changes) {
  const rows = changes.filter(c => String(c.from ?? '') !== String(c.to ?? ''))
    .map(c => ({ taskId, userId, field: c.field, fromValue: c.from == null ? null : String(c.from).slice(0, 255), toValue: c.to == null ? null : String(c.to).slice(0, 255) }));
  if (rows.length) await prisma.taskHistory.createMany({ data: rows });
}

/* تعبئة القديم مرة واحدة */
async function backfill() {
  const projects = await prisma.project.findMany({ where: { key: null }, select: { id: true, orgId: true, name: true } });
  for (const p of projects) {
    const key = await uniqueProjectKey(p.orgId, suggestKey(p.name, p.id));
    await prisma.project.update({ where: { id: p.id }, data: { key } });
  }
  const orgs = await prisma.task.groupBy({ by: ['orgId'], where: { number: null } });
  for (const { orgId } of orgs) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const settings = (org && org.settings) || {};
    const rows = await prisma.task.findMany({ where: { orgId, number: null }, orderBy: { id: 'asc' }, select: { id: true, projectId: true } });
    for (const t of rows) {
      const prefix = await prefixFor(orgId, settings, t.projectId);
      const k = await nextKey(prisma, orgId, prefix);
      await prisma.task.update({ where: { id: t.id }, data: k });
    }
  }
}

module.exports = { KEY_RE, DEFAULT_PREFIX, suggestKey, prefixFor, uniqueProjectKey, nextKey, createWithKey, keyOf, logChanges, backfill };
