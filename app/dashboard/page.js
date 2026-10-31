'use client';
/* لوحة المتابعة — ترحيل React لـ viewDashboard (app.js). */
import { useCallback, useEffect, useState } from 'react';
import { FIcon } from '../../components/Icon';
import { api } from '../../lib/api';
import { fmtDT, LEVEL_ORDER, ROLE } from '../../lib/constants';
import { addDaysStr, buildAgenda, dayLabel, fmt, fmtTime, todayStr } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon } from '../../components/ui';
import { Bar } from '../../components/charts';
import { useToast } from '../../components/hooks';

function Kpi({ label, val, sub, cls = '', icon = 'tasks' }) {
  return (
    <div className={`card kpi ${cls}`}>
      <span className="kpi-ico"><Icon name={icon} /></span>
      <div><small>{label}</small><b>{val}</b><span className="sub">{sub}</span></div>
    </div>
  );
}

function Agenda({ days, showDates }) {
  const keys = Object.keys(days).sort();
  if (!keys.length) return <p className="muted">لا توجد مواعيد أو تسليمات قريبة.</p>;
  return keys.map(k => (
    <div key={k}>
      {showDates && <div className="ag-day">{dayLabel(k)}{k === todayStr() ? ' · اليوم' : ''}</div>}
      {days[k].map((it, i) => {
        if (it.kind === 'event') {
          const e = it.e, all = e.allDay || e.type === 'HOLIDAY';
          return (
            <a className="ag-item" key={i} href={`/calendar?event=${e.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="ag-time">{all ? 'طوال اليوم' : fmtTime(e.startAt) + ' – ' + fmtTime(e.endAt)}</span>
              <span className="ag-title">{e.title}{e.myResponse === 'PENDING' && <> <span className="badge PENDING">بانتظار ردّك</span></>}</span>
            </a>
          );
        }
        if (it.kind === 'task') {
          return (
            <a className="ag-item tk" key={i} href={`/tasks?open=${it.task.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="ag-time">تسليم</span><span className="ag-title"><FIcon n="pin" size={13} /> {it.task.title}</span>
            </a>
          );
        }
        return <div className="ag-item lv" key={i}><span className="ag-time">إجازة</span><span className="ag-title">🌴 {it.l.person.name}{it.l.mine ? ' (أنا)' : ''}</span></div>;
      })}
    </div>
  ));
}

export default function DashboardPage() {
  const { me, error } = useMe();
  const [data, setData] = useState(null);
  const [toast, toastNode] = useToast();
  const t0 = todayStr();

  const load = useCallback(async () => {
    try {
      const canTeam = me.perms.includes('team.view');
      const [d, cal, ann, att, lb, teamAtt, polSum] = await Promise.all([
        api('GET', '/api/dashboard?today=' + t0),
        api('GET', `/api/calendar?from=${t0}&to=${addDaysStr(t0, 7)}`),
        api('GET', '/api/announcements'),
        api('GET', '/api/attendance/today?today=' + t0),
        api('GET', '/api/leave-balance'),
        canTeam ? api('GET', '/api/attendance/team?today=' + t0) : Promise.resolve(null),
        api('GET', '/api/policies/summary').catch(() => ({ pending: 0 })),
      ]);
      setData({ d, cal, ann, att, lb, teamAtt, polSum });
    } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [me, t0, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function act(path) {
    try { await api('POST', path, { today: t0 }); load(); } catch (e) { toast(e.message, 'err'); }
  }

  let body = null;
  if (data && me) {
    const { d, cal, ann, att, lb, teamAtt, polSum } = data;
    const m = d.me;
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';
    const todayItems = (buildAgenda(cal, t0, t0)[t0] || []).filter(i => i.kind !== 'leave').length;
    const lead = m.overdue
      ? <>عندك <b>{m.overdue}</b> مهمة متأخرة تحتاج انتباهك{m.inbox ? <> و<b>{m.inbox}</b> طلب بانتظار موافقتك</> : null}.</>
      : m.inbox ? <>عندك <b>{m.inbox}</b> طلب بانتظار موافقتك.</>
        : m.open ? <>عندك <b>{m.open}</b> مهمة مفتوحة{todayItems ? <> و<b>{todayItems}</b> بجدول اليوم</> : null}.</> : 'كل شي مرتب — لا مهام مفتوحة.';
    const present = teamAtt ? teamAtt.people.filter(p => p.status === 'PRESENT' || p.status === 'LEFT').length : 0;
    body = (
      <>
        {polSum && polSum.pending > 0 && (
          <a className="notice" href="/policies" style={{ display: 'block', margin: '0 0 14px' }}>
            لديك <b>{polSum.pending}</b> {polSum.pending === 1 ? 'سياسة تحتاج' : 'سياسات تحتاج'} إقرارك — اضغط للاطّلاع.
          </a>
        )}
        <section className="hero">
          <h2>{hello}، {me.user.name.split(' ')[0]}</h2>
          <p>{dayLabel(t0)} · {lead}</p>
          <div className="quick">
            <a className="btn" href="/tasks?new=1"><Icon name="plus" /> مهمة جديدة</a>
            <a className="btn" href="/calendar?new=1"><Icon name="calendar" /> موعد جديد</a>
            <a className="btn" href="/requests?new=1"><Icon name="requests" /> طلب جديد</a>
            {!att.checkIn && <button type="button" onClick={() => act('/api/attendance/check-in')}><Icon name="attendance" /> تسجيل حضور</button>}
          </div>
        </section>
        <div className="grid kpis">
          <Kpi label="مهامي المفتوحة" val={m.open} sub={m.urgent ? `${m.urgent} عاجلة` : 'بدون عاجل'} cls={m.urgent ? 'warn' : ''} icon="tasks" />
          <Kpi label="متأخرة" val={m.overdue} sub="تجاوزت تاريخ التسليم" cls={m.overdue ? 'bad' : 'ok'} icon="audit" />
          <Kpi label="تقدّم أهدافي" val={m.goalProgress == null ? '—' : m.goalProgress + '%'} sub={`${m.goals} هدف جارٍ`} icon="goals" />
          <Kpi label="بانتظار موافقتي" val={m.inbox} sub={`${m.pendingRequests} من طلباتي معلّقة`} cls={m.inbox ? 'warn' : ''} icon="requests" />
          <Kpi label="رصيد إجازاتي" val={lb.remaining + ' يوم'} sub={`استخدمت ${lb.used} من ${lb.entitlement}`} icon="calendar" />
          {teamAtt && <Kpi label="حاضرون اليوم" val={`${present}/${teamAtt.people.length}`} sub={`${teamAtt.people.filter(p => p.status === 'LEAVE').length} بإجازة`} icon="attendance" />}
        </div>

        <div className="grid two">
          <section className="card">
            <h3>جدولي — الأسبوع القادم</h3>
            <Agenda days={buildAgenda(cal, t0, addDaysStr(t0, 7))} showDates />
            <a className="btn ghost sm" href="/calendar" style={{ marginTop: 10 }}>فتح التقويم</a>
          </section>
          <section className="card">
            <h3>الحضور والتعاميم</h3>
            <div className="checkin">
              <div>
                <b>{att.checkIn ? 'حضرت ' + fmtTime(att.checkIn) : 'لم تسجّل حضورك اليوم'}</b>
                {att.checkOut && <><br /><small className="muted">غادرت {fmtTime(att.checkOut)}</small></>}
              </div>
              {!att.checkIn
                ? <button className="btn sm" onClick={() => act('/api/attendance/check-in')}>تسجيل حضور</button>
                : !att.checkOut ? <button className="btn sm ghost" onClick={() => act('/api/attendance/check-out')}>تسجيل خروج</button> : null}
            </div>
            {ann.slice(0, 4).map(a => (
              <a className="ann-mini" key={a.id} href="/announcements" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                {a.pinned ? <FIcon n="pin" size={13} /> : null} <b>{a.title}</b> <small className="muted">{a.author.name} · {fmtDT(a.createdAt).slice(0, 10)}</small>
              </a>
            ))}
            {!ann.length && <p className="muted small">لا توجد تعاميم.</p>}
          </section>
        </div>

        {d.org && (
          <>
            <h2 className="section-title">نظرة الشركة</h2>
            <div className="grid kpis">
              <Kpi label="الموظفون الفعّالون" val={Object.values(d.org.headcount).reduce((a, b) => a + b, 0)}
                sub={Object.entries(d.org.headcount).sort((a, b) => LEVEL_ORDER[b[0]] - LEVEL_ORDER[a[0]]).map(([r, n]) => `${ROLE[r]} ${n}`).join(' · ')} />
              <Kpi label="مهام مفتوحة بالشركة" val={d.org.tasks.open} sub={`${d.org.tasks.overdue} متأخرة`} cls={d.org.tasks.overdue ? 'warn' : ''} />
              <Kpi label="نسبة الإنجاز (30 يوم)" val={d.org.tasks.completion == null ? '—' : d.org.tasks.completion + '%'} sub={`${d.org.tasks.done30} مكتملة`} />
              <Kpi label="معتمد هذا الشهر" val={`${fmt(d.org.approvedThisMonth.amount)} ${me.org.currency}`}
                sub={`${d.org.approvedThisMonth.count} طلب · ${d.org.pendingRequests} معلّق`} />
            </div>
          </>
        )}

        {d.team && (
          <>
            <h2 className="section-title">أداء فريقي</h2>
            {d.team.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الاسم</th><th>العدد</th><th>مفتوحة</th><th>متأخرة</th><th>للمراجعة</th><th>الإنجاز (30 يوم)</th><th>الأهداف</th></tr></thead>
                  <tbody>
                    {d.team.map(t => (
                      <tr key={t.id || t.name}>
                        <td><span className="who"><Avatar name={t.name} size={28} /><span>{t.name}<br /><small className="muted">{ROLE[t.role]}{t.title ? ' · ' + t.title : ''}</small></span></span></td>
                        <td>{t.headcount}</td><td>{t.open}</td>
                        <td>{t.overdue ? <span className="badge overdue">{t.overdue}</span> : '0'}</td><td>{t.inReview}</td>
                        <td>{t.completion == null ? <span className="muted">—</span> : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar p={t.completion} /><span className="pct">{t.completion}%</span></div>}</td>
                        <td>{t.goalProgress == null ? <span className="muted">—</span> : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar p={t.goalProgress} /><span className="pct">{t.goalProgress}%</span></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-box"><span className="ico"><Icon name="attendance" /></span><p>ما عندك أشخاص مباشرين تحتك بعد. أضفهم من «الهيكل والفريق».</p></div>}
          </>
        )}
      </>
    );
  }

  return (
    <AppShell active="dashboard" title="لوحة المتابعة" sub="ملخص يومك وأولوياتك" me={me}>
      {error && <div className="notice">{error}</div>}
      {body}
      {toastNode}
    </AppShell>
  );
}
