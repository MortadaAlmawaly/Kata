'use client';
/* تبويبات صفحات مدموجة تحت بند واحد بالقائمة (مثلاً الشركة: التعاميم | السياسات). كلها روابط داخلية بلا إعادة تحميل. */
export const COMPANY_TABS = [['/announcements', 'التعاميم', 'announcements'], ['/policies', 'السياسات', 'policies']];
export const REPORT_TABS = [['/reports', 'تقارير الفريق', 'reports'], ['/analytics', 'التحليلات', 'analytics']];

export default function PageTabs({ items, active }) {
  return (
    <nav className="tabs-row page-tabs" aria-label="أقسام الصفحة">
      {items.map(([href, label, id]) => (
        <a key={id} href={href} className={`tab-pill ${id === active ? 'active' : ''}`} aria-current={id === active ? 'page' : undefined}>{label}</a>
      ))}
    </nav>
  );
}
