/* Service Worker — يثبّت التطبيق على الهاتف ويستقبل الإشعارات.
   الكاش: هيكل الواجهة فقط (CSS/JS/أيقونات). بيانات /api لا تُخزَّن أبداً (خصوصية الشركات). */
const VERSION = 'kata-v5';
/* المسار الفرعي (مثل /Kata) يؤخذ من نطاق تسجيل العامل نفسه، فتعمل القائمة بأي مسار */
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const SHELL = ['/', '/login/', '/dashboard/', '/tasks/', '/calendar/', '/requests/', '/app.css', '/i18n-en.js', '/demo-mock.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/offline.html',
  '/fonts/Tajawal-Regular.ttf', '/fonts/Tajawal-Medium.ttf', '/fonts/Tajawal-Bold.ttf', '/fonts/Tajawal-ExtraBold.ttf', '/brand/mark.svg', '/brand/logo-ar.svg', '/brand/logo-ar-dark.svg', '/brand/logo-en.svg', '/brand/logo-en-dark.svg'].map(p => BASE + p);
/* ملفات البناء (_next/static) أسماؤها تتغيّر مع كل بناء فنخزّنها وقت التشغيل: كاش أولاً لأن اسم الملف مرتبط بمحتواه */
const isAsset = p => p.startsWith(BASE + '/_next/static/') || p.startsWith(BASE + '/fonts/') || p.startsWith(BASE + '/brand/');

self.addEventListener('install', e => {
  /* كل ملف على حدة: فشل ملف واحد لا يُسقط التخزين كله */
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(BASE + '/api/')) return;
  if (isAsset(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  /* الصفحات والباقي: الشبكة أولاً (حتى تصل التحديثات)، والكاش عند انقطاع الاتصال */
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && (SHELL.includes(url.pathname) || req.mode === 'navigate')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match(BASE + '/offline.html') : Response.error()))),
  );
});
/* إشعار Push: يظهر حتى لو التطبيق مسكّر */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'كاتا', {
    body: d.body || '',
    icon: BASE + '/icon-192.png',
    badge: BASE + '/icon-192.png',
    tag: d.tag || 'rb',
    renotify: true,
    dir: 'rtl', lang: 'ar',
    vibrate: [120, 60, 120],
    data: { url: d.url || BASE + '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || BASE + '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
