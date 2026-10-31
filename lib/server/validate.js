const { z } = require('zod');

/* 'YYYY-MM-DD' ⇄ Date (UTC midnight — يطابق MySQL DATE) */
const toDate = s => new Date(s + 'T00:00:00.000Z');
const fromDate = d => (d ? d.toISOString().slice(0, 10) : null);

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4);
  if (y < 1900 || y > 2200) return false;
  const d = toDate(s);
  return !isNaN(d) && fromDate(d) === s;
}

const dateStr = z.string().refine(isValidDate, 'تاريخ غير صالح');
const idParam = z.coerce.number().int().positive();

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* تاريخ اليوم: نقبل تاريخ جهاز المستخدم إذا قريب من تاريخ السيرفر (فرق المناطق الزمنية) */
function today(clientValue) {
  const utc = fromDate(new Date());
  if (isValidDate(clientValue)) {
    const diff = Math.abs(Date.parse(clientValue) - Date.parse(utc)) / 864e5;
    if (diff <= 1) return clientValue;
  }
  return utc;
}

const num = v => (v == null ? null : Number(v));

module.exports = { z, toDate, fromDate, isValidDate, dateStr, idParam, httpError, today, num };
