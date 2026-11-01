/* مصفوفة الصلاحيات.
   الهرم: موظف (1) ← مدير قسم (2) ← مدير إدارة (3) ← مدير عام (4) ← مدير تنفيذي (5)

   طبقتان:
   1) «النطاق» (scope): كل شخص يرى ويدير نفسه + من تحته بالشجرة فقط — ثابت ولا يتغيّر بالإعدادات.
   2) «القدرات» (permissions): ما يقدر يسويه ضمن نطاقه. الافتراضي أدناه، ومسؤول النظام (Admin) يعدّلها:
        - لكل صلاحية: أقل دور يملكها (إعدادات الشركة)
        - أو يمنح شخصاً بعينه صلاحيات إضافية (User.extraPerms)
   صلاحيات مسؤول النظام نفسها (الإعدادات، الصلاحيات، الدعوات) مرتبطة بعلامة isAdmin وليس بالمستوى. */
const LEVEL = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3, GM: 4, CEO: 5 };
const ROLES = Object.keys(LEVEL);

const LABEL_AR = {
  EMPLOYEE: 'موظف',
  MANAGER: 'مدير قسم',
  DIRECTOR: 'مدير إدارة',
  GM: 'المدير العام',
  CEO: 'المدير التنفيذي',
};

/* الكتالوج: key → { min: الحد الأدنى الافتراضي، group, label, hint } */
const CATALOG = {
  'team.view':            { min: 2, group: 'الفريق', label: 'عرض أداء الفريق', hint: 'لوحة أداء من تحتي بلوحة المتابعة والمهام' },
  'reports.view':         { min: 2, group: 'الفريق', label: 'التقارير وتصديرها', hint: 'تقارير الأداء لمن تحتي مع تصدير CSV' },
  'attendance.team':      { min: 2, group: 'الفريق', label: 'حالة حضور الفريق', hint: 'من حضر ومن بإجازة اليوم' },
  'goals.cascade':        { min: 2, group: 'العمل', label: 'وضع أهداف لمن تحتي', hint: 'تكليف الفريق بأهداف ونتائج رئيسية' },
  'projects.manage':      { min: 2, group: 'العمل', label: 'إنشاء وإدارة المساحات', hint: '' },
  'requests.approve':     { min: 2, group: 'العمل', label: 'الموافقة على الطلبات', hint: 'ضمن حدّ المبلغ ثم تصعد للأعلى' },
  'announcements.team':   { min: 2, group: 'التواصل', label: 'نشر تعاميم للفريق', hint: '' },
  'announcements.company':{ min: 4, group: 'التواصل', label: 'تعميم على الشركة وتثبيته', hint: '' },
  'events.company':       { min: 4, group: 'التواصل', label: 'فعاليات وعطل الشركة', hint: 'تظهر بتقويم كل الموظفين' },
  'policies.manage':      { min: 4, group: 'التواصل', label: 'إدارة سياسات الشركة', hint: 'نشر السياسات والمستندات وطلب الإقرار' },
  'users.manage':         { min: 3, group: 'الإدارة', label: 'إدارة المستخدمين تحتي', hint: 'إضافة وتعديل وتعطيل وإعادة كلمة المرور' },
  'users.invite':         { min: 3, group: 'الإدارة', label: 'إرسال دعوات انضمام', hint: 'ضمن نطاقه وبدور أقل من دوره' },
  'org.view':             { min: 4, group: 'الإدارة', label: 'نظرة الشركة الكاملة', hint: 'أرقام كل المنظمة بلوحة المتابعة' },
  'audit.view':           { min: 4, group: 'الإدارة', label: 'سجل التدقيق', hint: '' },
  'tasks.create':         { min: 1, group: 'المهام', label: 'إنشاء مهام', hint: '' },
  'tasks.assign':         { min: 1, group: 'المهام', label: 'إسناد المهام لغيري (ضمن نطاقي)', hint: 'بدونها يُسند لنفسه فقط' },
  'tasks.edit':           { min: 1, group: 'المهام', label: 'تعديل تفاصيل المهام', hint: 'العنوان والوصف والحقول والتواريخ…' },
  'tasks.move':           { min: 1, group: 'المهام', label: 'نقل المهام / تغيير الحالة', hint: '' },
  'tasks.delete':         { min: 1, group: 'المهام', label: 'حذف المهام', hint: '' },
  'tasks.comment':        { min: 1, group: 'المهام', label: 'التعليق على المهام', hint: '' },
  'tasks.worklog':        { min: 1, group: 'المهام', label: 'تسجيل ساعات العمل', hint: '' },
  'tasks.attach':         { min: 1, group: 'المهام', label: 'رفع مرفقات للمهام', hint: '' },
  'hr.export':            { min: 5, group: 'الفريق', label: 'تصدير سجل الحضور والإجازات والرواتب (الموارد البشرية)', hint: 'للمدير التنفيذي ومن يمنحه الأدمن (موظف الموارد البشرية)' },
  'boards.manage':        { min: 5, group: 'الإدارة', label: 'إدارة اللوحات', hint: 'إنشاء اللوحات وتعديل أعمدتها وحقول مهامها ومسمياتها وصلاحيات الوصول وحذفها' },
};
const PERMS = Object.keys(CATALOG);
const MIN_LEVEL = Object.fromEntries(PERMS.map(p => [p, CATALOG[p].min]));

const level = role => LEVEL[role] || 0;

/* الحد الأدنى الفعلي لصلاحية بعد تعديلات الشركة */
function minLevel(orgPermissions, perm) {
  const o = orgPermissions && Number(orgPermissions[perm]);
  return o >= 1 && o <= 5 ? o : MIN_LEVEL[perm] ?? 99;
}

/* كل صلاحيات مستخدم (مجموعة): من دوره + تعديلات الشركة + الإضافات الفردية.
   مسؤول النظام يحمل أيضاً صلاحية 'admin'. */
function effectivePerms(user, org) {
  const set = new Set();
  const lvl = level(user.role);
  for (const p of PERMS) if (lvl >= minLevel(org && org.permissions, p)) set.add(p);
  if (Array.isArray(user.extraPerms)) for (const p of user.extraPerms) if (CATALOG[p]) set.add(p);
  if (user.isAdmin || user.role === 'CEO') set.add('admin');
  /* الممنوعات الفردية تُلغي ما سبق (إلا صلاحية الأدمن نفسها) */
  if (Array.isArray(user.deniedPerms)) for (const p of user.deniedPerms) if (p !== 'admin') set.delete(p);   // المدير التنفيذي والأدمن فقط يتحكّمان بإعدادات المهام وشكلها
  return set;
}

/* توافق: can(role, perm) بالقيم الافتراضية فقط */
const can = (role, perm) => level(role) >= (MIN_LEVEL[perm] ?? 99);

module.exports = { LEVEL, ROLES, LABEL_AR, CATALOG, PERMS, MIN_LEVEL, level, minLevel, effectivePerms, can };
