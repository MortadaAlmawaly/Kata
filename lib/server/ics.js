/* اشتراك التقويم (ICS): رابط خاص بالمستخدم بتوكن سرّي يُضاف لـ Google Calendar / Apple / Outlook.
   لا يحتاج تسجيل دخول (التطبيقات الخارجية لا ترسل الكوكي) — لذلك التوكن عشوائي طويل ويمكن تجديده.
   يتضمن: مواعيدي ومواعيد الشركة (مع التكرار) + تسليمات مهامي المفتوحة. */
const express = require('./express');
const prisma = require('./db');

const router = express.Router();

const pad = n => String(n).padStart(2, '0');
const utc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const day = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/* طيّ الأسطر الطويلة (75 بايت تقريباً) كما يشترط المعيار */
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 73) {
    let cut = 70;
    while (Buffer.byteLength(rest.slice(0, cut)) > 73) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

router.get('/cal/:token.ics', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { icsToken: req.params.token }, include: { org: { select: { name: true, suspended: true } } } });
  if (!user || !user.active || user.org.suspended) return res.status(404).end();

  const since = new Date(Date.now() - 60 * 864e5);
  const [events, tasks] = await Promise.all([
    prisma.event.findMany({
      where: {
        orgId: user.orgId,
        OR: [{ companyWide: true }, { creatorId: user.id }, { attendees: { some: { userId: user.id } } }],
        AND: [{ OR: [{ endAt: { gte: since } }, { recurrence: { not: null } }] }],
      },
      take: 1000, orderBy: { startAt: 'asc' },
    }),
    prisma.task.findMany({
      where: { orgId: user.orgId, assigneeId: user.id, status: { not: 'DONE' }, dueDate: { not: null } },
      select: { id: true, title: true, dueDate: true }, take: 500,
    }),
  ]);

  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kata//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc('كاتا — ' + user.org.name)}`, 'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = utc(new Date());
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:ev-${e.id}@routini`, `DTSTAMP:${stamp}`);
    if (e.allDay || e.type === 'HOLIDAY') {
      L.push(`DTSTART;VALUE=DATE:${day(e.startAt)}`, `DTEND;VALUE=DATE:${day(new Date(e.endAt.getTime() + 864e5))}`);
    } else {
      L.push(`DTSTART:${utc(e.startAt)}`, `DTEND:${utc(e.endAt)}`);
    }
    if (e.recurrence) {
      L.push(`RRULE:FREQ=${e.recurrence}${e.recurrence === 'HOURLY' ? ';INTERVAL=' + Math.max(1, e.recurEvery || 1) : ''}${e.recurUntil ? ';UNTIL=' + day(e.recurUntil) + 'T235959Z' : ''}`);
    }
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    if (e.description) L.push(`DESCRIPTION:${esc(e.description)}`);
    L.push('END:VEVENT');
  }
  for (const t of tasks) {
    L.push('BEGIN:VEVENT', `UID:task-${t.id}@routini`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(t.dueDate)}`, `DTEND;VALUE=DATE:${day(new Date(t.dueDate.getTime() + 864e5))}`,
      `SUMMARY:${esc('تسليم: ' + t.title)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');

  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  res.send(L.map(fold).join('\r\n') + '\r\n');
});

module.exports = router;
