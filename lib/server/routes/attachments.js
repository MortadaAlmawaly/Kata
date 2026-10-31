/* المرفقات: PDF وصور (PNG / JPG / WEBP) على أي عنصر — مهمة، مشروع، موعد، تعميم، طلب، هدف.
   - الرفع بـ JSON (base64) لتبقى حماية CSRF كما هي. الحد 8MB للملف و20 ملفاً للعنصر.
   - نتحقق من نوع الملف بالبايتات الأولى (magic bytes) ولا نثق باسمه ولا بالـ Content-Type.
   - الملفات تُخزَّن خارج مجلد الواجهة باسم عشوائي وتُخدَم فقط عبر مسار مصادَق عليه يفحص صلاحية العنصر.
   - من يرى العنصر يرى مرفقاته. الحذف لمن رفع الملف أو مسؤول النظام أو المدير التنفيذي. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('../express');
const prisma = require('../db');
const { z, idParam, httpError } = require('../validate');
const { ancestors, descendants } = require('../hierarchy');
const { audit } = require('../audit');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'uploads');
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PER_ENTITY = 20;
const ENTITIES = ['task', 'project', 'event', 'announcement', 'request', 'goal', 'policy'];
const EXT = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/* هل يرى المستخدم هذا العنصر؟ (نفس قواعد كل وحدة) + canUpload */
async function access(req, entity, id) {
  const orgId = req.user.orgId, me = req.user.id;
  const scope = [...req.scope];
  let ok = false, upload = true;
  switch (entity) {
    case 'task':
      ok = !!(await prisma.task.findFirst({ where: { id, orgId, OR: [{ assigneeId: { in: scope } }, { creatorId: me }] }, select: { id: true } }));
      break;
    case 'project': {
      const upper = ancestors(req.index, me).map(a => a.id);
      ok = !!(await prisma.project.findFirst({
        where: { id, orgId, OR: [{ ownerId: { in: [...scope, ...upper] } }, { tasks: { some: { assigneeId: { in: scope } } } }] }, select: { id: true },
      }));
      break;
    }
    case 'event':
      ok = !!(await prisma.event.findFirst({
        where: { id, orgId, OR: [{ companyWide: true }, { creatorId: me }, { attendees: { some: { userId: me } } }] }, select: { id: true },
      }));
      break;
    case 'announcement': {
      const a = await prisma.announcement.findFirst({ where: { id, orgId }, include: { recipients: { select: { userId: true } } } });
      if (a) {
        ok = a.audience === 'COMPANY' || a.authorId === me
          || (a.audience === 'TEAM' && descendants(req.index, a.authorId).has(me))
          || (a.audience === 'CUSTOM' && a.recipients.some(r => r.userId === me));
        upload = a.authorId === me;     // المرفقات يضيفها الكاتب فقط
      }
      break;
    }
    case 'request':
      ok = !!(await prisma.request.findFirst({
        where: { id, orgId, OR: [{ requesterId: { in: scope } }, { currentApproverId: me }, { steps: { some: { approverId: me } } }] }, select: { id: true },
      }));
      break;
    case 'policy': {
      const p = await prisma.policy.findFirst({ where: { id, orgId }, select: { id: true } });
      ok = !!p; upload = req.can('policies.manage');
      break;
    }
    case 'goal': {
      const g = await prisma.goal.findFirst({ where: { id, orgId }, select: { ownerId: true } });
      if (g) {
        const upper = new Set(ancestors(req.index, me).map(a => a.id));
        ok = req.scope.has(g.ownerId) || upper.has(g.ownerId);
        upload = req.scope.has(g.ownerId);
      }
      break;
    }
  }
  return { ok, upload };
}

const fileJSON = (a, req, users) => ({
  id: a.id, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt,
  url: `/api/attachments/${a.id}/file`,
  uploader: users.get(a.uploaderId) || null,
  canDelete: a.uploaderId === req.user.id || req.can('admin') || req.user.role === 'CEO',
});

