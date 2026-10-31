/* حزم صلاحيات اللوحة (المساحة): كل شخص/دور له حزمة جاهزة أو خصائص مخصّصة.
   الخصائص: view=رؤية اللوحة ومهامها · create=إنشاء مهام · edit=تعديل التفاصيل · move=نقل بين الأعمدة · assign=إسناد · comment=تعليق وساعات · delete=حذف مهام · manageBoard=تخصيص اللوحة وأعمدتها. */
const CAPS = ['view', 'create', 'edit', 'move', 'assign', 'comment', 'delete', 'manageBoard'];
const PRESETS = {
  OWNER: CAPS,
  MANAGER: ['view', 'create', 'edit', 'move', 'assign', 'comment'],
  EDITOR: ['view', 'create', 'edit', 'move', 'comment'],
  MOVER: ['view', 'move', 'comment'],
  COMMENTER: ['view', 'comment'],
  VIEWER: ['view'],
  HIDDEN: [],
};
/* قيم قديمة: مخفي / عرض / تحريك / تعديل */
const LEGACY = { NONE: [], VIEW: ['view'], MOVE: ['view', 'move', 'comment'], EDIT: ['view', 'create', 'edit', 'move', 'assign', 'comment', 'delete'] };

/* القيمة المخزّنة → مصفوفة خصائص (أو null = لا قاعدة) */
function capsOf(entry) {
  if (entry == null || entry === '') return null;
  if (typeof entry === 'string') return PRESETS[entry] || LEGACY[entry] || null;
  if (Array.isArray(entry.caps)) return entry.caps.filter(c => CAPS.includes(c));
  return null;
}
/* خصائص مستخدم على مساحة: صلاحية الشخص تتفوّق على دوره */
function userCaps(settings, user) {
  const p = ((settings || {}).perms) || {};
  return capsOf((p.users || {})[user.id] ?? (p.roles || {})[user.role]);
}

module.exports = { CAPS, PRESETS, LEGACY, capsOf, userCaps };