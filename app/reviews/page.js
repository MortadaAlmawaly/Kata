'use client';
/* التقييمات الدورية — ترحيل React لـ viewReviews/reviewDetail (views-biz.js). */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ROLE } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, MobileTabs, Modal } from '../../components/ui';
import { useToast } from '../../components/hooks';
import { FIcon } from '../../components/Icon';

const RV_STATUS = { DRAFT: 'مسودة', SUBMITTED: 'بانتظار إقرار الموظف', ACKNOWLEDGED: 'تم الإقرار' };
const RV_BADGE = { DRAFT: 'TODO', SUBMITTED: 'PENDING', ACKNOWLEDGED: 'DONE' };
const RV_CRIT = { quality: 'جودة العمل', delivery: 'الالتزام بالمواعيد', teamwork: 'العمل الجماعي', initiative: 'المبادرة', communication: 'التواصل' };
const CYC_N = ['الأول', 'الثاني', 'الثالث', 'الرابع'];

function cycleOptions() {
  const y = new Date().getFullYear(), q = Math.floor(new Date().getMonth() / 3) + 1;
  const out = [];
  for (let i = 0; i < 6; i++) { let qq = q - i, yy = y; while (qq < 1) { qq += 4; yy--; } out.push(`${yy}-Q${qq}`); }
  out.push(`${y}-H1`, `${y}-H2`, `${y}-FY`, `${y - 1}-FY`);
  return out;
}
function cycleLabel(c) {
  const m = /^(\d{4})-(?:Q([1-4])|H([12])|FY)$/.exec(c || '');
  if (!m) return c || '';
  if (m[2]) return `الربع ${CYC_N[m[2] - 1]} ${m[1]}`;
  if (m[3]) return `النصف ${CYC_N[m[3] - 1]} ${m[1]}`;
  return `سنة ${m[1]} كاملة`;
}

function Stars({ value, size = 18, onPick }) {
  return (
    <span className={onPick ? 'stars' : 'stars-ro'}>
      {[1, 2, 3, 4, 5].map(i => onPick
        ? <button type="button" key={i} className={i <= value ? 'on' : ''} onClick={() => onPick(i)}><FIcon n="star" size={26} /></button>
        : <i key={i} className={i <= value ? 'on' : ''}><FIcon n="star" size={size} /></i>)}
    </span>
  );
}

