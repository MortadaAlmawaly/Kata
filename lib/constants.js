/* ثوابت مشتركة بين صفحات React (مطابقة لما في الواجهة القديمة public/app.js) */
export const ROLE = { EMPLOYEE: 'موظف', MANAGER: 'مدير قسم', DIRECTOR: 'مدير إدارة', GM: 'المدير العام', CEO: 'المدير التنفيذي' };

export const ICONS = {
  dashboard: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  tasks: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  goals: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  requests: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  team: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.5 3.5 6',
  audit: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  attendance: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  announce: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8',
  reports: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  review: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  policy: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  chart: 'M3 17l5-5 4 4 8-9M14 7h6v6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
};


/* خرائط التسميات — تُعدَّل في مكانها عبر applyLabels(me) فتظهر تسميات الشركة المخصّصة في كل الصفحات */
export const STATUS = { TODO: 'بالانتظار', IN_PROGRESS: 'قيد التنفيذ', REVIEW: 'للمراجعة', DONE: 'مكتملة' };
export const PRIORITY = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' };
export const ITYPE = { TASK: 'مهمة', BUG: 'خلل', STORY: 'قصة', EPIC: 'ملحمة', SUBTASK: 'مهمة فرعية' };
export const RTYPE = { EXPENSE: 'مصروف', PURCHASE: 'شراء', BUDGET: 'ميزانية', LEAVE: 'إجازة' };
export const ETYPE = { MEETING: 'اجتماع', APPOINTMENT: 'موعد', EVENT: 'فعالية', HOLIDAY: 'عطلة رسمية', OTHER: 'نوع آخر' };
export const PSTATUS = { PLANNING: 'تخطيط', ACTIVE: 'جارٍ', ON_HOLD: 'متوقف', DONE: 'مكتمل' };

const LABEL_GROUPS = { roles: ROLE, taskStatus: STATUS, priority: PRIORITY, issueType: ITYPE, requestType: RTYPE, eventType: ETYPE, projectStatus: PSTATUS };
export const DEFAULT_LABELS = {};
const DEFAULTS = DEFAULT_LABELS;
export const HIDDEN = {};   // { issueType: Set, priority: Set } — عناصر أساسية أخفتها الشركة
export function applyLabels(me) {
  const st = (me && me.org && me.org.settings) || {};
  Object.keys(HIDDEN).forEach(k => delete HIDDEN[k]);
  Object.entries(st.hiddenItems || {}).forEach(([g, arr]) => { HIDDEN[g] = new Set(arr); });
  const L = st.labels || {};
  for (const [g, obj] of Object.entries(LABEL_GROUPS)) {
    if (!DEFAULTS[g]) DEFAULTS[g] = { ...obj };
    for (const k of Object.keys(obj)) if (!(k in DEFAULTS[g])) delete obj[k];
    Object.assign(obj, DEFAULTS[g], L[g] || {});
  }
  (st.taskStatuses || []).forEach(s => { STATUS[s.key] = s.name; });
  const CI = st.customItems || {};
  for (const g of ['priority', 'issueType', 'requestType', 'eventType', 'projectStatus']) (CI[g] || []).forEach(s => { LABEL_GROUPS[g][s.key] = s.name; });
}
export const LEVEL_ORDER = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3, GM: 4, CEO: 5 };

export const GROUPS = { main: '', work: 'العمل', people: 'الناس', admin: 'الإدارة' };

/* صفحات التنقّل. react: مسار صفحة Next.js المرحَّلة؛ بدونه تبقى الصفحة في الواجهة القديمة (#/id) */
export const PAGES = [
  { id: 'dashboard', group: 'main', title: 'لوحة المتابعة', sub: 'ملخص يومك وأولوياتك', icon: 'dashboard', react: '/dashboard' },
  { id: 'calendar', group: 'main', title: 'التقويم والمواعيد', sub: 'اجتماعاتك وتسليماتك وإجازات الفريق', icon: 'calendar', react: '/calendar' },
  { id: 'tasks', group: 'work', title: 'المهام', sub: 'ما عليك وما كلّفت به فريقك', icon: 'tasks', react: '/tasks' },
  { id: 'projects', group: 'work', title: 'المشاريع', sub: 'تقدّم المشاريع ومهامها', icon: 'projects', react: '/projects' },
  { id: 'goals', group: 'work', title: 'الأهداف', sub: 'أهداف بنتائج قابلة للقياس', icon: 'goals', react: '/goals' },
  { id: 'requests', group: 'work', title: 'الطلبات والموافقات', sub: 'مصروفات وإجازات ومشتريات', icon: 'requests', react: '/requests' },
  { id: 'reviews', group: 'people', title: 'التقييمات', sub: 'تقييم الأداء الدوري', icon: 'review', react: '/reviews' },
  { id: 'policies', group: 'people', title: 'السياسات', sub: 'سياسات الشركة والإقرار بها', icon: 'policy', react: '/policies' },
  { id: 'attendance', group: 'people', title: 'الحضور والإجازات', sub: 'حضورك ورصيد إجازاتك وحالة الفريق', icon: 'attendance', react: '/attendance' },
  { id: 'announcements', group: 'people', title: 'التعاميم', sub: 'أخبار الشركة والفريق', icon: 'announce', react: '/announcements' },
  { id: 'team', group: 'people', title: 'الهيكل والفريق', sub: 'الهرم الوظيفي ومن تحتك', icon: 'team', react: '/team' },
  { id: 'analytics', group: 'admin', title: 'التحليلات', sub: 'اتجاهات الإنجاز والحضور والمصروفات', icon: 'chart', perm: 'reports.view', react: '/analytics' },
  { id: 'reports', group: 'admin', title: 'التقارير', sub: 'أداء الفريق لفترة محددة', icon: 'reports', perm: 'reports.view', react: '/reports' },
  { id: 'audit', group: 'admin', title: 'سجل التدقيق', sub: 'كل العمليات الحساسة', icon: 'audit', perm: 'audit.view', react: '/audit' },
  { id: 'platform', group: 'admin', title: 'الشركات (المنصة)', sub: 'إدارة الشركات المشتركة', icon: 'team', platform: true, react: '/platform' },
  { id: 'settings', group: 'admin', title: 'الإعدادات', sub: 'حسابك والشركة والصلاحيات والدعوات', icon: 'settings', react: '/settings' },
];

export const hueOf = n => { let h = 0; for (const c of String(n || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initialOf = n => (String(n || '?').trim().charAt(0) || '?');
export const pad = n => String(n).padStart(2, '0');
export const fmtDT = s => { const d = new Date(s); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
