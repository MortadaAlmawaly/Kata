/* طبقة صغيرة بواجهة Express (Router/req/res/rateLimit) فوق Request/Response القياسية لـ Next.js.
   تسمح لملفات المسارات (routes/*.js) أن تعمل كما هي داخل Route Handler واحد بدون خادم Express. */
const { URL } = require('url');

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function compile(pattern) {
  const keys = [];
  const src = pattern.replace(/[.+*?^${}()|[\]\\]/g, m => (m === '.' ? '\\.' : '\\' + m)).replace(/\/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '/([^/]+?)'; })
    .replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '([^/]+?)'; });
  return { re: new RegExp('^' + src + '/?$', 'i'), keys };
}

class RouterImpl {
  constructor() { this.stack = []; }

  use(...args) {
    let path = '';
    if (typeof args[0] === 'string') path = args.shift();
    for (const fn of args.flat()) this.stack.push({ kind: 'use', path, fn });
    return this;
  }

  _route(method, path, fns) {
    const paths = Array.isArray(path) ? path : [path];
    for (const p of paths) this.stack.push({ kind: 'route', method, ...compile(p), fns: fns.flat() });
    return this;
  }

  /* يشغّل المكدّس؛ done(err?) عند انتهائه بلا ردّ */
  handle(req, res, done) {
    let i = 0;
    const baseUrl = req._base || '';
    const next = err => {
      if (res.finished) return;
      if (err) return done(err);
      const layer = this.stack[i++];
      if (!layer) return done();
      const rel = req.path;
      if (layer.kind === 'use') {
        if (layer.path && !(rel === layer.path || rel.startsWith(layer.path + '/'))) return next();
        const fn = layer.fn;
        const savedPath = req.path, savedBase = req._base;
        if (layer.path) { req.path = rel.slice(layer.path.length) || '/'; req._base = (savedBase || '') + layer.path; }
        const restore = () => { req.path = savedPath; req._base = savedBase; };
        if (fn instanceof RouterImpl) return fn.handle(req, res, e => { restore(); next(e); });
        return run(fn, req, res, e => { restore(); next(e); });
      }
      if (layer.method !== req.method.toLowerCase() && !(layer.method === 'get' && req.method === 'HEAD')) return next();
      const m = layer.re.exec(rel);
      if (!m) return next();
      const params = {};
      layer.keys.forEach((k, n) => { params[k] = decodeURIComponent(m[n + 1]); });
      req.params = params;
      let j = 0;
      const step = e => {
        if (e) return next(e);
        const fn = layer.fns[j++];
        if (!fn) return next();
        run(fn, req, res, step);
      };
      step();
    };
    void baseUrl;
    next();
  }
}
METHODS.forEach(m => { RouterImpl.prototype[m] = function (path, ...fns) { return this._route(m, path, fns); }; });
RouterImpl.prototype.all = function (path, ...fns) { METHODS.forEach(m => this._route(m, path, fns)); return this; };

/* يشغّل معالجاً (متزامناً أو async)؛ الأخطاء والرفض تذهب لـ next(err) */
function run(fn, req, res, next) {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (e) { next(e); }
}

/* ═══════════ Request / Response ═══════════ */
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    if (k) { try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch (_) { out[k] = p.slice(i + 1).trim(); } }
  });
  return out;
}

function parseQuery(sp) {
  const q = {};
  for (const [k, v] of sp.entries()) {
    if (k in q) q[k] = [].concat(q[k], v); else q[k] = v;
  }
  return q;
}

/* B3: عنوان العميل. أول قيمة بـ X-Forwarded-For يكتبها العميل نفسه، فيگدر يزوّرها.
   نثق بس بالقيم اللي ضافتها الـ proxies مالتنا، وهي تنضاف من اليمين.
   TRUSTED_PROXY_HOPS = عدد الـ proxies الموثوقة گدام التطبيق (افتراضي 1: ناخذ آخر قيمة من اليمين).
   0 = ماكو proxy موثوق: نتجاهل الهيدر كلياً (كل الطلبات تنحسب بمفتاح واحد، فالأفضل تضبطه حسب النشر). */
