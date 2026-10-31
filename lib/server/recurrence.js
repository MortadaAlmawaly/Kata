/* توسيع المواعيد المتكررة (كل N ساعة / يومي / أسبوعي / شهري) إلى مرّات داخل نطاق زمني.
   الموعد المتكرر يُخزَّن مرة واحدة (الأصل) وتُولَّد مرّاته وقت القراءة. */
const MAX_OCC = 250;
const MAX_STEPS = 6000;

function step(d, rule, anchorDay, everyH) {
  const x = new Date(d.getTime());
  if (rule === 'HOURLY') x.setTime(x.getTime() + Math.max(1, everyH || 1) * 36e5);
  else if (rule === 'DAILY') x.setUTCDate(x.getUTCDate() + 1);
  else if (rule === 'WEEKLY') x.setUTCDate(x.getUTCDate() + 7);
  else { /* شهري: نفس يوم الشهر الأصلي (أو آخر يوم إذا الشهر أقصر) */
    x.setUTCDate(1);
    x.setUTCMonth(x.getUTCMonth() + 1);
    const dim = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
    x.setUTCDate(Math.min(anchorDay, dim));
  }
  return x;
}

/* يرجع [{startAt, endAt, occ}] للمرّات التي تتقاطع مع [from, to) */
function occurrences(ev, from, to) {
  const dur = ev.endAt.getTime() - ev.startAt.getTime();
  if (!ev.recurrence) {
    return ev.startAt < to && ev.endAt >= from ? [{ startAt: ev.startAt, endAt: ev.endAt, occ: false }] : [];
  }
  const until = ev.recurUntil ? new Date(ev.recurUntil.getTime() + 864e5 - 1) : null;
  const anchorDay = ev.startAt.getUTCDate();
  const out = [];
  let cur = new Date(ev.startAt.getTime());
  let i0 = 0;
  if (ev.recurrence === 'HOURLY') { /* قفزة سريعة إلى أول مرّة تتقاطع مع النطاق */
    const ivl = Math.max(1, ev.recurEvery || 1) * 36e5;
    i0 = Math.max(0, Math.floor((from.getTime() - dur - cur.getTime()) / ivl));
    cur = new Date(cur.getTime() + i0 * ivl);
  }
  for (let i = i0; i < i0 + MAX_STEPS && cur < to && out.length < MAX_OCC; i++) {
    if (until && cur > until) break;
    if (cur.getTime() + dur >= from.getTime()) {
      out.push({ startAt: new Date(cur.getTime()), endAt: new Date(cur.getTime() + dur), occ: i > 0 });
    }
    cur = step(cur, ev.recurrence, anchorDay, ev.recurEvery);
  }
  return out;
}

module.exports = { occurrences };
