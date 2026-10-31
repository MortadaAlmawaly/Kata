/* حزم صلاحيات اللوحة (نفس تعريف الخادم lib/server/spacePerms.js) */
export const CAPS = [
  ['view', 'رؤية اللوحة ومهامها'], ['create', 'إنشاء مهام'], ['edit', 'تعديل تفاصيل المهام'], ['move', 'نقل المهام بين الأعمدة'],
  ['assign', 'إسناد المهام'], ['comment', 'التعليق وتسجيل الساعات'], ['delete', 'حذف المهام'], ['manageBoard', 'تخصيص اللوحة (الأعمدة والشكل والحقول)'],
];
const ALL = CAPS.map(c => c[0]);
export const PRESETS = [
  { key: 'OWNER', label: 'مدير اللوحة (تحكّم كامل)', caps: ALL },
  { key: 'MANAGER', label: 'مدير قسم (يعدّل ويحرّك ويُسند)', caps: ['view', 'create', 'edit', 'move', 'assign', 'comment'] },
  { key: 'EDITOR', label: 'محرّر (ينشئ ويعدّل ويحرّك)', caps: ['view', 'create', 'edit', 'move', 'comment'] },
  { key: 'MOVER', label: 'محرّك مهام (ينقل ويعلّق)', caps: ['view', 'move', 'comment'] },
  { key: 'COMMENTER', label: 'معلّق (يعلّق فقط)', caps: ['view', 'comment'] },
  { key: 'VIEWER', label: 'مشاهد (عرض فقط)', caps: ['view'] },
  { key: 'HIDDEN', label: 'مخفي (لا يرى اللوحة)', caps: [] },
];
const LEGACY = { NONE: [], VIEW: ['view'], MOVE: ['view', 'move', 'comment'], EDIT: ['view', 'create', 'edit', 'move', 'assign', 'comment', 'delete'] };
export const capsOf = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'string') { const p = PRESETS.find(x => x.key === v); return p ? p.caps : (LEGACY[v] || null); }
  return Array.isArray(v.caps) ? v.caps.filter(c => ALL.includes(c)) : null;
};
export const presetKeyOf = v => (typeof v === 'string' && PRESETS.some(p => p.key === v) ? v : (v == null || v === '' ? '' : 'CUSTOM'));
/* مصفوفة خصائص → قيمة مخزّنة (حزمة مطابقة أو مخصّصة) */
export const valueFromCaps = caps => { const s = [...caps].sort().join(); const p = PRESETS.find(x => [...x.caps].sort().join() === s); return p ? p.key : { caps }; };
/* القالب الموصى به حسب الدور */
export const RECOMMENDED = { CEO: 'OWNER', GM: 'OWNER', DIRECTOR: 'MANAGER', MANAGER: 'MANAGER', EMPLOYEE: 'EDITOR' };