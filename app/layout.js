/* الهيكل الجذري: RTL، الخط، app.css (نفس تصميم الموقع القديم)، ومترجم الواجهة عربي/إنكليزي. */
import Script from 'next/script';

export const metadata = {
  title: 'كاتا',
  description: 'إدارة المهام والمواعيد والموافقات لشركتك',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand/mark.svg', apple: '/apple-touch-icon.png' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#031A4D' };

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* يضبط الوضع الداكن قبل أول رسم لمنع وميض الأبيض */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('rb-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}" }} />
        <link rel="preload" href="/fonts/Tajawal-Regular.ttf" as="font" type="font/ttf" crossOrigin="" />
        <link rel="stylesheet" href={'/app.css?v=' + Date.now()} />
        {/* وضع التجربة: خادم وهمي داخل المتصفح (NEXT_PUBLIC_DEMO=1) يعمل قبل أي طلب */}
        {process.env.NEXT_PUBLIC_DEMO === '1' && <script src={'/demo-mock.js?v=' + Date.now()} />}
      </head>
      <body suppressHydrationWarning>
        {children}
        <Script src="/i18n-en.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}