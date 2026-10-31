/* مسار فرعي اختياري (مثل /Kata عند النشر على github.io/Kata). بدون NEXT_PUBLIC_BASE_PATH يرجع المسار كما هو. */
export const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

/* يضيف المسار الفرعي للمسارات المطلقة الداخلية فقط (يترك الروابط الكاملة وغير المطلقة، ولا يكرر الإضافة) */
export const withBase = p => {
  if (!BASE || typeof p !== 'string' || p[0] !== '/' || p[1] === '/') return p;
  return p === BASE || p.startsWith(BASE + '/') || p.startsWith(BASE + '?') ? p : BASE + p;
};

/* يزيل المسار الفرعي من مسار الصفحة الحالية */
export const stripBase = p => (BASE && typeof p === 'string' && (p === BASE || p.startsWith(BASE + '/')) ? p.slice(BASE.length) || '/' : p);
