/* ثوابت وأدوات المهام المشتركة (ترحيل tasks-pro.js). كل شيء هنا دوال نقيّة بلا DOM. */
export const IT_ICON = { TASK: '✔', BUG: '●', STORY: '▲', EPIC: '⚡', SUBTASK: '↳' };
export const itKind = k => (IT_ICON[k] ? k : 'OTHER');
import { HIDDEN, ITYPE, PRIORITY, STATUS } from './constants';
export { ITYPE };
export const RECUR = { '': 'بدون تكرار', DAILY: 'يومياً', WEEKLY: 'أسبوعياً', MONTHLY: 'شهرياً' };
export const PRI_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export const PRI_ICON = { URGENT: '＝', HIGH: '＝', MEDIUM: '＝', LOW: '＝' };
export const COLOR_PRI = { URGENT: '#e5484d', HIGH: '#f97316', MEDIUM: '#d4a017', LOW: '#2f7cf6' };
export const COLOR_TYPE = { TASK: '#2f7cf6', BUG: '#e5484d', STORY: '#2fa56b', EPIC: '#8e4ec6', SUBTASK: '#4aa3c7' };

export const TH_FIELD = {
  title: 'العنوان', description: 'الوصف', status: 'الحالة', priority: 'الأولوية', issueType: 'النوع', assignee: 'المنفّذ',
  storyPoints: 'نقاط القصة', estimateMin: 'التقدير', dueDate: 'تاريخ التسليم', startDate: 'تاريخ البدء', labels: 'الوسوم',
  parent: 'الأم / الملحمة', sprint: 'السباق', project: 'المشروع', progress: 'التقدّم', worklog: 'ساعات عمل', link: 'رابط', timer: 'المؤقّت', automation: 'أتمتة',
};
export const LINK_LABEL = {
  'BLOCKS:out': 'تحجب', 'BLOCKS:in': 'محجوبة بـ', 'RELATES:out': 'مرتبطة بـ', 'RELATES:in': 'مرتبطة بـ',
  'DUPLICATES:out': 'مكرّرة لـ', 'DUPLICATES:in': 'مكرَّرة بـ',
};
/* مسميات حقول المهمة الافتراضية (تعيد الشركة/اللوحة تسميتها) */
export const FL_KEYS = {
  status: 'الحالة', type: 'النوع', priority: 'الأولوية', labels: 'الوسوم', points: 'نقاط القصة', sprint: 'السباق', parent: 'الأم / الملحمة',
  project: 'المشروع', assignee: 'المنفّذ', reporter: 'المُنشِئ', watchers: 'المراقبون', start: 'البدء', due: 'التسليم', created: 'أُنشئت',
  updated: 'حُدِّثت', estimate: 'التقدير', secDetails: 'التفاصيل', secPeople: 'الأشخاص', secDates: 'التواريخ', secTime: 'تتبّع الوقت',
  description: 'الوصف', checklist: 'قائمة التحقق', tabComments: 'التعليقات', tabWorklog: 'ساعات العمل', tabHistory: 'السجل',
  subtasks: 'مهام فرعية', epicIssues: 'مهام الملحمة', linked: 'مهام مرتبطة', startWork: 'بدء العمل', createBtn: 'إنشاء',
};
export const CORE_KEYS = ['status', 'type', 'priority', 'labels', 'points', 'sprint', 'parent', 'project', 'assignee', 'reporter', 'watchers', 'start', 'due', 'created', 'updated', 'estimate'];
export const BOARD_CARD_FIELDS = {
  cover: 'صورة الغلاف', key: 'رقم المهمة', type: 'أيقونة النوع', priority: 'الأولوية', assignee: 'صورة المنفّذ', points: 'نقاط القصة', due: 'تاريخ التسليم', labels: 'الوسوم',
  checklist: 'قائمة التحقق', comments: 'عدد التعليقات', epic: 'الملحمة والمهام الفرعية', timer: 'مؤشّر المؤقّت',
};
/* أقسام العمود الرئيسي القابلة للإظهار/الإخفاء حسب نوع المهمة */
export const SPECIAL_CONTEXT = ['timetracking'];   // أقسام جانبية خاصة تظهر ضمن حقول السياق
export const MAIN_SECTIONS = { description: 'الوصف', subtasks: 'مهام فرعية', checklist: 'قائمة التحقق', linked: 'مهام مرتبطة', attachments: 'المرفقات', activity: 'النشاط (التعليقات والسجل)' };
export const CF_TYPE_AR = {
  text: 'نص قصير', longtext: 'نص طويل', number: 'رقم', money: 'مبلغ', percent: 'نسبة مئوية', rating: 'تقييم بالنجوم',
  date: 'تاريخ', datetime: 'تاريخ ووقت', time: 'وقت', select: 'قائمة (خيار واحد)', radio: 'أزرار اختيار',
  multiselect: 'قائمة (عدة خيارات)', tags: 'وسوم حرّة', user: 'شخص', users: 'عدة أشخاص', checkbox: 'مربع اختيار',
  url: 'رابط', email: 'بريد إلكتروني', phone: 'هاتف', color: 'لون',
};

