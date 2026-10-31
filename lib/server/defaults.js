/* قيم افتراضية لإعدادات الشركة. تُدمج مع Organization.settings المخزّنة. */
const DEFAULT_LIMITS = { MANAGER: 500000, DIRECTOR: 5000000, GM: 50000000 };

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Baghdad',
  weekStart: 0,                 // 0 = الأحد، 6 = السبت
  workDays: [0, 1, 2, 3, 4],    // الأحد–الخميس
  workStart: '08:30',
  workEnd: '15:30',
  leaveDefault: 30,             // أيام الإجازة السنوية لمن ينضم
  passwordMin: 8,
  sessionDays: 14,
  inviteDays: 7,                // صلاحية رابط الدعوة
  requireApprovalNote: false,   // إلزام ملاحظة عند الرفض
  labels: {},                   // مسميات مخصّصة (أدوار، حالات، أنواع، أسماء صفحات)
  graceMinutes: 10,             // سماحية التأخير بالدقائق
  taskKey: 'TSK',               // بادئة أرقام المهام التي بلا مشروع (TSK-12)
  customFields: [],             // حقول مخصصة للمهام (بلا حد): [{ key, name, type, options, section, card, issueTypes }]
  fieldLabels: {},              // مسميات حقول المهمة الثابتة التي تعيد الشركة تسميتها (المنفّذ، الأولوية…)
  fieldSections: {},            // أسماء أقسام الحقول المخصصة التي تحدّدها الشركة: { main, side }
  automations: [],              // قواعد أتمتة: [{ id, name, trigger, status, actions: [{ type, value }] }]
  customItems: {},              // عناصر مضافة لأولويات/أنواع طلبات/أنواع مواعيد/حالات مشاريع: { priority: [{key,name}], ... }
  typeLayouts: {},              // تخطيط حقول كل نوع مهمة: { TASK: { description: [...], context: [...] } }
  hiddenItems: {},              // عناصر أساسية تخفيها الشركة من القوائم: { issueType: ['BUG'], priority: ['LOW'] }
  taskStatuses: [],           // حالات مهام إضافية بلا حد للعدد: [{ key, name }] تظهر أعمدةً بعد الحالات الأساسية
  /* أنواع الإجازات: days=null غير محدود · «annual» تأخذ رصيد الموظف الخاص */
  leaveTypes: [
    { key: 'annual', name: 'سنوية', days: null, paid: true },
    { key: 'sick', name: 'مرضية', days: 15, paid: true },
    { key: 'unpaid', name: 'بدون راتب', days: null, paid: false },
  ],
};

const settingsOf = org => ({ ...DEFAULT_SETTINGS, ...((org && org.settings) || {}) });

module.exports = { DEFAULT_LIMITS, DEFAULT_SETTINGS, settingsOf };