function trustedHops() {
  const n = parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : 1;
}
function clientIp(xff, hops = trustedHops()) {
  if (!hops) return '0.0.0.0';
  const parts = String(xff || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '0.0.0.0';
  /* ويه hops موثوقة: العنوان اللي سجّلته أبعد proxy موثوقة هو parts[len - hops] */
  const ip = parts[Math.max(0, parts.length - hops)];
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : '0.0.0.0';
}

class Req {
  constructor(request, apiPath, body) {
    const url = new URL(request.url);
    this.method = request.method;
    this.headers = Object.fromEntries(request.headers.entries());
    this.path = apiPath;
    this.originalUrl = url.pathname + url.search;
    this.query = parseQuery(url.searchParams);
    this.params = {};
    this.body = body;
    this.cookies = parseCookies(request.headers.get('cookie'));
    this.protocol = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0];
    this.host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
    this.ip = clientIp(request.headers.get('x-forwarded-for'));
  }

  get(name) { return name.toLowerCase() === 'host' ? this.host : this.headers[name.toLowerCase()]; }
}

function serializeCookie(name, value, o = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  s += `; Path=${o.path || '/'}`;
  if (o.expires) s += `; Expires=${o.expires.toUTCString()}`;
  if (o.maxAge != null) s += `; Max-Age=${Math.floor(o.maxAge)}`;
  if (o.httpOnly) s += '; HttpOnly';
  if (o.secure) s += '; Secure';
  if (o.sameSite) s += `; SameSite=${String(o.sameSite).replace(/^./, c => c.toUpperCase())}`;
  return s;
}

class Res {
  constructor() {
    this.statusCode = 200;
    this.headers = new Headers();
    this.cookiesOut = [];
    this.bodyOut = null;
    this.finished = false;
    this._resolve = null;
    this.promise = new Promise(r => { this._resolve = r; });
  }

  status(n) { this.statusCode = n; return this; }
  set(k, v) {
    if (typeof k === 'object') Object.entries(k).forEach(([a, b]) => this.headers.set(a, String(b)));
    else this.headers.set(k, String(v));
    return this;
  }
  header(k, v) { return this.set(k, v); }
  setHeader(k, v) { return this.set(k, v); }
  type(t) { this.headers.set('Content-Type', t === 'js' ? 'text/javascript' : t === 'json' ? 'application/json' : t); return this; }
  cookie(name, value, opts) { this.cookiesOut.push(serializeCookie(name, value, opts)); return this; }
  clearCookie(name, opts) { this.cookiesOut.push(serializeCookie(name, '', { ...opts, expires: new Date(0), maxAge: 0 })); return this; }
  _finish(body) {
    if (this.finished) return this;
    this.finished = true;
    this.bodyOut = body;
    this._resolve();
    return this;
  }
  json(obj) { if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', 'application/json; charset=utf-8'); return this._finish(JSON.stringify(obj)); }
  send(data) {
    if (data !== null && typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof Uint8Array)) return this.json(data);
    if (typeof data === 'string' && !this.headers.has('Content-Type')) this.headers.set('Content-Type', 'text/html; charset=utf-8');
    return this._finish(data == null ? null : data);
  }
  sendStatus(n) { this.statusCode = n; return this._finish(null); }
  end(data) { return this._finish(data == null ? null : data); }
  redirect(to) { this.statusCode = 302; this.headers.set('Location', to); return this._finish(null); }

  toResponse() {
    const h = new Headers(this.headers);
    this.cookiesOut.forEach(c => h.append('Set-Cookie', c));
    const nullBody = this.statusCode === 204 || this.statusCode === 304 || this.bodyOut == null;
    return new Response(nullBody ? null : this.bodyOut, { status: this.statusCode, headers: h });
  }
}

/* ═══════════ rateLimit (ذاكرة العملية) ═══════════ */
function rateLimit({ windowMs = 60000, limit = 60, message = { error: 'Too many requests' }, skip, keyGenerator } = {}) {
  const hits = new Map();
  let lastSweep = Date.now();
  return (req, res, next) => {
    if (skip && skip(req)) return next();
    const now = Date.now();
    if (now - lastSweep > windowMs) { for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); lastSweep = now; }
    const key = keyGenerator ? keyGenerator(req) : req.ip;
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    if (h.n > limit) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json(message);
    }
    next();
  };
}

/* express.json(): الجسم يُحلَّل مسبقاً في الموزّع، فهذه دالة تمرير فقط */
const json = () => (req, res, next) => next();

module.exports = { Router: () => new RouterImpl(), Req, Res, rateLimit, json, run, clientIp };
