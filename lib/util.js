/* أدوات تاريخ ونصوص مشتركة لصفحات React (مطابقة لما في public/app.js) */
import { pad } from './constants';

export { STATUS, PRIORITY, PSTATUS } from './constants';
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

export const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const fmtTime = s => { const d = new Date(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const parseYMD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDaysStr = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
export const dayLabel = s => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`; };

export function dueInfo(t) {
  if (!t.dueDate) return null;
  const diff = Math.round((new Date(t.dueDate + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 864e5);
  const done = t.status === 'DONE';
  let text, cls = '';
  if (diff === 0) { text = 'اليوم'; cls = done ? '' : 'soon'; }
  else if (diff === 1) { text = 'غداً'; cls = done ? '' : 'soon'; }
  else if (diff === -1) { text = 'أمس'; cls = done ? '' : 'late'; }
  else if (diff < 0) { text = `متأخرة ${-diff} يوم`; cls = done ? '' : 'late'; }
  else if (diff < 7) text = `بعد ${diff} أيام`;
  else text = t.dueDate;
  return { text, cls: done ? '' : cls };
}

/* يبني خريطة يوم ← عناصر من استجابة /api/calendar */
export function buildAgenda(cal, from, to) {
  const days = {};
  const push = (k, item) => { if (k >= from && k <= to) (days[k] = days[k] || []).push(item); };
  for (const e of cal.events) {
    const s = new Date(e.startAt);
    const last = new Date(Math.max(new Date(e.endAt).getTime() - 1, s.getTime()));
    const d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    for (let i = 0; i < 40 && d <= last; i++, d.setDate(d.getDate() + 1)) {
      push(ymd(d), { order: e.allDay || e.type === 'HOLIDAY' ? 0 : 1, t: s.getTime(), kind: 'event', e });
    }
  }
  for (const t of cal.tasks) push(t.date, { order: 2, t: 0, kind: 'task', task: t });
  for (const l of cal.leaves) {
    for (let k = l.startDate, i = 0; k <= l.endDate && i < 60; k = addDaysStr(k, 1), i++) push(k, { order: 0, t: 0, kind: 'leave', l });
  }
  for (const k in days) days[k].sort((a, b) => a.order - b.order || a.t - b.t);
  return days;
}
