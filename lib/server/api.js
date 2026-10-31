/* نقطة دخول الـ API داخل Next.js: يبني نفس سلسلة الوسائط التي كانت في src/index.js القديم
   ويُستدعى من app/api/[[...path]]/route.ts لكل الطرق (GET/POST/PUT/PATCH/DELETE). */
const { ZodError } = require('zod');
const { Router, Req, Res, rateLimit } = require('./express');
const prisma = require('./db');
const auth = require('./auth');

const READ = ['GET', 'HEAD', 'OPTIONS'];

function buildApi() {
  const api = Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  /* CSRF: نماذج HTML من مواقع ثانية ما تقدر ترسل application/json */
  api.use((req, res, next) => {
    if (READ.includes(req.method)) return next();
    if (!(req.get('content-type') || '').startsWith('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
  });

  api.use(auth.router);
  api.use(auth.requireAuth);

  /* 120 عملية كتابة بالدقيقة لكل مستخدم */
  api.use(rateLimit({
    windowMs: 60 * 1000, limit: 120, skip: req => READ.includes(req.method),
    keyGenerator: req => 'user:' + req.user.id, message: { error: 'طلبات كثيرة، حاول بعد دقيقة' },
  }));

  api.use(require('./routes/users'));
  api.use(require('./routes/tasks'));
  api.use(require('./routes/sprints'));
  api.use(require('./routes/boards'));
  api.use(require('./routes/goals'));
  api.use(require('./routes/requests'));
  api.use(require('./routes/calendar'));
  api.use(require('./routes/projects'));
  api.use(require('./routes/spaces'));
  api.use(require('./routes/hr'));
  api.use(require('./routes/attachments'));
  api.use(require('./routes/search'));
  api.use(require('./routes/reviews'));
  api.use(require('./routes/policies'));
  api.use(require('./routes/analytics'));
  api.use(require('./routes/integrations'));
  api.use(require('./routes/announcements'));
  api.use(require('./routes/attendance'));
  api.use(require('./routes/reports'));
  api.use(require('./routes/admin'));
  api.use(require('./routes/dashboard'));
  api.use(require('./routes/org'));
  api.use((req, res) => res.status(404).json({ error: 'غير موجود' }));
  return api;
}

function errorResponse(res, err) {
  if (err instanceof ZodError) return res.status(400).json({ error: (err.issues[0] && err.issues[0].message) || 'بيانات غير صالحة' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === 'P2002') return res.status(409).json({ error: 'موجود مسبقاً' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'غير موجود' });
  console.error(err);
  return res.status(500).json({ error: 'خطأ في الخادم' });
}

/* مهام الخلفية: أرقام المهام القديمة + تنظيف الجلسات المنتهية (مرة لكل عملية) */
function startBackground() {
  if (globalThis.__bgStarted) return;
  globalThis.__bgStarted = true;
  require('./issues').backfill().catch(err => console.error('backfill:', err.message));
  setInterval(() => auth.purgeExpiredSessions().catch(console.error), 60 * 60 * 1000).unref();
}

async function readBody(request, path) {
  if (READ.includes(request.method)) return undefined;
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return undefined;
  const limit = request.method === 'POST' && path === '/attachments' ? 14 * 1024 * 1024 : 200 * 1024;
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) { const e = new Error('الطلب كبير جداً'); e.status = 413; throw e; }
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) { const e = new Error('JSON غير صالح'); e.status = 400; throw e; }
}

async function handleApi(request, segments) {
  let apiPath = '/' + (segments || []).join('/');
  if (apiPath.length > 1 && apiPath.endsWith('/')) apiPath = apiPath.slice(0, -1);
  const res = new Res();
  try {
    const g = globalThis;
    if (!g.__apiRouter) { g.__apiRouter = buildApi(); startBackground(); }
    const body = await readBody(request, apiPath);
    const req = new Req(request, apiPath, body);
    g.__apiRouter.handle(req, res, err => {
      if (res.finished) return;
      if (err) errorResponse(res, err); else res.status(404).json({ error: 'غير موجود' });
    });
    await res.promise;
  } catch (err) {
    errorResponse(res, err);
  }
  return res.toResponse();
}

/* ICS: يستعمل router ics.js (بلا مصادقة كوكي) */
async function handleIcs(request, file) {
  const res = new Res();
  try {
    const g = globalThis;
    if (!g.__icsRouter) g.__icsRouter = require('./ics');
    const req = new Req(request, '/cal/' + file, undefined);
    g.__icsRouter.handle(req, res, err => {
      if (res.finished) return;
      if (err) errorResponse(res, err); else res.status(404).send('Not found');
    });
    await res.promise;
  } catch (err) { errorResponse(res, err); }
  return res.toResponse();
}

module.exports = { handleApi, handleIcs, errorResponse, prisma };