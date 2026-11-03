'use client';
/* صفحة 404 عربية مع زر رجوع للوحة المتابعة */
import { withBase } from '@/lib/base';

export default function NotFound() {
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
