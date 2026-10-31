'use client';
/* التقويم — ترحيل React لـ viewCalendar/eventForm/eventDetail (views-pro.js، modules.js).
   ملاحظة: سحب/تمديد المواعيد داخل عرض الأسبوع لم يُرحَّل؛ السحب بين الأيام في عرض الشهر موجود. */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIcon } from '../../components/Icon';
import { api } from '../../lib/api';
import { ETYPE, pad, ROLE } from '../../lib/constants';
import { addDaysStr, buildAgenda, dayLabel, fmtTime, MONTHS, parseYMD, todayStr, WEEKDAYS, ymd } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, Modal } from '../../components/ui';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { useConfirm, useToast } from '../../components/hooks';

const RESP = { PENDING: 'لم يرد', ACCEPTED: 'قبل', DECLINED: 'اعتذر' };
const EV_RECUR = { '': 'لا يتكرر', HOURLY: 'كل عدد ساعات أحدده', DAILY: 'يومياً', WEEKLY: 'أسبوعياً', MONTHLY: 'شهرياً' };
const HOUR_H = 52, WK_START = 7, WK_END = 22;
const evKind = t => (['MEETING', 'APPOINTMENT', 'EVENT', 'HOLIDAY'].includes(t) ? t : 'OTHER');
const etLabel = e => ((e.type === 'OTHER' && e.customType) ? e.customType : ETYPE[e.type] || e.type);
const recurLabel = e => (e.recurrence === 'HOURLY' ? `كل ${e.recurEvery || 1} ساعة` : (EV_RECUR[e.recurrence] || ''));
const FILTERS = [['MEETING', 'اجتماعات'], ['APPOINTMENT', 'مواعيد'], ['EVENT', 'فعاليات'], ['HOLIDAY', 'عطل'], ['OTHER', 'نوع آخر'], ['tk', 'تسليمات'], ['lv', 'إجازات']];
const localDate = s => ymd(new Date(s));
const hmPlus = (hm, m) => { const [h, mi] = hm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + mi + m); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };

function relStart(e) {
  const now = Date.now(), s = new Date(e.startAt).getTime(), en = new Date(e.endAt).getTime();
  if (now >= s && now <= en) return 'جارٍ الآن';
  if (now > en) return 'انتهى';
  const mins = Math.round((s - now) / 60000);
  if (mins < 60) return `يبدأ بعد ${mins} دقيقة`;
  if (mins < 1440) return `يبدأ بعد ${Math.round(mins / 60)} ساعة`;
  return `يبدأ بعد ${Math.round(mins / 1440)} يوم`;
}

export default function CalendarPage() {
  return <Suspense fallback={null}><Calendar /></Suspense>;
}

