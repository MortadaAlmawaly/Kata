/* حقول مخصصة للمهام (على طريقة Jira Custom Fields) — تعريفها من إعدادات الشركة وقيمها على المهمة.
   الأنواع: text · longtext · number · money · percent · rating · date · datetime · time · select · radio · multiselect · tags · user · users · checkbox · url · email · phone · color
   section: main (تفاصيل أساسية بعمود المحتوى) | side (اللوحة الجانبية). card: تظهر على بطاقة اللوحة.
   issueTypes: إن وُجدت تقصر الحقل على أنواع مهام معيّنة. */
const { httpError } = require('./validate');

const TYPES = ['text', 'longtext', 'number', 'money', 'percent', 'rating', 'date', 'datetime', 'time', 'select', 'radio', 'multiselect', 'tags', 'user', 'users', 'checkbox', 'url', 'email', 'phone', 'color'];

const defsOf = settings => (settings && Array.isArray(settings.customFields) ? settings.customFields : []);

/* ينظّف قيم الحقول القادمة من العميل: يتجاهل المجهول، null يحذف القيمة.
   userIds: مجموعة معرّفات مستخدمي الشركة الفعّالين (لنوع user). */
function cleanCustomValues(settings, input, userIds) {
  const defs = new Map(defsOf(settings).map(d => [d.key, d]));
  const out = {};
  for (const [k, raw] of Object.entries(input || {})) {
    const d = defs.get(k);
    if (!d) continue;
    if (raw === null || raw === '' || (Array.isArray(raw) && !raw.length)) { out[k] = null; continue; }
    switch (d.type) {
      case 'text': out[k] = String(raw).trim().slice(0, 300); break;
      case 'longtext': out[k] = String(raw).trim().slice(0, 4000); break;
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw httpError(400, `«${d.name}»: رقم غير صالح`);
        out[k] = n; break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw httpError(400, `«${d.name}»: تاريخ غير صالح`);
        out[k] = String(raw); break;
      case 'url': {
        const s = String(raw).trim().slice(0, 500);
        if (!/^https?:\/\/\S+$/i.test(s)) throw httpError(400, `«${d.name}»: رابط غير صالح (يبدأ بـ http أو https)`);
        out[k] = s; break;
      }
      case 'money': case 'percent': {
        const n = Number(raw);
        if (!Number.isFinite(n) || (d.type === 'percent' && (n < 0 || n > 100))) throw httpError(400, "«${d.name}»: قيمة غير صالحة");
        out[k] = n; break;
      }
      case 'rating': {
        const n = Math.round(Number(raw));
        if (!(n >= 1 && n <= 5)) throw httpError(400, "«${d.name}»: التقييم من 1 إلى 5");
        out[k] = n; break;
      }
      case 'datetime':
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(raw))) throw httpError(400, "«${d.name}»: تاريخ/وقت غير صالح");
        out[k] = String(raw); break;
      case 'time':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw))) throw httpError(400, "«${d.name}»: وقت غير صالح");
        out[k] = String(raw); break;
      case 'email': {
        const s = String(raw).trim().slice(0, 191);
        if (!/^\S+@\S+\.\S+$/.test(s)) throw httpError(400, "«${d.name}»: بريد غير صالح");
        out[k] = s; break;
      }
      case 'phone': {
        const s = String(raw).trim().slice(0, 30);
        if (!/^[+\d][\d\s\-()]{3,}$/.test(s)) throw httpError(400, "«${d.name}»: رقم هاتف غير صالح");
        out[k] = s; break;
      }
      case 'color':
        if (!/^#[0-9a-fA-F]{6}$/.test(String(raw))) throw httpError(400, "«${d.name}»: لون غير صالح");
        out[k] = String(raw); break;
      case 'tags': {
        const arr = [...new Set((Array.isArray(raw) ? raw : [raw]).map(x => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
        out[k] = arr; break;
      }
      case 'users': {
        const ids = [...new Set((Array.isArray(raw) ? raw : [raw]).map(Number))];
        if (ids.some(id => !userIds.has(id))) throw httpError(400, "«${d.name}»: مستخدم غير موجود");
        out[k] = ids; break;
      }
      case 'radio':
      case 'select':
        if (!(d.options || []).includes(String(raw))) throw httpError(400, `«${d.name}»: خيار غير موجود`);
        out[k] = String(raw); break;
      case 'multiselect': {
        const arr = (Array.isArray(raw) ? raw : [raw]).map(String);
        if (arr.some(x => !(d.options || []).includes(x))) throw httpError(400, `«${d.name}»: خيار غير موجود`);
        out[k] = [...new Set(arr)]; break;
      }
      case 'user': {
        const id = Number(raw);
        if (!userIds.has(id)) throw httpError(400, `«${d.name}»: مستخدم غير موجود`);
        out[k] = id; break;
      }
      case 'checkbox': out[k] = raw === true || raw === 'true' || raw === 1; break;
      default: break;
    }
  }
  return out;
}

/* يدمج التغييرات بالقيم الحالية (null = حذف) */
function mergeCustom(current, changes) {
  const next = { ...(current && typeof current === 'object' ? current : {}) };
  for (const [k, v] of Object.entries(changes)) { if (v === null) delete next[k]; else next[k] = v; }
  return next;
}

module.exports = { TYPES, defsOf, cleanCustomValues, mergeCustom };
