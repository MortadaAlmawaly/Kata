'use client';
/* هيكل صفحات قانونية عامة (بلا تسجيل دخول): عنوان واضح، تاريخ آخر تحديث، لغة عربية بسيطة، ورابط رجوع لصفحة الدخول.
   النصوص مسودات تحتاج مراجعة قانونية مختص قبل الاعتماد؛ لذلك تظهر عليها شارة «مسودة». */
import { useEffect } from 'react';
import { LogoSet, ThemeInit } from './ui';
import { withBase } from '@/lib/base';

export const LEGAL_UPDATED = '12 تشرين الثاني 2026';

export default function LegalPage({ title, children }) {
  useEffect(() => { document.title = title + ' — كاتا'; }, [title]);
  return (
    <div className="legal-page">
      <ThemeInit />
      <header className="legal-head">
        <a href={withBase('/login')} aria-label="كاتا"><LogoSet /></a>
        <a className="btn ghost sm" href={withBase('/login')}>العودة لصفحة الدخول</a>
      </header>
      <main className="legal-body">
        <span className="badge" style={{ marginBottom: 8, display: 'inline-block' }}>مسودة — قيد المراجعة القانونية</span>
        <h1>{title}</h1>
        <p className="muted small">آخر تحديث: {LEGAL_UPDATED}</p>
        {children}
        <nav className="legal-links" aria-label="صفحات قانونية">
          <a href={withBase('/privacy')}>سياسة الخصوصية</a> · <a href={withBase('/terms')}>الشروط والأحكام</a> · <a href={withBase('/account-deletion')}>حذف الحساب</a>
        </nav>
      </main>
    </div>
  );
}