function Calendar() {
  const { me, error } = useMe();
  const today = todayStr();
  const [view, setView] = useState('month');
  const [sel, setSel] = useState(today);
  const [hide, setHide] = useState(() => new Set());
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);       // { event|null, date, time }
  const [detail, setDetail] = useState(null);
  const [dayPop, setDayPop] = useState(null);
  const [toast, toastNode] = useToast();
  const dragged = useRef(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('rb-calview');
      setView(['month', 'week', 'agenda'].includes(v) ? v : (window.innerWidth < 700 ? 'agenda' : 'month'));
      setHide(new Set(JSON.parse(localStorage.getItem('rb-calhide') || '[]')));
    } catch (_) { /* لا تخزين */ }
  }, []);
  const pickView = v => { setView(v); try { localStorage.setItem('rb-calview', v); } catch (_) { /* تجاهل */ } };
  const toggleHide = k => setHide(h => {
    const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem('rb-calhide', JSON.stringify([...n])); } catch (_) { /* تجاهل */ }
    return n;
  });

  const wkStart = (me && me.org.settings && me.org.settings.weekStart) ?? 0;
  const workDays = new Set((me && me.org.settings && me.org.settings.workDays) || [0, 1, 2, 3, 4]);
  const dayNames = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(wkStart + i) % 7]);
  const weekOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - wkStart + 7) % 7));
  const selD = parseYMD(sel);

  const { from, to, title } = useMemo(() => {
    if (view === 'month') {
      const first = new Date(selD.getFullYear(), selD.getMonth(), 1), gs = weekOf(first);
      return { from: ymd(gs), to: ymd(new Date(gs.getFullYear(), gs.getMonth(), gs.getDate() + 41)), title: `${MONTHS[selD.getMonth()]} ${selD.getFullYear()}` };
    }
    if (view === 'week') {
      const ws = weekOf(selD), end = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
      return { from: ymd(ws), to: ymd(end), title: `${ws.getDate()} ${MONTHS[ws.getMonth()]} — ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}` };
    }
    return { from: sel, to: addDaysStr(sel, 30), title: `الأجندة · ${dayLabel(sel)}` };
  }, [view, sel, wkStart]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try { setData(await api('GET', `/api/calendar?from=${from}&to=${to}`)); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [from, to, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  /* روابط من لوحة المتابعة: ?new=1 أو ?event=ID */
  useEffect(() => {
    if (!me) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('new')) { setForm({ event: null, date: today }); window.history.replaceState(null, '', '/calendar'); }
    const ev = p.get('event');
    if (ev) {
      window.history.replaceState(null, '', '/calendar');
      api('GET', `/api/calendar?from=${today}&to=${addDaysStr(today, 30)}`).then(c => { const e = c.events.find(x => x.id === +ev); if (e) setDetail(e); }).catch(() => {});
    }
  }, [me]);   // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    if (!data) return {};
    return buildAgenda({
      events: data.events.filter(e => !hide.has(e.type)),
      tasks: hide.has('tk') ? [] : data.tasks,
      leaves: hide.has('lv') ? [] : data.leaves,
    }, from, to);
  }, [data, hide, from, to]);

  function step(dir) {
    const d = parseYMD(sel);
    if (view === 'month') setSel(ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    else setSel(addDaysStr(sel, dir * (view === 'week' ? 7 : 30)));
  }
  async function reschedule(e0, dd) {
    if (e0.creator.id !== me.user.id) { toast('التعديل لمن أنشأ الموعد', 'err'); return; }
    const ms = dd * 864e5;
    const baseS = new Date(e0.seriesStart || e0.startAt).getTime();
    const baseE = baseS + (new Date(e0.endAt) - new Date(e0.startAt));
    try {
      await api('PATCH', '/api/events/' + e0.id, { startAt: new Date(baseS + ms).toISOString(), endAt: new Date(baseE + ms).toISOString() });
      toast(e0.recurrence ? 'تم تعديل السلسلة المتكررة' : 'تم تعديل الموعد');
    } catch (e) { toast(e.message, 'err'); }
    load();
  }

  const openItem = it => { if (it.kind === 'event') setDetail(it.e); else if (it.kind === 'task') window.location.href = `/tasks?open=${it.task.id}`; };
  const Chip = ({ it }) => {
    if (it.kind === 'event') {
      const e = it.e;
      return (
        <span className={`chip ev-${evKind(e.type)}`} draggable={me && e.creator.id === me.user.id}
          onDragStart={ev => { dragged.current = e; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(e.id)); }}
          onClick={ev => { ev.stopPropagation(); setDetail(e); }}>
          {e.recurrence ? '🔁 ' : ''}{e.allDay || e.type === 'HOLIDAY' ? '' : fmtTime(e.startAt) + ' '}{e.title}
        </span>
      );
    }
    if (it.kind === 'task') return <span className="chip tk" onClick={ev => { ev.stopPropagation(); openItem(it); }}><FIcon n="pin" size={11} /> {it.task.title}</span>;
    return <span className="chip lv">🌴 {it.l.person.name}</span>;
  };
  const AgendaItem = ({ it }) => {
    if (it.kind === 'event') {
      const e = it.e, all = e.allDay || e.type === 'HOLIDAY';
      return (
        <div className={`ag-item ev-${evKind(e.type)}`} onClick={() => setDetail(e)} style={{ cursor: 'pointer' }}>
          <span className="ag-time">{all ? 'طوال اليوم' : fmtTime(e.startAt) + ' – ' + fmtTime(e.endAt)}</span>
          <span className="ag-title">{e.title}{e.myResponse === 'PENDING' && <> <span className="badge PENDING">بانتظار ردّك</span></>}</span>
          {e.location && <small className="muted">📍 {e.location}</small>}
        </div>
      );
    }
    if (it.kind === 'task') return <div className="ag-item tk" onClick={() => openItem(it)} style={{ cursor: 'pointer' }}><span className="ag-time">تسليم</span><span className="ag-title"><FIcon n="pin" size={13} /> {it.task.title}</span></div>;
    return <div className="ag-item lv"><span className="ag-time">إجازة</span><span className="ag-title">🌴 {it.l.person.name}{it.l.mine ? ' (أنا)' : ''}</span></div>;
  };

  function MonthView() {
    const gs = parseYMD(from);
    const cells = Array.from({ length: 42 }, (_, i) => new Date(gs.getFullYear(), gs.getMonth(), gs.getDate() + i));
    const selItems = days[sel] || [];
    return (
      <div className="cal-layout">
        <div className="cal">
          <div className="cal-head">{dayNames.map(w => <span key={w}>{w}</span>)}</div>
          <div className="cal-grid">
            {cells.map(d => {
              const k = ymd(d), items = days[k] || [];
              const hol = items.some(i => i.kind === 'event' && i.e.type === 'HOLIDAY');
              return (
                <div key={k} className={`cal-cell ${d.getMonth() !== selD.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''} ${hol ? 'hol' : ''} ${workDays.has(d.getDay()) ? '' : 'wknd'}`}
                  onClick={() => { setSel(k); if (items.length) setDayPop(k); else setForm({ event: null, date: k }); }}
                  onDragOver={ev => { ev.preventDefault(); ev.currentTarget.classList.add('dropt'); }}
                  onDragLeave={ev => ev.currentTarget.classList.remove('dropt')}
                  onDrop={ev => {
                    ev.preventDefault(); ev.currentTarget.classList.remove('dropt');
                    const e0 = dragged.current; dragged.current = null;
                    if (!e0) return;
                    const dd = Math.round((parseYMD(k) - parseYMD(localDate(e0.startAt))) / 864e5);
                    if (dd) reschedule(e0, dd);
                  }}>
                  <div className="cal-num-row"><span className="cal-num">{d.getDate()}</span></div>
                  {items.slice(0, 3).map((it, i) => <Chip key={i} it={it} />)}
                  {items.length > 3 && <span className="chip more" onClick={ev => { ev.stopPropagation(); setDayPop(k); }}>+{items.length - 3} أخرى</span>}
                  <span className={`add ${items.length ? 'has' : ''}`} role="button" aria-label="إضافة موعد" title="إضافة موعد" onClick={ev => { if (items.length) { ev.stopPropagation(); setForm({ event: null, date: k }); } }}><FIcon n="plus" size={22} /></span>
                </div>
              );
            })}
          </div>
        </div>
        <aside className="card">
          <h3>{dayLabel(sel)}{sel === today ? ' · اليوم' : ''}</h3>
          {selItems.length ? selItems.map((it, i) => <AgendaItem key={i} it={it} />) : <p className="muted">لا يوجد شيء بهذا اليوم.</p>}
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setForm({ event: null, date: sel })}>+ موعد بهذا اليوم</button>
        </aside>
      </div>
    );
  }

  function WeekView() {
    const ws = parseYMD(from);
    const cols = Array.from({ length: 7 }, (_, i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i));
    const hours = Array.from({ length: WK_END - WK_START }, (_, i) => WK_START + i);
    const nowD = new Date();
    const layout = items => {
      const out = []; let cluster = [], cEnd = 0;
      const flush = () => {
        const lanes = [];
        cluster.forEach(it => { let l = 0; while (lanes[l] !== undefined && lanes[l] > it.s) l++; lanes[l] = it.e; it.lane = l; });
        cluster.forEach(it => { it.n = lanes.length; });
        out.push(...cluster); cluster = [];
      };
      items.sort((a, b) => a.s - b.s).forEach(it => { if (cluster.length && it.s >= cEnd) { flush(); cEnd = 0; } cluster.push(it); cEnd = Math.max(cEnd, it.e); });
      if (cluster.length) flush();
      return out;
    };
    const dayData = cols.map(d => {
      const k = ymd(d), items = days[k] || [];
      const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), de = ds + 864e5;
      const timed = [], allday = [];
      items.forEach(it => {
        if (it.kind === 'event' && !it.e.allDay && it.e.type !== 'HOLIDAY') {
          const s = Math.max(new Date(it.e.startAt).getTime(), ds), e = Math.min(new Date(it.e.endAt).getTime(), de);
          timed.push({ it, s: (s - ds) / 60000, e: Math.max((e - ds) / 60000, (s - ds) / 60000 + 25) });
        } else allday.push(it);
      });
      return { d, k, timed: layout(timed), allday };
    });
    return (
      <div className="wk">
        <div className="wk-scroll-x" style={{ overflowX: 'auto' }}>
          <div className="wk-head"><div />{dayData.map(x => <div key={x.k} className={x.k === today ? 'today' : ''}>{WEEKDAYS[x.d.getDay()]}<span className="dn">{x.d.getDate()}</span></div>)}</div>
          <div className="wk-allday"><div>طوال اليوم</div>{dayData.map(x => <div key={x.k}>{x.allday.map((it, i) => <Chip key={i} it={it} />)}</div>)}</div>
          <div className="wk-scroll" ref={el => { if (el && !el.dataset.sc) { el.dataset.sc = '1'; el.scrollTop = (Math.max(8, nowD.getHours() - 1) - WK_START) * HOUR_H; } }}>
            <div className="wk-body">
              <div className="wk-hours">{hours.map(h => <div key={h}>{pad(h)}:00</div>)}</div>
              {dayData.map(x => (
                <div key={x.k} className={`wk-col ${x.k === today ? 'today' : ''} ${workDays.has(x.d.getDay()) ? '' : 'wknd'}`}
                  onClick={e => {
                    if (e.target.closest('.wk-ev')) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const mins = Math.floor((WK_START * 60 + (y / HOUR_H) * 60) / 30) * 30;
                    setForm({ event: null, date: x.k, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` });
                  }}>
                  {x.timed.map(t => {
                    const top = Math.max(0, (t.s - WK_START * 60) / 60 * HOUR_H);
                    const h = Math.max(24, (t.e - Math.max(t.s, WK_START * 60)) / 60 * HOUR_H - 2);
                    return (
                      <div key={t.it.e.id + '-' + x.k} className={`wk-ev c-${t.it.e.type}`} onClick={() => setDetail(t.it.e)}
                        style={{ top, height: h, insetInlineStart: `calc(${t.lane} * 100% / ${t.n} + 2px)`, width: `calc(100% / ${t.n} - 4px)` }}>
                        {t.it.e.recurrence ? '🔁 ' : ''}{t.it.e.title}<small>{fmtTime(t.it.e.startAt)} – {fmtTime(t.it.e.endAt)}</small>
                      </div>
                    );
                  })}
                  {x.k === today && nowD.getHours() >= WK_START && nowD.getHours() < WK_END && (
                    <div className="wk-now" style={{ top: ((nowD.getHours() * 60 + nowD.getMinutes()) - WK_START * 60) / 60 * HOUR_H }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function AgendaView() {
    const keys = Object.keys(days).sort();
    if (!keys.length) {
      return <div className="empty-box"><span className="ico"><Icon name="calendar" /></span><p>لا توجد مواعيد أو تسليمات خلال الـ 30 يوماً القادمة.</p>
        <button className="btn" onClick={() => setForm({ event: null, date: sel })}>+ موعد جديد</button></div>;
    }
    return keys.map(k => (
      <div key={k}>
        <div className={`ag-date ${k === today ? 'today' : ''}`}>{dayLabel(k)}{k === today ? ' · اليوم' : k === addDaysStr(today, 1) ? ' · غداً' : ''}</div>
        {days[k].map((it, i) => {
          if (it.kind === 'event') {
            const e = it.e, all = e.allDay || e.type === 'HOLIDAY';
            const acc = e.attendees.filter(a => a.response === 'ACCEPTED').length;
            return (
              <div className={`ag-card c-${e.type}`} key={i} onClick={() => setDetail(e)} style={{ cursor: 'pointer' }}>
                <div className="tm">{all ? 'طوال اليوم' : fmtTime(e.startAt)}<small>{all ? etLabel(e) : fmtTime(e.endAt) + ' · ' + etLabel(e)}</small></div>
                <div>
                  <div className="ti">{e.recurrence ? '🔁 ' : ''}{e.title}</div>
                  <div className="mt">
                    {e.location && <span>📍 {e.location}</span>}
                    {e.attendees.length > 1 && <span>👥 {e.attendees.length} ({acc} قبلوا)</span>}
                    {e.myResponse === 'PENDING' && <span className="badge PENDING">بانتظار ردّك</span>}
                  </div>
                </div>
              </div>
            );
          }
          if (it.kind === 'task') {
            return <div className="ag-card c-tk" key={i} onClick={() => openItem(it)} style={{ cursor: 'pointer' }}><div className="tm">تسليم<small>مهمة</small></div><div><div className="ti"><FIcon n="pin" size={13} /> {it.task.title}</div></div></div>;
          }
          return <div className="ag-card c-lv" key={i}><div className="tm">إجازة<small>{it.l.mine ? 'أنت' : 'زميل'}</small></div><div><div className="ti">🌴 {it.l.person.name}</div></div></div>;
        })}
      </div>
    ));
  }

  return (
    <AppShell active="calendar" title="التقويم والمواعيد" sub="اجتماعاتك وتسليماتك وإجازات الفريق" me={me}>
      {error && <div className="notice">{error}</div>}
      <div className="cal-top">
        <div className="seg"><button aria-label="السابق" onClick={() => step(-1)}>›</button><button onClick={() => setSel(today)}>اليوم</button><button aria-label="التالي" onClick={() => step(1)}>‹</button></div>
        <h2>{title}</h2>
        <span className="grow" style={{ flex: 1 }} />
        <div className="seg" role="group" aria-label="العرض">
          <button className={view === 'month' ? 'active' : ''} onClick={() => pickView('month')}>شهر</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => pickView('week')}>أسبوع</button>
          <button className={view === 'agenda' ? 'active' : ''} onClick={() => pickView('agenda')}>أجندة</button>
        </div>
        <button className="btn" onClick={() => setForm({ event: null, date: sel })}><Icon name="plus" /> موعد جديد</button>
      </div>
      <div className="cal-filters" style={{ marginBottom: 14 }}>
        {FILTERS.map(([k, l]) => (
          <button type="button" key={k} className={`fchip c-${evKind(k)} ${hide.has(k) ? 'off' : ''}`} onClick={() => toggleHide(k)}><i />{ETYPE[k] || l}</button>
        ))}
      </div>
      {data && (view === 'month' ? <MonthView /> : view === 'week' ? <WeekView /> : <AgendaView />)}

      {dayPop && (
        <Modal title={dayLabel(dayPop)} onClose={() => setDayPop(null)}
          actions={<button className="btn" onClick={() => { const d = dayPop; setDayPop(null); setForm({ event: null, date: d }); }}>+ موعد بهذا اليوم</button>}>
          <div className="chips" style={{ margin: '6px 0' }}><span className="badge role">{(days[dayPop] || []).length} عنصر</span></div>
          {(days[dayPop] || []).map((it, i) => <div key={i} onClick={() => { setDayPop(null); openItem(it); }}><AgendaItem it={it} /></div>)}
        </Modal>
      )}
      {form && <EventForm me={me} event={form.event} date={form.date} time={form.time} onClose={() => setForm(null)} onError={m => toast(m, 'err')}
        onSaved={(d, msg) => { setForm(null); setSel(d); toast(msg); load(); }} />}
      {detail && <EventDetail e={detail} me={me} onClose={() => setDetail(null)} onToast={toast}
        onEdit={e => { setDetail(null); setForm({ event: e, date: localDate(e.seriesStart || e.startAt) }); }}
        onChanged={() => { setDetail(null); load(); }} />}
      {toastNode}
    </AppShell>
  );
}

function EventDetail({ e, me, onClose, onEdit, onChanged, onToast }) {
  const [ask, confirmNode] = useConfirm();
  const mine = e.creator.id === me.user.id;
  const all = e.allDay || e.type === 'HOLIDAY';
  const url = e.location && /^https?:\/\//i.test(e.location) ? e.location : null;
  const acc = e.attendees.filter(a => a.response === 'ACCEPTED'), dec = e.attendees.filter(a => a.response === 'DECLINED'), pend = e.attendees.filter(a => a.response === 'PENDING');
  async function rsvp(r) {
    try { await api('POST', `/api/events/${e.id}/respond`, { response: r }); onToast('تم تسجيل ردّك'); onChanged(); } catch (ex) { onToast(ex.message, 'err'); }
  }
  return (
    <Modal title={e.title} wide onClose={onClose}
      actions={(
        <>
          {mine && <button type="button" className="btn ghost" onClick={() => onEdit(e)}>تعديل</button>}
          {(mine || me.user.role === 'CEO') && <button type="button" className="btn danger" onClick={() => ask({ title: 'حذف الموعد', text: 'سيُشعَر المدعوون بالإلغاء.', ok: 'حذف',
            onOk: async () => { await api('DELETE', '/api/events/' + e.id); onChanged(); } })}>حذف</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div className="chips" style={{ margin: '6px 0' }}>
        <span className="badge role">{etLabel(e)}</span>
        {e.recurrence && <span className="badge role">🔁 {recurLabel(e)}</span>}
        {e.companyWide && <span className="badge role">للشركة كلها</span>}
        {!all && <span className="badge role">{relStart(e)}</span>}
      </div>
      <p className="muted small">{dayLabel(localDate(e.startAt))}{all ? ' · طوال اليوم' : ` · ${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`}</p>
      <div className="facts">
        <div className="fact"><small>المكان</small><b>{e.location ? (url ? <a href={url} target="_blank" rel="noopener noreferrer">انضم للاجتماع ↗</a> : '📍 ' + e.location) : '—'}</b></div>
        <div className="fact"><small>المنظّم</small><b>{e.creator.name}</b></div>
        <div className="fact"><small>الحضور المؤكد</small><b className="big">{acc.length}<span className="muted small"> / {e.attendees.length}</span></b></div>
      </div>
      {e.description && <><h3 className="section-title">التفاصيل</h3><p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p></>}
      <FilesBlock entity="event" id={e.id} onError={m => onToast(m, 'err')} />
      {e.attendees.length > 1 && (
        <>
          <h3 className="section-title">المدعوون ({e.attendees.length})</h3>
          <div className="att-grid">
            {[...acc, ...pend, ...dec].map(a => (
              <div className="att" key={a.id}><Avatar name={a.name} size={26} />
                <div>{a.name}<small className={a.response === 'ACCEPTED' ? 'ok' : a.response === 'DECLINED' ? 'no' : 'wait'}> {RESP[a.response]}</small></div></div>
            ))}
          </div>
        </>
      )}
      {e.myResponse && !mine && (
        <>
          <h3 className="section-title">ردّك على الدعوة</h3>
          <div className="rsvp-bar">
            <button type="button" className={`btn ${e.myResponse === 'ACCEPTED' ? 'ok' : 'ghost'}`} onClick={() => rsvp('ACCEPTED')}>{e.myResponse === 'ACCEPTED' ? '✓ ستحضر' : 'سأحضر'}</button>
            <button type="button" className={`btn ${e.myResponse === 'DECLINED' ? 'danger' : 'ghost'}`} onClick={() => rsvp('DECLINED')}>{e.myResponse === 'DECLINED' ? '✕ معتذر' : 'اعتذار'}</button>
          </div>
        </>
      )}
      {confirmNode}
    </Modal>
  );
}

function EventForm({ me, event: ex, date: presetDate, time: presetTime, onClose, onSaved, onError }) {
  const canCompany = me.perms.includes('events.company');
  const baseStart = ex ? (ex.seriesStart || ex.startAt) : null;
  const baseEnd = ex ? (ex.seriesStart ? new Date(new Date(ex.seriesStart).getTime() + (new Date(ex.endAt) - new Date(ex.startAt))) : ex.endAt) : null;
  const [f, setF] = useState({
    type: ex ? ex.type : 'MEETING', title: ex ? ex.title : '', customType: ex ? ex.customType || '' : '',
    date: ex ? localDate(baseStart) : presetDate || todayStr(), location: ex ? ex.location || '' : '',
    start: ex ? fmtTime(baseStart) : presetTime || '10:00', end: ex ? fmtTime(baseEnd) : presetTime ? hmPlus(presetTime, 60) : '11:00',
    allDay: ex ? !!ex.allDay : false, recurrence: ex ? ex.recurrence || '' : '', recurUntil: ex ? ex.recurUntil || '' : '', recurEvery: ex ? ex.recurEvery || 2 : 2,
    companyWide: false, description: ex ? ex.description || '' : '',
  });
  const [dir, setDir] = useState([]);
  const [picked, setPicked] = useState(() => new Set((ex ? ex.attendees : []).map(a => a.id)));
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  useEffect(() => { api('GET', '/api/directory').then(d => setDir(d.filter(u => u.id !== me.user.id))).catch(e => onError(e.message)); }, [me.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const shown = dir.filter(u => !q.trim() || (u.name + ' ' + (u.department || '') + ' ' + (u.title || '') + ' ' + ROLE[u.role]).toLowerCase().includes(q.trim().toLowerCase()));
  const allShown = shown.length > 0 && shown.every(u => picked.has(u.id));
  const types = Object.entries(ETYPE).filter(([k]) => k !== 'OTHER' && (canCompany || k !== 'HOLIDAY'));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const s = new Date(`${f.date}T${f.allDay ? '00:00' : f.start || '00:00'}:00`);
      const en = new Date(`${f.date}T${f.allDay ? '23:59' : f.end || '00:00'}:00`);
      if (isNaN(s) || isNaN(en)) throw new Error('التاريخ أو الوقت غير صالح');
      if (en < s) throw new Error('نهاية الموعد قبل بدايته');
      const typ = ex ? ex.type : f.type;
      const custom = f.customType.trim();
      if (typ === 'OTHER' && !custom) throw new Error('اكتب اسم النوع');
      const rec = f.recurrence || null;
      const every = Math.round(Number(f.recurEvery));
      if (rec === 'HOURLY' && !(every >= 1 && every <= 168)) throw new Error('حدّد التكرار من 1 إلى 168 ساعة');
      const body = {
        title: f.title, description: f.description || null, location: f.location || null,
        startAt: s.toISOString(), endAt: en.toISOString(), allDay: f.allDay,
        recurrence: rec, recurEvery: rec === 'HOURLY' ? every : null, recurUntil: rec ? (f.recurUntil || null) : null,
        attendeeIds: [...picked],
      };
      if (typ === 'OTHER') body.customType = custom;
      setBusy(true);
      let id = ex && ex.id, warn = null;
      if (ex) await api('PATCH', '/api/events/' + id, body);
      else {
        body.type = f.type; body.companyWide = f.companyWide;
        const r = await api('POST', '/api/events', body);
        id = r.id;
        if (r.conflicts && r.conflicts.length) warn = 'تم الحفظ — تنبيه: تعارض مع مواعيد: ' + r.conflicts.join('، ');
      }
      let n = 0;
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('event', id, files.current.files);
        n = files.current.files.length - up.failed.length;
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved(f.date, warn || (n ? `تم الحفظ ورُفع ${n} ملف` : 'تم حفظ الموعد'));
    } catch (ex2) { setErr(ex2.message); setBusy(false); }
  }
  return (
    <Modal title={ex ? 'تعديل الموعد' : 'موعد جديد'} wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="row2">
          <label className="field"><span>النوع</span>
            <select value={f.type} disabled={!!ex} onChange={set('type')}>
              {types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              <option value="OTHER">＋ نوع آخر (اكتب اسمه)</option>
            </select></label>
          <label className="field"><span>العنوان</span><input value={f.title} maxLength={140} required onChange={set('title')} /></label>
        </div>
        {(ex ? ex.type : f.type) === 'OTHER' && (
          <label className="field"><span>اسم النوع</span><input value={f.customType} maxLength={40} placeholder="مثال: ورشة عمل، تدريب، مقابلة توظيف" onChange={set('customType')} /></label>
        )}
        <div className="row2">
          <label className="field"><span>التاريخ</span><input type="date" value={f.date} required onChange={set('date')} /></label>
          <label className="field"><span>المكان / رابط الاجتماع</span><input value={f.location} maxLength={140} placeholder="قاعة 2 أو رابط Meet" onChange={set('location')} /></label>
        </div>
        <div className="row2">
          <label className="field"><span>من</span><input type="time" value={f.start} onChange={set('start')} /></label>
          <label className="field"><span>إلى</span><input type="time" value={f.end} onChange={set('end')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.allDay} onChange={e => setF({ ...f, allDay: e.target.checked })} /> طوال اليوم</label>
        <div className="row2">
          <label className="field"><span>التكرار</span>
            <select value={f.recurrence} onChange={set('recurrence')}>{Object.entries(EV_RECUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field"><span>ينتهي التكرار بتاريخ (اختياري)</span><input type="date" value={f.recurUntil} onChange={set('recurUntil')} /></label>
        </div>
        {f.recurrence === 'HOURLY' && (
          <label className="field"><span>يتكرر كل كم ساعة؟ (تحدده أنت)</span>
            <input type="number" min="1" max="168" step="1" value={f.recurEvery} placeholder="مثال: 3" onChange={set('recurEvery')} />
            <small className="muted">يبدأ من وقت «من» أعلاه ويتكرر كل هذا العدد من الساعات حتى تاريخ الانتهاء (أو 250 مرة كحد أقصى).</small></label>
        )}
        {canCompany && !ex && <label className="check"><input type="checkbox" checked={f.companyWide} onChange={e => setF({ ...f, companyWide: e.target.checked })} /> يظهر لكل الشركة (فعالية / عطلة)</label>}
        <label className="field"><span>التفاصيل / جدول الأعمال</span><textarea value={f.description} maxLength={4000} onChange={set('description')} /></label>
        <FilePicker label="مرفقات (اختياري)" inputRef={files} />
        <div className="field"><span>المدعوون ({dir.length} متاح) — <b>{picked.size}</b> محدد</span>
          <div className="att-tools">
            <label className="check"><input type="checkbox" checked={allShown} onChange={e => setPicked(p => {
              const n = new Set(p); shown.forEach(u => (e.target.checked ? n.add(u.id) : n.delete(u.id))); return n; })} /> تحديد الكل</label>
            <input type="search" placeholder="ابحث بالاسم أو القسم…" aria-label="بحث في المدعوين" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="pick-list">
            {shown.map(u => (
              <label className="check" key={u.id}>
                <input type="checkbox" checked={picked.has(u.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                {u.name} <small className="muted">{ROLE[u.role]}{u.department ? ' · ' + u.department : ''}</small>
              </label>
            ))}
          </div>
        </div>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
