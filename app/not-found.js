'use client';
/* صفحة 404 عربية. على GitHub Pages تُخدَّم لأي رابط غير موجود، فنصلح أولاً حالتين شائعتين:
   رابط بلا شرطة أخيرة (/Kata/tasks) أو بلا المسار الفرعي (/tasks) ثم نعرض الصفحة إن لم ينفع. */
import { useEffect, useState } from 'react';
import { withBase } from '@/lib/base';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function NotFound() {
  const [fixing, setFixing] = useState(true);
  useEffect(() => {
    try {
      const { pathname, search, hash } = window.location;
      let p = pathname;
      if (BASE && p !== BASE && !p.startsWith(BASE + '/')) p = BASE + p;
      if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
      const key = 'kata-404:' + p;
      if (p !== pathname && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.replace(p + search + hash);
        return;
      }
    } catch (_) { /* تجاهل */ }
    setFixing(false);
  }, []);
  if (fixing) return null;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: 420 }}>
        <h1 style={{ margin: '0 0 8px' }}>الصفحة غير موجودة</h1>
        <p className="muted" style={{ marginBottom: 20 }}>الرابط الذي فتحته غير صحيح أو أُزيلت صفحته.</p>
        <a className="btn primary" href={withBase('/dashboard')}>العودة إلى لوحة المتابعة</a>
      </div>
    </main>
  );
}
