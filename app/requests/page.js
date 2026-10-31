'use client';
/* الطلبات والموافقات — ترحيل React لـ viewRequests/requestDetail/requestForm/decideRequest. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDT, ROLE, RTYPE } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, Modal } from '../../components/ui';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { ago, useConfirm, useToast } from '../../components/hooks';

const RSTATUS = { PENDING: 'قيد الموافقة', APPROVED: 'معتمد', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };
const RSTATUS_HERO = { PENDING: 't-REQ-PENDING', APPROVED: 't-REQ-OK', REJECTED: 't-REQ-NO', CANCELLED: 't-TASK' };
const STEP_ICON = { DONE: '✓', CURRENT: '⏳', FUTURE: '○', REJECTED: '✕' };
const fmt = n => Number(n || 0).toLocaleString('en-US');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function RequestsPage() {
  const { me, error } = useMe();
  const [box, setBox] = useState('mine');
  const [list, setList] = useState(null);
  const [form, setForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [decide, setDecide] = useState(null);   // { kind, r }
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();
  const canApprove = !!(me && me.perms.includes('requests.approve'));
  const cur = (me && me.org && me.org.currency) || '';

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/requests?box=' + box)); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [box, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (me && box !== 'mine' && !canApprove) setBox('mine'); }, [me, box, canApprove]);
  useEffect(() => {   // /requests?new=1 من لوحة المتابعة
    if (me && new URLSearchParams(window.location.search).get('new')) { setForm(true); window.history.replaceState(null, '', '/requests'); }
  }, [me]);

  const tabs = [['mine', 'طلباتي'], ...(canApprove ? [['inbox', 'بانتظار موافقتي'], ['team', 'طلبات فريقي'], ['decided', 'قرارات سابقة']] : [])];

  function cancel(r) {
    ask({ title: 'إلغاء الطلب', text: 'سيتم إلغاء الطلب.', ok: 'إلغاء الطلب', onOk: async () => {
      try { await api('POST', `/api/requests/${r.id}/cancel`, {}); toast('تم الإلغاء'); setDetailId(null); load(); } catch (e) { toast(e.message, 'err'); }
    } });
  }

  return (
    <AppShell active="requests" title="الطلبات والموافقات" sub="مصروفات ومشتريات" me={me}>
      {error && <div className="notice">{error}</div>}
      <div className="toolbar">
        <div className="seg">
          {tabs.map(([k, l]) => <button key={k} className={box === k ? 'active' : ''} onClick={() => { if (k !== box) { setList(null); setBox(k); } }}>{l}</button>)}
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => setForm(true)}>+ طلب جديد</button>
      </div>

      {list && !list.length && <div className="empty-box"><span className="ico"><Icon name="requests" /></span><p>لا توجد طلبات.</p></div>}
      {list && list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الطلب</th><th>النوع</th><th>مقدّمه</th><th>المبلغ / الفترة</th><th>الحالة</th><th>عند</th><th /></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="click" onClick={e => { if (!e.target.closest('button')) setDetailId(r.id); }}>
                  <td><b>{r.title}</b><br /><small className="muted">{fmtDT(r.createdAt)}</small></td>
                  <td>{RTYPE[r.type]}</td>
                  <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Avatar name={r.requester.name} size={24} />{r.requester.name}</span></td>
                  <td>{r.type === 'LEAVE' ? `${r.startDate} ← ${r.endDate}` : `${fmt(r.amount)} ${cur}`}</td>
                  <td><span className={`badge ${r.status}`}>{RSTATUS[r.status]}</span></td>
                  <td>{r.currentApprover ? r.currentApprover.name : <span className="muted">—</span>}</td>
                  <td>
                    {box === 'inbox' && (
                      <>
                        <button className="btn sm ok" onClick={() => setDecide({ kind: 'approve', r })}>موافقة</button>{' '}
                        <button className="btn sm danger" onClick={() => setDecide({ kind: 'reject', r })}>رفض</button>
                      </>
                    )}
                    {box === 'mine' && r.status === 'PENDING' && <button className="btn sm ghost" onClick={() => cancel(r)}>إلغاء</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && <RequestForm me={me} onClose={() => setForm(false)} onError={m => toast(m, 'err')}
        onSaved={r => { setForm(false); toast(r.status === 'APPROVED' ? 'تم الاعتماد' : 'تم تقديم الطلب'); if (box !== 'mine') setBox('mine'); else load(); }} />}
      {detailId && <RequestDetail id={detailId} me={me} onClose={() => setDetailId(null)} onError={m => toast(m, 'err')}
        onDecide={(kind, r) => { setDetailId(null); setDecide({ kind, r }); }} onCancel={cancel} />}
      {decide && <DecideModal {...decide} me={me} onClose={() => setDecide(null)}
        onDone={res => { toast(decide.kind === 'reject' ? 'تم الرفض' : res && res.status === 'PENDING' ? 'تمت الموافقة وصعد الطلب للمستوى الأعلى' : 'تم الاعتماد'); setDecide(null); load(); }} />}
      {confirmNode}
      {toastNode}
    </AppShell>
  );
}

function DecideModal({ kind, r, me, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const need = kind === 'reject' && me.org.settings && me.org.settings.requireApprovalNote;
  async function submit(e) {
    e.preventDefault();
    if (need && !note.trim()) { setErr('الملاحظة مطلوبة عند الرفض'); return; }
    setBusy(true); setErr('');
    try { onDone(await api('POST', `/api/requests/${r.id}/${kind}`, { note: note || undefined })); } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={(kind === 'approve' ? 'الموافقة على: ' : 'رفض: ') + r.title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted small" style={{ marginTop: 6 }}>{r.requester.name} · {r.type === 'LEAVE' ? RTYPE.LEAVE : `${fmt(r.amount)} ${me.org.currency}`}</p>
        <label className="field"><span>ملاحظة{need ? ' (إلزامية)' : ' (اختياري)'}</span>
          <textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></label>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className={`btn ${kind === 'reject' ? 'danger' : 'ok'}`} disabled={busy}>{kind === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RequestDetail({ id, me, onClose, onError, onDecide, onCancel }) {
  const [r, setR] = useState(null);
  const [text, setText] = useState('');
  const load = useCallback(async () => {
    try { setR(await api('GET', '/api/requests/' + id)); } catch (e) { onError(e.message); onClose(); }
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!r) return null;
  const canDecide = r.status === 'PENDING' && me.perms.includes('requests.approve') &&
    ((r.currentApprover && r.currentApprover.id === me.user.id) || me.user.role === 'CEO');
  const noteOf = new Map(r.steps.map(s => [s.approver.id, s]));
  const leaveName = r.type === 'LEAVE' ? ((me.org.settings.leaveTypes || []).find(t => t.key === (r.leaveType || 'annual')) || {}).name : null;
  async function send() {
    if (!text.trim()) return;
    try { await api('POST', `/api/requests/${id}/comments`, { body: text }); setText(''); load(); } catch (e) { onError(e.message); }
  }
  return (
    <Modal title={r.title} wide onClose={onClose}
      actions={(
        <>
          {canDecide && <button type="button" className="btn ok" onClick={() => onDecide('approve', r)}>موافقة</button>}
          {canDecide && <button type="button" className="btn danger" onClick={() => onDecide('reject', r)}>رفض</button>}
          {r.status === 'PENDING' && r.requester.id === me.user.id && <button type="button" className="btn ghost" onClick={() => onCancel(r)}>إلغاء الطلب</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div className={`modal-hero ${RSTATUS_HERO[r.status] || ''}`} style={{ borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
        <div className="chips">
          <span className="badge role">{RTYPE[r.type]}</span>
          <span className="badge role">{RSTATUS[r.status]}</span>
          {r.currentApprover && <span className="badge role">⏳ عند {r.currentApprover.name}</span>}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          {r.type === 'LEAVE' ? `${r.startDate} ← ${r.endDate}${leaveName ? ' · ' + leaveName : ''}` : `${fmt(r.amount)} ${me.org.currency}`} · {r.requester.name}
        </div>
      </div>
      {r.details && <p style={{ whiteSpace: 'pre-wrap' }}>{r.details}</p>}
      <h3 className="section-title">مسار الاعتماد</h3>
      <div className="chain">
        <div className="chain-node DONE"><span className="ci">✓</span><div><b>{r.requester.name}</b><small>قدّم الطلب · {ago(r.createdAt)}</small></div></div>
        {r.chain.map(c => {
          const st = noteOf.get(c.id);
          return (
            <div className={`chain-node ${c.state}`} key={c.id}>
              <span className="ci">{STEP_ICON[c.state]}</span>
              <div>
                <b>{c.name}</b>
                <small>{ROLE[c.role]}{c.limit != null ? ` · يعتمد حتى ${fmt(c.limit)}` : ' · بلا حد'}{c.canFinalize && c.state === 'FUTURE' ? ' · يُنهي الطلب' : ''}</small>
                {st && <small className={st.decision === 'REJECTED' ? 'no' : 'ok'}>
                  {st.decision === 'REJECTED' ? 'رفض' : st.decision === 'ESCALATED' ? 'وافق وصعد' : 'اعتمد'} · {ago(st.createdAt)}{st.note ? ' — ' + st.note : ''}
                </small>}
              </div>
            </div>
          );
        })}
        {r.status === 'APPROVED' && <div className="chain-node DONE end"><span className="ci">★</span><div><b>تم الاعتماد</b></div></div>}
        {r.status === 'REJECTED' && <div className="chain-node REJECTED end"><span className="ci">✕</span><div><b>تم الرفض</b></div></div>}
      </div>
      <FilesBlock entity="request" id={r.id} onError={onError} />
      <h3 className="section-title">النقاش ({r.comments.length})</h3>
      <div>
        {r.comments.length
          ? r.comments.map(c => (
            <div className="comment" key={c.id}>
              <b>{c.user.name}</b> <small>{ago(c.createdAt)}</small>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>))
          : <p className="muted small">لا يوجد نقاش بعد — اسأل أو وضّح قبل القرار.</p>}
      </div>
      <div className="comment-box">
        <input className="input" value={text} maxLength={1000} placeholder="اكتب تعليقاً على الطلب…"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />
        <button type="button" className="btn ghost" onClick={send}>إرسال</button>
      </div>
    </Modal>
  );
}

function RequestForm({ me, onClose, onSaved, onError }) {
  const [bal, setBal] = useState({ types: [] });
  const [f, setF] = useState({ type: 'EXPENSE', amount: '', title: '', details: '', startDate: todayStr(), endDate: todayStr(), leaveType: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  useEffect(() => { api('GET', '/api/leave-balance').then(setBal).catch(() => {}); }, []);
  const types = bal.types && bal.types.length ? bal.types : [{ key: 'annual', name: 'سنوية', remaining: bal.remaining }];
  const leave = f.type === 'LEAVE';
  const ltKey = f.leaveType || types[0].key;
  const days = f.startDate && f.endDate && f.endDate >= f.startDate ? Math.round((new Date(f.endDate) - new Date(f.startDate)) / 864e5) + 1 : 0;
  const t = types.find(x => x.key === ltKey);
  const over = t && t.remaining != null && days > t.remaining;
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const body = { type: f.type, title: f.title, details: f.details || null };
      if (leave) { body.startDate = f.startDate; body.endDate = f.endDate; body.leaveType = ltKey; } else body.amount = Number(f.amount);
      const r = await api('POST', '/api/requests', body);
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('request', r.id, files.current.files);
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved(r);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title="طلب جديد" wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="row2">
          <label className="field"><span>النوع</span>
            <select value={f.type} onChange={set('type')}>{Object.entries(RTYPE).filter(([k]) => k !== 'LEAVE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {!leave && <label className="field"><span>المبلغ ({me.org.currency})</span><input type="number" min="0" step="any" value={f.amount} onChange={set('amount')} /></label>}
          {leave && <label className="field"><span>نوع الإجازة</span>
            <select value={ltKey} onChange={set('leaveType')}>
              {types.map(x => <option key={x.key} value={x.key}>{x.name}{x.remaining != null ? ` — المتبقي ${x.remaining} يوم` : ' — غير محدود'}</option>)}
            </select></label>}
        </div>
        {leave && (
          <>
            <div className="row2">
              <label className="field"><span>من</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
              <label className="field"><span>إلى</span><input type="date" value={f.endDate} onChange={set('endDate')} /></label>
            </div>
            <p className="muted small">
              {days ? <>المدة: <b>{days}</b> يوم{over && <span style={{ color: 'var(--bad)' }}> — تتجاوز رصيدك المتبقي</span>}</> : <span style={{ color: 'var(--bad)' }}>الفترة غير صالحة</span>}
            </p>
          </>
        )}
        <label className="field"><span>العنوان</span><input value={f.title} maxLength={140} required onChange={set('title')} /></label>
        <label className="field"><span>التفاصيل / المبررات</span><textarea value={f.details} maxLength={4000} onChange={set('details')} /></label>
        <FilePicker label="مرفقات داعمة (فواتير، عروض أسعار، صور)" inputRef={files} />
        <p className="notice">يمرّ الطلب على رئيسك المباشر، ويصعد تلقائياً إذا تجاوز حدّ موافقته.</p>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>تقديم الطلب</button>
        </div>
      </form>
    </Modal>
  );
}
