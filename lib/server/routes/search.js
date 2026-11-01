/* بحث شامل: المهام + تعليقاتها · المشاريع + تعليقاتها · الطلبات + نقاشها · التعاميم · المواعيد · الأهداف ·
   أسماء الملفات المرفقة · الأشخاص. كل نتيجة تمرّ بنفس فحوص الصلاحية المستعملة بكل وحدة. */
const express = require('../express');
const prisma = require('../db');
const { z } = require('../validate');
const { ancestors, descendants } = require('../hierarchy');
const { access } = require('./attachments');
const { buildSearchWhere } = require('../visibility');

const router = express.Router();
const LIMIT = 8;

function snippet(text, q) {
  const s = String(text || '');
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return s.slice(0, 90);
  const a = Math.max(0, i - 35), b = Math.min(s.length, i + q.length + 55);
  return (a > 0 ? '…' : '') + s.slice(a, b).replace(/\s+/g, ' ') + (b < s.length ? '…' : '');
}
const strip = s => String(s || '').replace(/@\[(\d+)\]/g, '@');

router.get('/search', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2).max(60) }).parse(req.query);
  const orgId = req.user.orgId, me = req.user.id;
  const scope = [...req.scope];
  const upper = ancestors(req.index, me).map(a => a.id);
  const has = { contains: q };

  /* B1: فلتر الرؤية يندمج بـ AND ويه شرط البحث (قبل كان OR البحث يمسح OR الرؤية).
     القواعد نفسها المستعملة بـ tasks.js / projects.js / requests.js عبر visibility.js */
  const w = buildSearchWhere(req, q, upper);

  const [tasks, taskComments, projects, projComments, requests, reqComments, anns, events, goals, files] = await Promise.all([
    prisma.task.findMany({ where: w.task, select: { id: true, title: true, description: true, status: true }, take: LIMIT }),
    prisma.taskComment.findMany({ where: w.taskComment, select: { body: true, task: { select: { id: true, title: true } }, user: { select: { name: true } } }, take: LIMIT }),
    prisma.project.findMany({ where: w.project, select: { id: true, name: true, description: true }, take: LIMIT }),
    prisma.projectComment.findMany({ where: w.projectComment, select: { body: true, project: { select: { id: true, name: true } }, user: { select: { name: true } } }, take: LIMIT }),
    prisma.request.findMany({ where: w.request, select: { id: true, title: true, details: true, type: true }, take: LIMIT }),
    prisma.requestComment.findMany({ where: w.requestComment, select: { body: true, request: { select: { id: true, title: true } }, user: { select: { name: true } } }, take: LIMIT }),
    prisma.announcement.findMany({
      where: { orgId, OR: [{ title: has }, { body: has }] },
      include: { recipients: { select: { userId: true } } }, orderBy: { id: 'desc' }, take: 40,
    }),
    prisma.event.findMany({
      where: { orgId, OR: [{ title: has }, { description: has }, { location: has }],
        AND: [{ OR: [{ companyWide: true }, { creatorId: me }, { attendees: { some: { userId: me } } }] }] },
      select: { id: true, title: true, description: true, startAt: true }, take: LIMIT,
    }),
    prisma.goal.findMany({
      where: { orgId, ownerId: { in: [...scope, ...upper] }, OR: [{ title: has }, { description: has }] },
      select: { id: true, title: true, period: true }, take: LIMIT,
    }),
    prisma.attachment.findMany({ where: { orgId, name: has }, orderBy: { id: 'desc' }, take: 30 }),
  ]);

  const out = [];
  tasks.forEach(t => out.push({ type: 'task', id: t.id, title: t.title, snippet: snippet(t.description, q), meta: 'مهمة' }));
  taskComments.forEach(c => out.push({ type: 'task', id: c.task.id, title: c.task.title, snippet: `${c.user.name}: ${snippet(strip(c.body), q)}`, meta: 'تعليق على مهمة' }));
  projects.forEach(p => out.push({ type: 'project', id: p.id, title: p.name, snippet: snippet(p.description, q), meta: 'مساحة' }));
  projComments.forEach(c => out.push({ type: 'project', id: c.project.id, title: c.project.name, snippet: `${c.user.name}: ${snippet(strip(c.body), q)}`, meta: 'تعليق على مساحة' }));
  requests.forEach(r => out.push({ type: 'request', id: r.id, title: r.title, snippet: snippet(r.details, q), meta: 'طلب' }));
  reqComments.forEach(c => out.push({ type: 'request', id: c.request.id, title: c.request.title, snippet: `${c.user.name}: ${snippet(c.body, q)}`, meta: 'نقاش على طلب' }));

  anns.filter(a => a.audience === 'COMPANY' || a.authorId === me
    || (a.audience === 'TEAM' && descendants(req.index, a.authorId).has(me))
    || (a.audience === 'CUSTOM' && a.recipients.some(r => r.userId === me)))
    .slice(0, LIMIT).forEach(a => out.push({ type: 'announcement', id: a.id, title: a.title, snippet: snippet(a.body, q), meta: 'تعميم' }));
  events.forEach(e => out.push({ type: 'event', id: e.id, title: e.title, snippet: snippet(e.description, q), meta: 'موعد', at: e.startAt }));
  goals.forEach(g => out.push({ type: 'goal', id: g.id, title: g.title, snippet: g.period, meta: 'هدف' }));

  /* الملفات: نتحقق من صلاحية العنصر الحامل لكل ملف */
  let n = 0;
  for (const f of files) {
    if (n >= LIMIT) break;
    const acc = await access(req, f.entity, f.entityId);
    if (acc.ok) { out.push({ type: 'file', id: f.id, entity: f.entity, entityId: f.entityId, title: f.name, snippet: '', meta: 'ملف مرفق', mime: f.mime, url: `/api/attachments/${f.id}/file`, size: f.size }); n++; }
  }

  const ql = q.toLowerCase();
  req.index.users.filter(u => u.active && [u.name, u.title, u.department].some(x => (x || '').toLowerCase().includes(ql)))
    .slice(0, LIMIT).forEach(u => out.push({ type: 'person', id: u.id, title: u.name, snippet: [u.title, u.department].filter(Boolean).join(' · '), meta: 'شخص', role: u.role }));

  res.json({ q, results: out });
});

module.exports = router;
