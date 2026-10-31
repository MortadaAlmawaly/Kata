/* قوائم قابلة للتوسيع من إعدادات الشركة (بلا حد للعدد):
   الحالات الأساسية ثابتة بالنظام، وتضيف الشركة عناصر جديدة من الإعدادات ← المسميات.
   العنصر المضاف مفتاحه نص عشوائي ثابت واسمه من اختيارها؛ يعامَل كأي عنصر عادي (غير «منتهٍ»/«إجازة»). */
const BUILTIN = {
  taskStatus: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'],
  priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  issueType: ['TASK', 'BUG', 'STORY', 'EPIC', 'SUBTASK'],
  requestType: ['EXPENSE', 'PURCHASE', 'BUDGET', 'LEAVE'],
  eventType: ['MEETING', 'APPOINTMENT', 'EVENT', 'HOLIDAY', 'OTHER'],
  projectStatus: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'DONE'],
};
/* عند حذف عنصر مضاف ترجع سجلاته لهذه القيمة حتى لا تضيع */
const FALLBACK = { taskStatus: 'TODO', priority: 'MEDIUM', issueType: 'TASK', requestType: 'EXPENSE', eventType: 'MEETING', projectStatus: 'ACTIVE' };
const CUSTOM_GROUPS = ['priority', 'issueType', 'requestType', 'eventType', 'projectStatus'];

function customOf(settings, group) {
  if (group === 'taskStatus') return (settings && settings.taskStatuses) || [];
  return ((settings && settings.customItems) || {})[group] || [];
}
const isValid = (settings, group, key) =>
  BUILTIN[group].includes(key) || customOf(settings, group).some(x => x.key === key);

module.exports = { BUILTIN, FALLBACK, CUSTOM_GROUPS, customOf, isValid };