router.get('/attachments', async (req, res) => {
  const q = z.object({ entity: z.enum(ENTITIES), id: z.coerce.number().int().positive() }).parse(req.query);
  const acc = await access(req, q.entity, q.id);
  if (!acc.ok) throw httpError(404, 'العنصر غير موجود');
  const rows = await prisma.attachment.findMany({
    where: { orgId: req.user.orgId, entity: q.entity, entityId: q.id }, orderBy: { id: 'asc' },
  });
  const users = new Map(req.index.users.map(u => [u.id, { id: u.id, name: u.name }]));
  res.json({ canUpload: acc.upload, files: rows.map(a => fileJSON(a, req, users)) });
});

/* الجسم كبير (base64) فنستخدم محلّلاً خاصاً بهذا المسار — المحلّل العام يتجاهله */
router.post('/attachments', express.json({ limit: '14mb' }), async (req, res) => {
  const d = z.object({
    entity: z.enum(ENTITIES), id: z.number().int().positive(),
    name: z.string().trim().min(1).max(180),
    data: z.string().min(16),
  }).parse(req.body);
  const acc = await access(req, d.entity, d.id);
  if (!acc.ok) throw httpError(404, 'العنصر غير موجود');
  if (!acc.upload) throw httpError(403, 'ليست لديك صلاحية رفع ملفات لهذا العنصر');
  if (d.entity === 'task' && !req.can('tasks.attach')) throw httpError(403, 'ليست لديك صلاحية رفع مرفقات للمهام');

  const buf = Buffer.from(d.data, 'base64');
  if (!buf.length) throw httpError(400, 'ملف فارغ');
  if (buf.length > MAX_BYTES) throw httpError(413, 'حجم الملف أكبر من 8 ميغابايت');
  const mime = sniff(buf);
  if (!mime) throw httpError(400, 'مسموح فقط PDF وصور (PNG, JPG, WEBP)');
  const count = await prisma.attachment.count({ where: { orgId: req.user.orgId, entity: d.entity, entityId: d.id } });
  if (count >= MAX_PER_ENTITY) throw httpError(400, `الحد الأقصى ${MAX_PER_ENTITY} ملفاً لكل عنصر`);

  const dir = path.join(UPLOAD_DIR, String(req.user.orgId));
  await fs.promises.mkdir(dir, { recursive: true });
  const storedName = crypto.randomBytes(16).toString('hex') + EXT[mime];
  await fs.promises.writeFile(path.join(dir, storedName), buf, { mode: 0o600 });

  /* اسم العرض: بدون مسارات ولا أحرف تحكم، وبامتداد يطابق النوع الفعلي */
  const base = path.basename(d.name).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').slice(0, 150) || 'file';
  const name = base.toLowerCase().endsWith(EXT[mime]) ? base : base.replace(/\.[a-z0-9]{1,5}$/i, '') + EXT[mime];
  const a = await prisma.attachment.create({
    data: { orgId: req.user.orgId, uploaderId: req.user.id, entity: d.entity, entityId: d.id, name, mime, size: buf.length, storedName },
  });
  await audit(req, 'file.upload', d.entity, d.id, { name, size: buf.length });
  res.status(201).json({ id: a.id });
});

router.get('/attachments/:id/file', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const a = await prisma.attachment.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!a) throw httpError(404, 'الملف غير موجود');
  const acc = await access(req, a.entity, a.entityId);
  if (!acc.ok) throw httpError(404, 'الملف غير موجود');
  const file = path.join(UPLOAD_DIR, String(a.orgId), a.storedName);
  if (!file.startsWith(path.join(UPLOAD_DIR, String(a.orgId)))) throw httpError(404, 'الملف غير موجود');
  res.set({
    'Content-Type': a.mime,
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=0, must-revalidate',
  });
  fs.promises.readFile(file).then(b => res.send(b)).catch(() => res.status(404).end());
});

router.delete('/attachments/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const a = await prisma.attachment.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!a) throw httpError(404, 'الملف غير موجود');
  if (a.uploaderId !== req.user.id && !req.can('admin') && req.user.role !== 'CEO') throw httpError(403, 'الحذف لمن رفع الملف');
  await prisma.attachment.delete({ where: { id } });
  fs.promises.unlink(path.join(UPLOAD_DIR, String(a.orgId), a.storedName)).catch(() => {});
  await audit(req, 'file.delete', a.entity, a.entityId, { name: a.name });
  res.status(204).end();
});

module.exports = router;
module.exports.access = access;
