'use client';
/* عروض المهام الإضافية داخل صفحة المهام: التقويم · المشاريع · الأهداف · التقارير.
   كلها خاصة بالمهام (تعمل على قائمة المهام المصفّاة نفسها)، وليست صفحات الموقع العامة. */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { PRIORITY, STATUS } from '../lib/constants';
import { addDaysStr, dayLabel, fmt, MONTHS, parseYMD, todayStr, WEEKDAYS, ymd } from '../lib/util';
import { Avatar, Icon } from './ui';
import { Bar, ChartBars, ChartLine, Ring } from './charts';
import { FIcon } from './Icon';

const STATUS_COLOR = { TODO: '#6b7a90', IN_PROGRESS: '#2f7cf6', REVIEW: '#d4a017', DONE: '#2fa56b' };
const colorOf = k => STATUS_COLOR[k] || '#8e4ec6';
const isOver = t => t.status !== 'DONE' && t.dueDate && t.dueDate < todayStr();
const dayOf = s => (s ? ymd(new Date(s)) : null);

/* ═══════════ التقويم ═══════════ */
export function TaskCalendar({ tasks, ctx, onOpen, onMove, onCreate }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(todayStr());
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState('');
  const weekStart = (ctx.me.org.settings && ctx.me.org.settings.weekStart) ?? 0;
  const workDays = new Set((ctx.me.org.settings && ctx.me.org.settings.workDays) || [0, 1, 2, 3, 4]);
  const today = todayStr();

  const byDay = useMemo(() => {
    const m = {};
    tasks.forEach(t => { if (t.dueDate) (m[t.dueDate] = m[t.dueDate] || []).push(t); });
    return m;
  }, [tasks]);
  const unscheduled = tasks.filter(t => !t.dueDate && t.status !== 'DONE');

  const weekOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - weekStart + 7) % 7));
  let days, title;
  if (mode === 'month') {
    const gs = weekOf(cur);
    days = Array.from({ length: 42 }, (_, i) => new Date(gs.getFullYear(), gs.getMonth(), gs.getDate() + i));
    title = `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`;
  } else {
    const ws = weekOf(parseYMD(anchor));
    days = Array.from({ length: 7 }, (_, i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i));
    title = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} — ${days[6].getDate()} ${MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`;
  }
  const dayNames = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7]);
  const step = dir => {
    if (mode === 'month') setCur(new Date(cur.getFullYear(), cur.getMonth() + dir, 1));
    else setAnchor(addDaysStr(anchor, dir * 7));
  };
  const goToday = () => { const d = new Date(); setCur(new Date(d.getFullYear(), d.getMonth(), 1)); setAnchor(today); };

  const Chip = ({ t }) => (
    <span className={`tcal-chip ${isOver(t) ? 'over' : ''} ${t.status === 'DONE' ? 'done' : ''}`} style={{ '--c': colorOf(t.status) }}
      draggable onDragStart={e => { setDrag(t.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(t.id)); } catch (_) { /* تجاهل */ } }}
      onDragEnd={() => { setDrag(null); setOver(''); }}
      onClick={e => { e.stopPropagation(); onOpen(t.id); }} title={`${t.key} — ${t.title}`}>
      <small>{t.key}</small> {t.title}
    </span>
  );
  const dropOn = k => e => {
    e.preventDefault(); setOver('');
    const id = drag || +e.dataTransfer.getData('text/plain'); setDrag(null);
    const t = tasks.find(x => x.id === id);
    if (t && t.dueDate !== k) onMove(id, { dueDate: k }, `نُقل موعد ${t.key} إلى ${k}`);
  };

  return (
    <div className="tcal">
      <div className="cal-top">
        <div className="seg"><button aria-label="السابق" onClick={() => step(-1)}>›</button><button onClick={goToday}>اليوم</button><button aria-label="التالي" onClick={() => step(1)}>‹</button></div>
        <h2>{title}</h2><span className="grow" style={{ flex: 1 }} />
        <div className="seg" role="group"><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>شهر</button>
          <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>أسبوع</button></div>
      </div>
      <div className="tcal-layout">
        <div className="cal">
          <div className="cal-head">{dayNames.map(w => <span key={w}>{w}</span>)}</div>
          <div className={`cal-grid ${mode === 'week' ? 'tcal-week' : ''}`}>
            {days.map(d => {
              const k = ymd(d), items = byDay[k] || [];
              const limit = mode === 'week' ? 40 : 3;
              return (
                <div key={k} className={`cal-cell ${mode === 'month' && d.getMonth() !== cur.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${workDays.has(d.getDay()) ? '' : 'wknd'} ${over === k ? 'dropt' : ''}`}
                  onDragOver={e => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver('')} onDrop={dropOn(k)}>
                  <div className="cal-num-row"><span className="cal-num">{d.getDate()}</span>
                    <button type="button" className="tcal-add" aria-label="مهمة جديدة بهذا التاريخ" onClick={() => onCreate(k)}>+</button></div>
                  {items.slice(0, limit).map(t => <Chip key={t.id} t={t} />)}
                  {items.length > limit && <span className="chip more">+{items.length - limit} أخرى</span>}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="card tcal-side">
          <h3>بدون موعد تسليم <span className="n">{unscheduled.length}</span></h3>
          <p className="muted small">اسحب مهمة إلى يوم لتحديد موعدها.</p>
          <div className="tcal-list">
            {unscheduled.map(t => <Chip key={t.id} t={t} />)}
            {!unscheduled.length && <p className="muted small">كل المهام لها مواعيد.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ═══════════ المشاريع ═══════════ */
export function TaskProjects({ tasks, onOpen, onShowInBoard, onCreate }) {
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { api('GET', '/api/projects').then(setProjects).catch(() => {}); }, []);
  const groups = useMemo(() => {
    const m = new Map();
    tasks.forEach(t => { const k = t.projectId || 0; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    const rows = [...m.entries()].map(([id, list]) => {
      const p = projects.find(x => x.id === id) || (list[0].project ? { id, name: list[0].project.name, key: list[0].project.key } : null);
      return { id, name: p ? p.name : 'بدون مساحة', key: p && p.key, status: p && p.status, list };
    });
    projects.forEach(p => { if (!m.has(p.id)) rows.push({ id: p.id, name: p.name, key: p.key, status: p.status, list: [] }); });
    return rows.sort((a, b) => (a.id === 0) - (b.id === 0) || a.name.localeCompare(b.name, 'ar'));
  }, [tasks, projects]);
  const sel = groups.find(g => g.id === open);

  return (
    <div className="tviews">
      <div className="goal-grid">
        {groups.map(g => {
          const done = g.list.filter(t => t.status === 'DONE').length, overdue = g.list.filter(isOver).length;
          const pct = g.list.length ? Math.round(done / g.list.length * 100) : 0;
          const people = [...new Map(g.list.filter(t => t.assignee).map(t => [t.assignee.id, t.assignee])).values()].slice(0, 5);
          return (
            <article className={`card goal-card ${open === g.id ? 'tv-on' : ''}`} key={g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
              <div className="top"><Ring pct={pct} size={54} stroke={6} />
                <div style={{ flex: 1, minWidth: 0 }}><h4>{g.name}</h4><div className="owner">{g.key && <b dir="ltr">{g.key}</b>} {g.list.length} مهمة</div></div></div>
              <div className="proj-stats"><span>{done}/{g.list.length} منجزة</span>
                {overdue ? <span className="badge overdue">{overdue} متأخرة</span> : <span>بدون تأخير</span>}</div>
              <div className="jf-avatars">{people.map(p => <Avatar key={p.id} name={p.name} size={26} />)}</div>
            </article>
          );
        })}
        {!groups.length && <div className="empty-box"><span className="ico"><Icon name="projects" /></span><p>لا توجد مهام لعرضها.</p></div>}
      </div>
      {sel && (
        <section className="card tv-detail">
          <div className="toolbar" style={{ margin: '0 0 8px' }}>
            <h3 style={{ margin: 0 }}>{sel.name}</h3><span className="grow" />
            {sel.id > 0 && <button className="btn ghost sm" onClick={() => onShowInBoard(sel.id)}>عرضها على اللوحة</button>}
            <button className="btn sm" onClick={() => onCreate(sel.id)}>+ مهمة</button>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>الرقم</th><th>المهمة</th><th>المنفّذ</th><th>التسليم</th><th>الحالة</th></tr></thead>
            <tbody>
              {sel.list.map(t => (
                <tr key={t.id} className={`click ${isOver(t) ? 'overdue' : ''}`} onClick={() => onOpen(t.id)}>
                  <td className="nowrap"><small className="muted key">{t.key}</small></td><td><b>{t.title}</b></td>
                  <td>{t.assignee ? <span className="who"><Avatar name={t.assignee.name} size={22} />{t.assignee.name}</span> : '—'}</td>
                  <td>{t.dueDate || <span className="muted">—</span>}</td>
                  <td><span className={`badge ${t.status}`}>{STATUS[t.status] || t.status}</span></td>
                </tr>
              ))}
              {!sel.list.length && <tr><td colSpan={5} className="muted">لا مهام بهذه المساحة بعد.</td></tr>}
            </tbody></table></div>
        </section>
      )}
    </div>
  );
}

/* ═══════════ الأهداف ═══════════ */
export function TaskGoals({ tasks, onOpen, onCreate }) {
  const [goals, setGoals] = useState([]);
  useEffect(() => { api('GET', '/api/goals').then(setGoals).catch(() => {}); }, []);
  const linked = tasks.filter(t => t.goalId);
  const free = tasks.filter(t => !t.goalId && t.status !== 'DONE');
  const rows = goals.filter(g => g.status === 'ACTIVE' || tasks.some(t => t.goalId === g.id));
  return (
    <div className="tviews">
      <div className="sum-strip">
        <div className="sum"><div><b>{rows.length}</b><small>أهداف مرتبطة بالمهام</small></div></div>
        <div className="sum"><div><b>{linked.length}</b><small>مهمة مرتبطة بهدف</small></div></div>
        <div className="sum"><div><b>{free.length}</b><small>مهام مفتوحة بلا هدف</small></div></div>
      </div>
      {rows.map(g => {
        const list = tasks.filter(t => t.goalId === g.id);
        const done = list.filter(t => t.status === 'DONE').length;
        return (
          <section className="card tv-goal" key={g.id}>
            <div className="top">
              <Ring pct={g.progress} size={52} stroke={6} />
              <div style={{ flex: 1, minWidth: 0 }}><h4 style={{ margin: 0 }}>{g.title}</h4>
                <div className="muted small">{g.owner.name} · {g.period} · {done}/{list.length} مهمة منجزة</div></div>
              {g.editable && <button className="btn ghost sm" onClick={() => onCreate(g.id)}>+ مهمة لهذا الهدف</button>}
            </div>
            {list.length > 0 && <Bar p={list.length ? Math.round(done / list.length * 100) : 0} />}
            <div className="tv-tasks">
              {list.map(t => (
                <button type="button" key={t.id} className="tv-task" onClick={() => onOpen(t.id)}>
                  <i style={{ background: colorOf(t.status) }} /> <small className="muted">{t.key}</small> <span>{t.title}</span>
                  <span className="grow" style={{ flex: 1 }} />{t.assignee && <Avatar name={t.assignee.name} size={22} />}
                </button>
              ))}
              {!list.length && <p className="muted small">لا توجد مهام مرتبطة بهذا الهدف بعد.</p>}
            </div>
          </section>
        );
      })}
      {!rows.length && <div className="empty-box"><span className="ico"><Icon name="goals" /></span><p>لا توجد أهداف مرتبطة بمهام. اربط مهمة بهدف من نموذج المهمة (حقل «مرتبطة بهدف»).</p></div>}
    </div>
  );
}

/* ═══════════ التقارير ═══════════ */
export function TaskReports({ tasks, ctx, sprints, onOpen }) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'DONE');
  const open = total - done.length;
  const overdue = tasks.filter(isOver);
  const cycle = done.filter(t => t.completedAt && t.createdAt).map(t => (new Date(t.completedAt) - new Date(t.createdAt)) / 864e5);
  const avgCycle = cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length * 10) / 10 : null;

  const countBy = (list, fn) => { const m = new Map(); list.forEach(t => { const k = fn(t); m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const statusItems = Object.entries(STATUS).map(([k, l]) => ({ label: l, value: tasks.filter(t => t.status === k).length }));
  const prioItems = Object.entries(ctx.priority).map(([k, l]) => ({ label: l, value: tasks.filter(t => t.priority === k).length }));
  const typeItems = Object.entries(ctx.itype).map(([k, l]) => ({ label: l, value: tasks.filter(t => t.issueType === k).length })).filter(x => x.value);
  void PRIORITY; void countBy;

  /* المنفّذون: مفتوحة / منجزة */
  const people = [...new Map(tasks.filter(t => t.assignee).map(t => [t.assignee.id, t.assignee])).values()];
  const perPerson = people.map(p => ({ p, open: tasks.filter(t => t.assignee && t.assignee.id === p.id && t.status !== 'DONE').length, done: tasks.filter(t => t.assignee && t.assignee.id === p.id && t.status === 'DONE').length }))
    .sort((a, b) => (b.open + b.done) - (a.open + a.done));
  const maxP = Math.max(1, ...perPerson.map(x => x.open + x.done));

  /* أنشئت مقابل أُنجزت آخر 8 أسابيع */
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(); end.setDate(end.getDate() - (7 - i) * 7 + 0); end.setHours(23, 59, 59, 999);
    const start = new Date(end.getTime() - 7 * 864e5 + 1);
    const inR = s => { if (!s) return false; const x = new Date(s); return x >= start && x <= end; };
    return { label: `${end.getMonth() + 1}/${end.getDate()}`, created: tasks.filter(t => inR(t.createdAt)).length, done: tasks.filter(t => inR(t.completedAt)).length };
  });

  /* Burndown للسباق الجاري (نقاط القصة) */
  const sprint = sprints.find(s => s.state === 'ACTIVE');
  let burn = null;
  if (sprint && sprint.startDate && sprint.endDate) {
    const st = tasks.filter(t => t.sprintId === sprint.id);
    const pts = t => (t.storyPoints == null ? 1 : t.storyPoints);
    const totalPts = st.reduce((a, t) => a + pts(t), 0);
    const n = Math.max(1, Math.round((parseYMD(sprint.endDate) - parseYMD(sprint.startDate)) / 864e5));
    const labels = [], ideal = [], actual = [];
    for (let i = 0; i <= n; i++) {
      const day = addDaysStr(sprint.startDate, i);
      labels.push(day.slice(5)); ideal.push(Math.round(totalPts * (1 - i / n) * 10) / 10);
      if (day <= todayStr()) actual.push(totalPts - st.filter(t => t.completedAt && dayOf(t.completedAt) <= day).reduce((a, t) => a + pts(t), 0));
    }
    burn = { sprint, labels, ideal, actual, totalPts };
  }

  const Kpi = ({ l, v, sub, cls = '' }) => <div className={`card kpi ${cls}`}><div><small>{l}</small><b>{v}</b><span className="sub">{sub}</span></div></div>;
  return (
    <div className="tviews">
      <div className="grid kpis">
        <Kpi l="إجمالي المهام" v={fmt(total)} sub={`${open} مفتوحة`} />
        <Kpi l="منجزة" v={done.length} sub={total ? `${Math.round(done.length / total * 100)}% من الكل` : '—'} cls="ok" />
        <Kpi l="متأخرة" v={overdue.length} sub="تجاوزت التسليم" cls={overdue.length ? 'bad' : 'ok'} />
        <Kpi l="متوسط زمن الإنجاز" v={avgCycle == null ? '—' : `${avgCycle} يوم`} sub="من الإنشاء للإكمال" />
      </div>

      <div className="grid two">
        <section className="card"><h3>توزيع الحالات</h3><ChartBars items={statusItems} color="var(--accent)" w={420} h={200} /></section>
        <section className="card"><h3>أنشئت مقابل أُنجزت (8 أسابيع)</h3>
          <ChartLine points={weeks.map(w => w.label)} series={[
            { name: 'أُنجزت', values: weeks.map(w => w.done), color: 'var(--ok)', area: true },
            { name: 'أُنشئت', values: weeks.map(w => w.created), color: 'var(--accent-text, var(--accent))' }]} w={420} h={200} /></section>
      </div>

      <div className="grid two">
        <section className="card"><h3>حمل العمل حسب المنفّذ</h3>
          {perPerson.length ? perPerson.map(x => (
            <div className="hbar" key={x.p.id}><span><Avatar name={x.p.name} size={20} /> {x.p.name}</span>
              <div className="bar tv-stack"><i style={{ width: `${x.done / maxP * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${x.open / maxP * 100}%`, background: 'var(--accent)' }} /></div>
              <b>{x.open}/{x.open + x.done}</b></div>
          )) : <p className="muted">لا توجد بيانات.</p>}
          <small className="muted">الأخضر منجزة · الأزرق مفتوحة</small></section>
        <section className="card"><h3>الأولويات والأنواع</h3>
          <ChartBars items={prioItems} color="var(--violet,#8e4ec6)" w={420} h={160} />
          <div className="chips-row" style={{ marginTop: 8 }}>{typeItems.map(x => <span className="badge role" key={x.label}>{x.label} {x.value}</span>)}</div></section>
      </div>

      <section className="card">
        <h3>{burn ? `Burndown — ${burn.sprint.name}` : 'Burndown السباق الجاري'}</h3>
        {burn ? (
          <>
            <ChartLine points={burn.labels} series={[
              { name: 'المثالي', values: burn.ideal, color: 'var(--muted,#8b97ad)' },
              { name: 'الفعلي', values: burn.actual, color: 'var(--accent-text, var(--accent))', area: true }]} w={760} h={240} />
            <small className="muted">الإجمالي {burn.totalPts} نقطة (المهمة بلا نقاط تُحسب بنقطة واحدة).</small>
          </>
        ) : <p className="muted">لا يوجد سباق جارٍ بتاريخي بداية ونهاية. أنشئ سباقاً وابدأه من تبويب Backlog.</p>}
      </section>

      <section className="card">
        <h3>المهام المتأخرة <span className="n">{overdue.length}</span></h3>
        {overdue.slice(0, 12).map(t => (
          <button type="button" className="tv-task" key={t.id} onClick={() => onOpen(t.id)}>
            <i style={{ background: '#e5484d' }} /> <small className="muted">{t.key}</small> <span>{t.title}</span>
            <span className="grow" style={{ flex: 1 }} /><small className="due late">{dayLabel(t.dueDate)}</small>{t.assignee && <Avatar name={t.assignee.name} size={22} />}
          </button>
        ))}
        {!overdue.length && <p className="muted">لا توجد مهام متأخرة</p>}
      </section>
    </div>
  );
}