export default function ReviewsPage() {
  const { me, error } = useMe();
  const [box, setBox] = useState('mine');
  const [cycle, setCycle] = useState('');
  const [list, setList] = useState(null);
  const [form, setForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [toast, toastNode] = useToast();
  const canGive = !!(me && me.perms.includes('team.view'));

  const load = useCallback(async () => {
    try { setList(await api('GET', `/api/reviews?box=${box}${cycle ? '&cycle=' + cycle : ''}`)); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [box, cycle, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (me && !canGive && box !== 'mine') setBox('mine'); }, [me, canGive, box]);

  const tabs = [['mine', 'تقييماتي'], ...(canGive ? [['given', 'قيّمتهم أنا'], ['team', 'تقييمات فريقي']] : [])];

  return (
    <AppShell active="reviews" title="التقييمات" sub="تقييم الأداء الدوري" me={me}>
      {error && <div className="notice">{error}</div>}
      <MobileTabs label="نوع التقييمات" tabs={tabs} value={box} onPick={k => { if (k !== box) { setList(null); setBox(k); } }} />
      <div className="tabs-row m-hide-sm">
        {tabs.map(([k, l]) => <button key={k} className={`tab-pill ${box === k ? 'active' : ''}`} onClick={() => { if (k !== box) { setList(null); setBox(k); } }}>{l}</button>)}
      </div>
      <div className="toolbar">
        <select className="input" style={{ width: 'auto' }} value={cycle} onChange={e => { setList(null); setCycle(e.target.value); }}>
          <option value="">كل الفترات</option>
          {cycleOptions().map(c => <option key={c} value={c}>{cycleLabel(c)}</option>)}
        </select>
        <span className="grow" />
        {canGive && <button className="btn" onClick={() => setForm(true)}><Icon name="plus" /> تقييم جديد</button>}
      </div>
      {list && !list.length && (
        <div className="empty-box"><span className="ico"><Icon name="review" /></span><p>{box === 'mine' ? 'لا توجد تقييمات لك بعد.' : 'لا توجد تقييمات هنا.'}</p></div>
      )}
      {list && list.length > 0 && (
        <div className="goal-grid">
          {list.map(r => {
            const who = box === 'mine' ? r.reviewer : r.employee;
            return (
              <article className="card goal-card" key={r.id} onClick={() => setDetailId(r.id)}>
                <div className="top">
                  <Avatar name={who.name} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{box === 'mine' ? 'تقييم من ' + r.reviewer.name : r.employee.name}</h4>
                    <div className="owner">{cycleLabel(r.cycle)}{box !== 'mine' ? ' · المُقيِّم: ' + r.reviewer.name : ''}</div>
                  </div>
                  <span className={`badge ${RV_BADGE[r.status]}`}>{RV_STATUS[r.status]}</span>
                </div>
                <div>{r.overall ? <Stars value={r.overall} size={20} /> : <span className="muted small">لم يُحدَّد التقييم العام</span>}</div>
              </article>
            );
          })}
        </div>
      )}
      {form && <NewReview me={me} onClose={() => setForm(false)} onError={m => toast(m, 'err')}
        onCreated={r => { setForm(false); load(); setDetailId(r.id); }} />}
      {detailId && <ReviewDetail id={detailId} onClose={() => setDetailId(null)} onError={m => toast(m, 'err')}
        onChanged={msg => { if (msg) toast(msg); load(); }} onDone={msg => { toast(msg); setDetailId(null); load(); }} />}
      {toastNode}
    </AppShell>
  );
}

function NewReview({ me, onClose, onCreated, onError }) {
  const [people, setPeople] = useState(null);
  const [emp, setEmp] = useState('');
  const [cycle, setCycle] = useState(cycleOptions()[0]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('GET', '/api/users').then(us => {
      const p = us.filter(u => u.id !== me.user.id && u.active !== false);
      setPeople(p); if (p[0]) setEmp(String(p[0].id));
    }).catch(e => onError(e.message));
  }, [me.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(e) {
    e.preventDefault();
    try { onCreated(await api('POST', '/api/reviews', { employeeId: +emp, cycle })); } catch (ex) { setErr(ex.message); }
  }
  if (!people) return null;
  return (
    <Modal title="تقييم أداء جديد" onClose={onClose}>
      {!people.length ? <p className="muted">لا يوجد أشخاص تحتك لتقييمهم</p> : (
        <form onSubmit={submit} noValidate>
          <label className="field"><span>الموظف</span>
            <select value={emp} onChange={e => setEmp(e.target.value)}>{people.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>)}</select></label>
          <label className="field"><span>فترة التقييم</span>
            <select value={cycle} onChange={e => setCycle(e.target.value)}>{cycleOptions().map(c => <option key={c} value={c}>{cycleLabel(c)}</option>)}</select></label>
          <p className="muted small">تظهر لك أرقام الموظف من النظام (المهام، الالتزام، الأهداف، الحضور) داخل التقييم.</p>
          <p className="err" role="alert">{err}</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn">بدء التقييم</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ReviewDetail({ id, onClose, onError, onChanged, onDone }) {
  const [r, setR] = useState(null);
  const [f, setF] = useState(null);
  const [ack, setAck] = useState('');
  useEffect(() => {
    api('GET', '/api/reviews/' + id).then(d => {
      setR(d);
      setF({ ratings: { ...(d.ratings || {}) }, overall: d.overall || 0, strengths: d.strengths || '', improvements: d.improvements || '', nextGoals: d.nextGoals || '' });
    }).catch(e => { onError(e.message); onClose(); });
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !f) return null;
  const st = r.stats || {};
  const gather = () => ({ ratings: f.ratings, overall: f.overall || null, strengths: f.strengths || null, improvements: f.improvements || null, nextGoals: f.nextGoals || null });
  const wrap = fn => async () => { try { await fn(); } catch (e) { onError(e.message); } };
  const save = wrap(async () => { await api('PATCH', '/api/reviews/' + id, gather()); onChanged('تم حفظ المسودة'); });
  const submit = wrap(async () => { await api('PATCH', '/api/reviews/' + id, gather()); await api('POST', `/api/reviews/${id}/submit`, {}); onDone('أُرسل التقييم للموظف'); });
  const acknowledge = wrap(async () => { await api('POST', `/api/reviews/${id}/acknowledge`, { comment: ack || undefined }); onDone('تم الإقرار'); });
  const text = (label, key) => r.canEdit
    ? <label className="field"><span>{label}</span><textarea value={f[key]} maxLength={3000} onChange={e => setF({ ...f, [key]: e.target.value })} /></label>
    : (f[key] ? <><h3 className="section-title">{label}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{f[key]}</p></> : null);
  const facts = [
    ['مهام منجزة', st.tasksDone ?? 0], ['التزام بالموعد', st.onTimeRate == null ? '—' : st.onTimeRate + '%'],
    ['متأخرة مفتوحة', st.overdueOpen ?? 0], ['تقدّم الأهداف', st.goalProgress == null ? '—' : st.goalProgress + '%'],
    ['أيام حضور', st.attendanceDays ?? 0], ['أيام تأخير', st.lateDays ?? 0],
  ];
  return (
    <Modal title="تقييم أداء" wide onClose={onClose}
      actions={(
        <>
          {r.canEdit && <button type="button" className="btn ghost" onClick={save}>حفظ مسودة</button>}
          {r.canEdit && r.status === 'DRAFT' && <button type="button" className="btn" onClick={submit}>إرسال للموظف</button>}
          {r.canAcknowledge && <button type="button" className="btn ok" onClick={acknowledge}>اطّلعت وأقرّ</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div className="row" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '6px 0 10px' }}>
        <Avatar name={r.employee.name} size={52} />
        <div>
          <div className="chips"><span className="badge role">{cycleLabel(r.cycle)}</span><span className="badge role">{RV_STATUS[r.status]}</span></div>
          <h3 style={{ margin: '4px 0' }}>{r.employee.name}</h3>
          <div className="muted small">المُقيِّم: {r.reviewer.name}</div>
        </div>
      </div>
      <h3 className="section-title">أرقام الفترة من النظام</h3>
      <div className="facts">
        {facts.map(([l, v]) => <div className="fact" key={l}><small>{l}</small><b className="big">{v}</b></div>)}
      </div>
      <h3 className="section-title">المعايير</h3>
      {Object.keys(RV_CRIT).map(k => (
        <div className="rate-row" key={k}><span>{RV_CRIT[k]}</span>
          <Stars value={f.ratings[k] || 0} onPick={r.canEdit ? v => setF({ ...f, ratings: { ...f.ratings, [k]: v } }) : null} /></div>
      ))}
      <div className="rate-row overall"><span><b>التقييم العام</b></span>
        <Stars value={f.overall} size={22} onPick={r.canEdit ? v => setF({ ...f, overall: v }) : null} /></div>
      {text('نقاط القوة', 'strengths')}
      {text('نقاط التحسين', 'improvements')}
      {text('أهداف الفترة القادمة', 'nextGoals')}
      {r.employeeComment && <><h3 className="section-title">تعليق الموظف</h3><p style={{ whiteSpace: 'pre-wrap' }}>{r.employeeComment}</p></>}
      {r.canAcknowledge && (
        <>
          <h3 className="section-title">إقرارك</h3>
          <label className="field"><span>تعليقك (اختياري)</span><textarea value={ack} maxLength={1000} onChange={e => setAck(e.target.value)} /></label>
        </>
      )}
    </Modal>
  );
}
