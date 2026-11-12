'use client';
/* حدّ أخطاء الجذر (إن فشل الـlayout نفسه): صفحة بسيطة بدون أي اعتماد على باقي التطبيق. */
import { useEffect } from 'react';
import { reportClientError } from '@/lib/clientLog';

export default function GlobalError({ error, reset }) {
  useEffect(() => { reportClientError(error, 'global'); }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui,Tahoma,sans-serif', textAlign: 'center', padding: 24 }}>
        <div>
          <h1>حدث خطأ غير متوقع</h1>
          <p>تعذّر تحميل كاتا. جرّب مرة ثانية.</p>
          <button type="button" onClick={() => reset()} style={{ padding: '12px 22px', borderRadius: 12, border: 0, background: '#4F86FF', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>إعادة المحاولة</button>
        </div>
      </body>
    </html>
  );
}