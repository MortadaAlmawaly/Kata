'use client';
/* الحضور والإجازات — ترحيل React لـ viewAttendance/attEditForm (modules.js):
   تسجيل حضور/خروج، رصيد الإجازات، حالة الفريق اليوم، سجل الشهر مع تعديل الحضور، وساعات دوام الشركة. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { pad, ROLE } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, Modal } from '../../components/ui';
import { useConfirm, useToast } from '../../components/hooks';
import LeaveRequestForm from '../../components/LeaveRequestForm';
import HrExport from '../../components/HrExport';

const LSTATUS = { PENDING: 'قيد الموافقة', APPROVED: 'معتمد', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };
const ATT = { PRESENT: 'حاضر', LEFT: 'غادر', LEAVE: 'إجازة', ABSENT: 'لم يسجّل' };
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = s => { const d = new Date(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayLabel = s => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`; };
const hoursOf = r => (r.checkOut ? ((new Date(r.checkOut) - new Date(r.checkIn)) / 36e5).toFixed(1) + ' س' : '—');
const badgeFor = s => (s === 'ABSENT' ? 'TODO' : s === 'LEAVE' ? 'REVIEW' : 'DONE');

export default function AttendancePage() {
  const { me, error } = useMe();
  const t0 = todayStr();
  const [month, setMonth] = useState(t0.slice(0, 7));
  const [uid, setUid] = useState(null);
  const [today, setToday] = useState(null);
  const [lb, setLb] = useState(null);
  const [log, setLog] = useState([]);
  const [team, setTeam] = useState(null);
  const [people, setPeople] = useState([]);
  const [edit, setEdit] = useState(null);       // { userId, name, date, inT, outT }
  const [leaveForm, setLeaveForm] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();

  const perms = (me && me.perms) || [];
  const isTeam = perms.includes('attendance.team');
  const isAdmin = perms.includes('admin');
  const viewUid = uid || (me && me.user.id);
  const canEdit = isTeam && me && viewUid !== me.user.id;
  const settings = (me && me.org && me.org.settings) || {};

  const loadAll = useCallback(async () => {
    if (!me) return;
    const u = uid || me.user.id;
    try {
      const [td, bal, lg, tm] = await Promise.all([
        api('GET', '/api/attendance/today?today=' + t0),
        api('GET', '/api/leave-balance'),
        api('GET', `/api/attendance?month=${month}&userId=${u}`),
        isTeam ? api('GET', '/api/attendance/team?today=' + t0) : Promise.resolve(null),
      ]);
      setToday(td); setLb(bal); setLog(lg); setTeam(tm);
      api('GET', '/api/requests?box=mine').then(rs => setLeaves(rs.filter(r => r.type === 'LEAVE'))).catch(() => {});
    } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [me, uid, month, isTeam, t0, toast]);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!me || !isTeam) return;
    api('GET', '/api/users').then(list => setPeople(list.filter(u => u.active && (u.inScope || u.id === me.user.id)))).catch(() => {});
  }, [me, isTeam]);

  async function act(path) {
    try { await api('POST', path, { today: t0 }); loadAll(); } catch (e) { toast(e.message, 'err'); }
  }
  function delRecord(r) {
    ask({ title: 'حذف سجل الحضور', text: 'سيُحذف سجل هذا اليوم للموظف.', ok: 'حذف', onOk: async () => {
      try { await api('DELETE', `/api/attendance/${viewUid}/${r.date}`); toast('تم حذف السجل'); loadAll(); } catch (e) { toast(e.message, 'err'); }
    } });
  }

  const typesList = (lb && lb.types && lb.types.length)
    ? lb.types : (lb ? [{ key: 'annual', name: 'سنوية', entitlement: lb.entitlement, used: lb.used, remaining: lb.remaining }] : []);
  const viewName = (people.find(p => p.id === viewUid) || {}).name || (me && me.user.name) || '';

  return (
    <AppShell active="attendance" title="الحضور والإجازات" sub="حضورك ورصيد إجازاتك وحالة الفريق" me={me}>
      {error && <div className="notice">{error}</div>}
      {leaveForm && <LeaveRequestForm onClose={() => setLeaveForm(false)} onError={m => toast(m, 'err')} onSaved={() => { setLeaveForm(false); toast('أُرسل طلب الإجازة لرئيسك'); loadAll(); }} />}
      {today && lb && (
        <div className="grid two">
          <section className="card">
            <h3>اليوم — {dayLabel(t0)}</h3>
            <div className="checkin big">
              <div>
                <b>{today.checkIn ? 'حضور ' + hm(today.checkIn) : 'لم تسجّل حضورك بعد'}</b>
                {today.lateMin ? <span className="badge REJECTED" style={{ marginInlineStart: 6 }}>تأخير {today.lateMin} د</span> : null}
                {today.checkOut && (
                  <><br /><span className="muted">خروج {hm(today.checkOut)}{today.overtimeMin ? ` · إضافي ${today.overtimeMin} د` : ''}{today.earlyMin ? ` · خروج مبكر ${today.earlyMin} د` : ''}</span></>
                )}
                {today.shift && <><br /><small className="muted">دوامك: {today.shift.start} – {today.shift.end}</small></>}
              </div>
              {!today.checkIn
                ? <button className="btn" onClick={() => act('/api/attendance/check-in')}>تسجيل حضور</button>
                : !today.checkOut
                  ? <button className="btn ghost" onClick={() => act('/api/attendance/check-out')}>تسجيل خروج</button>
                  : <span className="badge DONE">اكتمل اليوم</span>}
            </div>
          </section>

          <section className="card">
            <h3>رصيد الإجازات {lb.year}</h3>
            {typesList.map(t => (
              <div className="leave-row" key={t.key}>
                <div className="lr-top"><b>{t.name}</b>
                  <span>{t.remaining == null
                    ? <><b>{t.used}</b> <span className="muted small">يوم مستخدم · غير محدود</span></>
                    : <><b>{t.remaining}</b> <span className="muted small">متبقٍّ من {t.entitlement}</span></>}</span></div>
                {t.entitlement ? <div className="bar"><i style={{ width: `${Math.min(100, Math.round(t.used / t.entitlement * 100))}%` }} /></div> : null}
              </div>
            ))}
            <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => setLeaveForm(true)}>+ طلب إجازة</button>
          </section>
        </div>
      )}

      {perms.includes('hr.export') && <HrExport toast={toast} currency={(me.org && me.org.currency) || ''} />}

      {leaves.length > 0 && (
        <>
          <h2 className="section-title">طلبات إجازتي</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الموافق</th><th /></tr></thead>
            <tbody>
              {leaves.map(r => (
                <tr key={r.id}>
                  <td>{(typesList.find(t => t.key === (r.leaveType || 'annual')) || {}).name || 'إجازة'}</td>
                  <td>{r.startDate} ← {r.endDate}</td>
                  <td><span className={`badge ${r.status}`}>{LSTATUS[r.status] || r.status}</span></td>
                  <td>{r.currentApprover ? r.currentApprover.name : '—'}</td>
                  <td>{r.status === 'PENDING' && <button type="button" className="btn sm ghost" onClick={() => ask({ title: 'إلغاء الطلب', text: 'سيتم إلغاء طلب الإجازة.', ok: 'إلغاء الطلب', onOk: async () => { try { await api('POST', `/api/requests/${r.id}/cancel`, {}); toast('تم الإلغاء'); loadAll(); } catch (e) { toast(e.message, 'err'); } } })}>إلغاء</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      {team && (
        <>
          <h2 className="section-title">فريقي اليوم</h2>
          <div className="chips-row">
            {['PRESENT', 'LEFT', 'LEAVE', 'ABSENT'].map(s => (
              <span key={s} className={`badge ${badgeFor(s)}`}>{ATT[s]}: {team.people.filter(p => p.status === s).length}</span>
            ))}
          </div>
          {team.people.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>الاسم</th><th>الحالة</th><th>الحضور</th><th>الخروج</th><th /></tr></thead>
              <tbody>
                {team.people.map(p => (
                  <tr key={p.id}>
                    <td><span className="who"><Avatar name={p.name} />{p.name}</span> <small className="muted">{ROLE[p.role]}</small></td>
                    <td><span className={`badge ${badgeFor(p.status)}`}>{ATT[p.status]}</span>{p.lateMin ? <> <span className="badge REJECTED">تأخير {p.lateMin} د</span></> : null}</td>
                    <td>{p.checkIn ? hm(p.checkIn) : '—'}</td>
                    <td>{p.checkOut ? hm(p.checkOut) : '—'}</td>
                    <td><button type="button" className="btn sm ghost"
                      onClick={() => setEdit({ userId: p.id, name: p.name, date: t0, inT: p.checkIn ? hm(p.checkIn) : '', outT: p.checkOut ? hm(p.checkOut) : '' })}>
                      {p.checkIn ? 'تعديل' : 'تسجيل حضور'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <div className="empty-box"><span className="ico"><Icon name="attendance" /></span><p>لا يوجد أشخاص تحتك.</p></div>}
        </>
      )}

      {isAdmin && <HoursCard settings={settings} onSaved={() => { toast('تم حفظ ساعات الدوام'); window.location.reload(); }} onError={m => toast(m, 'err')} />}
      {!isAdmin && me && (
        <section className="card" style={{ marginTop: 18 }}>
          <h3>ساعات دوام الشركة</h3>
          <p><b>{settings.workStart || '—'} – {settings.workEnd || '—'}</b>
            <span className="muted small"> · سماح التأخير {settings.graceMinutes ?? 10} د · يحدّدها مسؤول النظام</span></p>
        </section>
      )}

      <h2 className="section-title">سجل الحضور</h2>
      <div className="toolbar">
        <input className="input" type="month" value={month} style={{ width: 'auto' }} onChange={e => e.target.value && setMonth(e.target.value)} />
        {isTeam && people.length > 1 && (
          <select className="input" style={{ width: 'auto' }} value={viewUid || ''} onChange={e => setUid(+e.target.value)}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name} — {ROLE[p.role]}{p.id === me.user.id ? ' (أنا)' : ''}</option>)}
          </select>
        )}
        <span className="grow" /><span className="muted small">{log.length} يوم حضور</span>
        {canEdit && <button type="button" className="btn sm" onClick={() => setEdit({ userId: viewUid, name: viewName, date: '', inT: '', outT: '' })}>+ إضافة سجل يوم</button>}
      </div>
      {log.length ? (
        <>
          <div className="chips-row">
            <span className={`badge ${log.filter(r => r.lateMin).length ? 'REJECTED' : 'DONE'}`}>أيام تأخير: {log.filter(r => r.lateMin).length}</span>
            <span className="badge IN_PROGRESS">ساعات إضافي: {(log.reduce((s, r) => s + (r.overtimeMin || 0), 0) / 60).toFixed(1)}</span>
            <span className="badge TODO">خروج مبكر: {log.filter(r => r.earlyMin).length}</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>الحضور</th><th>الخروج</th><th>المدة</th><th>تأخير</th><th>خروج مبكر</th><th>إضافي</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {log.map(r => (
                <tr key={r.date}>
                  <td>{dayLabel(r.date)}</td><td>{hm(r.checkIn)}</td><td>{r.checkOut ? hm(r.checkOut) : '—'}</td><td>{hoursOf(r)}</td>
                  <td>{r.lateMin ? <span className="badge REJECTED">{r.lateMin} د</span> : <span className="muted">—</span>}</td>
                  <td>{r.earlyMin ? <span className="badge TODO">{r.earlyMin} د</span> : <span className="muted">—</span>}</td>
                  <td>{r.overtimeMin ? <span className="badge IN_PROGRESS">{r.overtimeMin} د</span> : <span className="muted">—</span>}</td>
                  {canEdit && (
                    <td className="nowrap">
                      <button type="button" className="btn sm ghost" onClick={() => setEdit({ userId: viewUid, name: viewName, date: r.date, inT: hm(r.checkIn), outT: r.checkOut ? hm(r.checkOut) : '' })}>تعديل</button>{' '}
                      <button type="button" className="btn sm danger" onClick={() => delRecord(r)}>حذف</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      ) : <div className="empty-box"><span className="ico"><Icon name="attendance" /></span><p>لا يوجد سجل لهذا الشهر.</p></div>}

      {edit && <EditModal e={edit} today={t0} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); toast('تم حفظ الحضور'); loadAll(); }} />}
      {confirmNode}
      {toastNode}
    </AppShell>
  );
}

function EditModal({ e, today, onClose, onSaved }) {
  const isNew = !e.date;
  const [date, setDate] = useState(e.date || today);
  const [inT, setInT] = useState(e.inT || '08:30');
  const [outT, setOutT] = useState(e.outT || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(ev) {
    ev.preventDefault();
    setErr('');
    if (!date) { setErr('اختر التاريخ'); return; }
    const ci = new Date(`${date}T${inT}:00`);
    const co = outT ? new Date(`${date}T${outT}:00`) : null;
    if (isNaN(ci) || (co && isNaN(co))) { setErr('الوقت غير صالح'); return; }
    if (co && co <= ci) { setErr('الخروج لازم يكون بعد الحضور'); return; }
    setBusy(true);
    try {
      await api('PUT', `/api/attendance/${e.userId}/${date}`, { checkIn: ci.toISOString(), checkOut: co ? co.toISOString() : null });
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={isNew ? 'إضافة سجل حضور' : 'تعديل حضور'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted" style={{ marginBottom: 10 }}>الموظف: <b>{e.name}</b></p>
        <div className="row2">
          <label className="field"><span>التاريخ</span>
            <input type="date" value={date} max={today} readOnly={!isNew} required onChange={x => setDate(x.target.value)} /></label>
        </div>
        <div className="row2">
          <label className="field"><span>وقت الحضور</span><input type="time" value={inT} required onChange={x => setInT(x.target.value)} /></label>
          <label className="field"><span>وقت الخروج (اختياري)</span><input type="time" value={outT} onChange={x => setOutT(x.target.value)} /></label>
        </div>
        <p className="muted small">يُسجَّل التعديل بسجل التدقيق ويصل الموظف إشعار به.</p>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function HoursCard({ settings, onSaved, onError }) {
  const [f, setF] = useState({ workStart: settings.workStart || '08:30', workEnd: settings.workEnd || '15:30', graceMinutes: settings.graceMinutes ?? 10 });
  async function submit(e) {
    e.preventDefault();
    try {
      await api('PATCH', '/api/admin/settings', { settings: { workStart: f.workStart, workEnd: f.workEnd, graceMinutes: Math.max(0, +f.graceMinutes || 0) } });
      onSaved();
    } catch (ex) { onError(ex.message); }
  }
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <h3>ساعات دوام الشركة</h3>
      <form className="row2" style={{ alignItems: 'end' }} onSubmit={submit}>
        <label className="field"><span>بداية الدوام</span><input type="time" required value={f.workStart} onChange={e => setF({ ...f, workStart: e.target.value })} /></label>
        <label className="field"><span>نهاية الدوام</span><input type="time" required value={f.workEnd} onChange={e => setF({ ...f, workEnd: e.target.value })} /></label>
        <label className="field"><span>سماح التأخير (دقائق)</span><input type="number" min="0" max="120" value={f.graceMinutes} onChange={e => setF({ ...f, graceMinutes: e.target.value })} /></label>
        <div><button className="btn">حفظ ساعات الدوام</button></div>
      </form>
      <p className="muted small" style={{ marginTop: 8 }}>تنطبق على كل الموظفين، ومن له دوام خاص (من بطاقته في الفريق) يبقى بدوامه. تُحسب منها حالات التأخير والخروج المبكر والإضافي.</p>
    </section>
  );
}
