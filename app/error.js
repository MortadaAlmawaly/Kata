'use client';
/* حدّ أخطاء الواجهة: بدل الشاشة البيضاء تظهر رسالة مفهومة مع إعادة المحاولة، ويُبلَّغ عن الخطأ للسيرفر. */
import { useEffect } from 'react';
import { reportClientError } from '@/lib/clientLog';
import { withBase } from '@/lib/base';

export default function ErrorBoundary({ error, reset }) {
  useEffect(() => { reportClientError(error, 'boundary'); }, [error]);
  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: 440 }}>
        <h1 style={{ margin: '0 0 8px' }}>حدث خطأ غير متوقع</h1>
        <p className="muted" style={{ marginBottom: 20 }}>تعذّر عرض هذه الصفحة. حاول مرة ثانية، وإن تكرر الخطأ ارجع للوحة المتابعة.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => reset()}>إعادة المحاولة</button>
          <a className="btn ghost" href={withBase('/dashboard')}>لوحة المتابعة</a>
        </div>
      </div>
    </main>
  );
}