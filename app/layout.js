/* الهيكل الجذري: RTL، الخط، app.css (نفس تصميم الموقع القديم)، ومترجم الواجهة عربي/إنكليزي. */
import Script from 'next/script';

/* مسار فرعي اختياري عند النشر على github.io/<repo> (فارغ في التشغيل العادي) */
const B = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

export const metadata = {
  title: 'كاتا',
  description: 'إدارة المهام والمواعيد والموافقات لشركتك',
  manifest: B + '/manifest.webmanifest',
  icons: { icon: B + '/brand/mark.svg', apple: B + '/apple-touch-icon.png' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#031A4D' };

/* الروابط المطلقة الداخلية (href="/tasks" ...) تُحوَّل لتشمل المسار الفرعي عند النقر */
const BASE_SHIM = `(function(b){document.addEventListener('click',function(e){if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target.closest&&e.target.closest('a[href]');if(!a||(a.target&&a.target!=='_self')||a.hasAttribute('download'))return;var h=a.getAttribute('href');if(!h||h[0]!=='/'||h[1]==='/'||h===b||h.indexOf(b+'/')===0||h.indexOf(b+'?')===0)return;e.preventDefault();e.stopPropagation();location.href=b+h},true)})(${JSON.stringify(B)})`;

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* يضبط الوضع الداكن قبل أول رسم لمنع وميض الأبيض */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('rb-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}" }} />
        {B && <script dangerouslySetInnerHTML={{ __html: BASE_SHIM }} />}
        <link rel="preload" href={B + '/fonts/Tajawal-Regular.ttf'} as="font" type="font/ttf" crossOrigin="" />
        <link rel="stylesheet" href={B + '/app.css?v=' + Date.now()} />
        {/* وضع التجربة: خادم وهمي داخل المتصفح (NEXT_PUBLIC_DEMO=1) يعمل قبل أي طلب */}
        {process.env.NEXT_PUBLIC_DEMO === '1' && <script src={B + '/demo-mock.js?v=' + Date.now()} />}
      </head>
      <body suppressHydrationWarning>
        {children}
        <Script src={B + '/i18n-en.js'} strategy="afterInteractive" />
      </body>
    </html>
  );
}