export const fmtMin = m => {
  if (!m) return '0m';
  const d = Math.floor(m / 480), h = Math.floor((m % 480) / 60), mi = m % 60;
  return [d && d + 'd', h && h + 'h', mi && mi + 'm'].filter(Boolean).join(' ');
};
/* "1d 2h 30m" · "90m" · "1.5h" · "45" (= دقائق) · يقبل ي/س/د. null = فارغ، NaN = غير صالح */
export function parseMin(s) {
  s = String(s || '').trim().toLowerCase().replace(/ي/g, 'd').replace(/س/g, 'h').replace(/د/g, 'm');
  if (!s) return null;
  if (/^\d+$/.test(s)) return +s;
  let tot = 0, ok = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([dhm])/g)) {
    ok = true;
    const n = parseFloat(m[1]);
    tot += m[2] === 'd' ? n * 480 : m[2] === 'h' ? n * 60 : n;
  }
  return ok ? Math.round(tot) : NaN;
}

/* سياق عرض المهام: يجمع إعدادات الشركة ومسميات/حقول اللوحة الحالية.
   board: لوحة من /api/boards أو null؛ users: المستخدمون المتاحون للإسناد */
export function makeCtx(me, board, users, space) {
  const st = (me && me.org && me.org.settings) || {};
  const labels = (board && board.labels) || {};
  const itype = { ...ITYPE };
  const priority = { ...PRIORITY };
  Object.entries(labels).forEach(([k, v]) => {
    if (!v) return;
    if (k.startsWith('it:') && k.slice(3) in itype) itype[k.slice(3)] = v;
    if (k.startsWith('pr:') && k.slice(3) in priority) priority[k.slice(3)] = v;
  });
  const detail = (board && board.detail) || {};
  (detail.priorities || []).forEach(p => { priority[p.key] = p.name; });
  (detail.types || []).forEach(t => { itype[t.key] = t.name; });
  const hidden = new Set(detail.hide || []);
  const bfields = (board && board.fields) || [];
  const defs = [...(st.customFields || []), ...(((space && space.fields) || [])), ...bfields].filter(d => !hidden.has('cf:' + d.key));
  return {
    me, users, board, space, itype, priority, detail, hidden,
    /* خيارات القوائم: العناصر الأساسية التي أخفتها الشركة لا تظهر (إلا إن كانت القيمة الحالية) */
    /* حالات هذه اللوحة فقط: أعمدتها، أو حالات الشركة غير الخاصة بلوحة أخرى (+ الحالة الحالية للمهمة) */
    statusOpts: cur => {
      const owned = new Map((st.taskStatuses || []).filter(s => s.board).map(s => [s.key, s.board]));
      const cols = board && !board.autoColumns ? (board.columns || []).filter(c => STATUS[c.status] !== undefined) : null;
      const list = cols ? cols.map(c => [c.status, c.name || STATUS[c.status]])
        : Object.entries(STATUS).filter(([k]) => !owned.has(k) || (board && owned.get(k) === board.id));
      if (cur && STATUS[cur] !== undefined && !list.some(([k]) => k === cur)) list.push([cur, STATUS[cur]]);
      /* سير العمل: عند وجود أسهم لا تُعرض إلا الحالات المسموح الانتقال إليها من الحالة الحالية */
      const trs = (detail && detail.transitions) || [];
      if (cur && trs.length) { const ok = new Set(trs.filter(t => t.from === cur).map(t => t.to)); return list.filter(([k]) => k === cur || ok.has(k)); }
      return list;
    },
    itypeOpts: cur => Object.entries(itype).filter(([k]) => (!(HIDDEN.issueType && HIDDEN.issueType.has(k)) && !hidden.has('it:' + k)) || k === cur),
    priorityOpts: cur => Object.entries(priority).filter(([k]) => (!(HIDDEN.priority && HIDDEN.priority.has(k)) && !hidden.has('pr:' + k)) || k === cur),
    currency: me.org.currency,
    fl: k => ((labels[k] || (st.fieldLabels || {})[k] || '') + '').trim() || FL_KEYS[k],
    secName: s => ((st.fieldSections || {})[s] || '').trim() || (s === 'main' ? 'تفاصيل أساسية' : 'حقول إضافية'),
    cfLabel: d => ((labels['cf:' + d.key] || '') + '').trim() || d.name,
    cfDefs: defs,
    cfFor: (t, section) => defs.filter(d => (!section || d.section === section) && (!d.issueTypes || !d.issueTypes.length || d.issueTypes.includes((t && t.issueType) || 'NONE'))),
    layoutFor: type => {
      const l = (((board && board.detail) || {}).typeLayouts || {})[type] || (st.typeLayouts || {})[type];
      return l ? { description: l.description || [], context: l.context || [], sections: l.sections || {} } : null;
    },
    manualRules: (st.automations || []).filter(r => r.trigger === 'MANUAL'),
    show: k => !hidden.has(k),
    order: detail.order || [],
  };
}

export const cfShort = (ctx, d, v) => {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  if (d.type === 'user') { const u = ctx.users.find(x => x.id === Number(v)); return u ? u.name : ''; }
  if (d.type === 'users') return (Array.isArray(v) ? v : []).map(id => (ctx.users.find(x => x.id === Number(id)) || {}).name).filter(Boolean).join('، ');
  if (d.type === 'checkbox') return v ? '✓' : '';
  if (d.type === 'rating') return '★'.repeat(Number(v)) + '☆'.repeat(5 - Number(v));
  if (d.type === 'percent') return v + '%';
  if (d.type === 'money') return Number(v).toLocaleString('en-US');
  return Array.isArray(v) ? v.join('، ') : String(v);
};

export const rid = p => p + Math.random().toString(36).slice(2, 10);
