'use client';
/* السياسات والمستندات — ترحيل React لـ viewPolicies/policyForm/policyDetail (views-biz.js). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import AppShell, { useMe } from '../../components/AppShell';
import PageTabs, { COMPANY_TABS } from '../../components/PageTabs';
import { Avatar, Icon, Modal } from '../../components/ui';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { ago, useConfirm, useToast } from '../../components/hooks';
import { FIcon } from '../../components/Icon';

export default function PoliciesPage() {
  const { me, error } = useMe();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);       // { policy|null }
  const [detailId, setDetailId] = useState(null);
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();
  const manage = !!(me && me.perms.includes('policies.manage'));

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/policies')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  const groups = new Map();
  (list || []).forEach(p => { const k = p.category || 'عام'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  const pending = (list || []).filter(p => p.requireAck && !p.acknowledged).length;
  const cats = [...new Set((list || []).map(p => p.category).filter(Boolean))];

  function remove(p) {
    ask({ title: 'حذف السياسة', text: 'ستُحذف السياسة وإقرارات الجميع عليها.', ok: 'حذف', onOk: async () => {
      try { await api('DELETE', '/api/policies/' + p.id); toast('تم حذف السياسة'); setDetailId(null); load(); } catch (e) { toast(e.message, 'err'); }
    } });
  }
  async function openEdit(p) {
    try { setForm({ policy: await api('GET', '/api/policies/' + p.id) }); } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <AppShell active="policies" title="السياسات" sub="سياسات الشركة والإقرار بها" me={me}>
      <PageTabs items={COMPANY_TABS} active="policies" />
      {error && <div className="notice">{error}</div>}
      {pending > 0 && <div className="notice" style={{ margin: '0 0 16px' }}>لديك <b>{pending}</b> {pending === 1 ? 'سياسة تحتاج' : 'سياسات تحتاج'} إقرارك.</div>}
      <div className="toolbar">
        <span className="grow muted">سياسات الشركة وإجراءاتها ومستنداتها المرجعية.</span>
        {manage && <button className="btn" onClick={() => setForm({ policy: null })}><Icon name="plus" /> سياسة جديدة</button>}
      </div>

      {list && !list.length && (
        <div className="empty-box"><span className="ico"><Icon name="policy" /></span><p>لا توجد سياسات بعد.</p>
          {manage && <button className="btn" onClick={() => setForm({ policy: null })}>+ سياسة جديدة</button>}</div>
      )}

      {[...groups.entries()].map(([cat, arr]) => (
        <section key={cat}>
          <div className="dept-title">{cat} <span className="n">{arr.length}</span></div>
          <div className="goal-grid">
            {arr.map(p => (
              <article className="card goal-card" key={p.id} onClick={() => setDetailId(p.id)}>
                <div className="top"><span className="kpi-ico"><Icon name="policy" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><h4>{p.title}</h4><div className="owner">النسخة {p.version} · {ago(p.updatedAt)}</div></div>
                  {manage && (
                    <span className="card-acts" onClick={e => e.stopPropagation()}>
                      <button type="button" className="btn sm ghost" onClick={() => openEdit(p)}>تعديل</button>
                      <button type="button" className="btn sm danger" onClick={() => remove(p)}>حذف</button>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {p.requireAck
                    ? (p.acknowledged ? <span className="health good"><FIcon n="check" size={13} /> أقررتَ بها</span> : <span className="health warn">بانتظار إقرارك</span>)
                    : <span className="health">للاطّلاع</span>}
                  {p.ackCount != null && <span className="muted small">{p.ackCount}/{p.totalUsers} أقرّوا</span>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {form && <PolicyForm policy={form.policy} cats={cats} onClose={() => setForm(null)}
        onSaved={() => { setForm(null); toast('تم الحفظ'); load(); }} onError={m => toast(m, 'err')} />}
      {detailId && <PolicyDetail id={detailId} onClose={() => setDetailId(null)}
        onEdit={p => { setDetailId(null); setForm({ policy: p }); }} onDelete={remove}
        onAcked={() => { toast('تم تسجيل إقرارك'); setDetailId(null); load(); }} onError={m => toast(m, 'err')} />}
      {confirmNode}
      {toastNode}
    </AppShell>
  );
}

function PolicyForm({ policy: p, cats, onClose, onSaved, onError }) {
  const [f, setF] = useState({ title: p ? p.title : '', category: p ? p.category || '' : '', body: p ? p.body : '', requireAck: p ? p.requireAck : true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = { title: f.title, category: f.category || null, body: f.body, requireAck: f.requireAck };
      let id = p && p.id;
      if (p) await api('PATCH', '/api/policies/' + id, data);
      else id = (await api('POST', '/api/policies', data)).id;
      if (files.current && files.current.files.length) {
        const r = await uploadFiles('policy', id, files.current.files);
        if (r.failed.length) onError('تعذر رفع: ' + r.failed.join('، '));
      }
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={p ? 'تعديل السياسة' : 'سياسة جديدة'} wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="row2">
          <label className="field"><span>العنوان</span><input value={f.title} maxLength={140} required onChange={e => setF({ ...f, title: e.target.value })} /></label>
          <label className="field"><span>التصنيف (اكتب أي اسم)</span>
            <input list="dlCat" value={f.category} maxLength={40} placeholder="مثال: الموارد البشرية" onChange={e => setF({ ...f, category: e.target.value })} /></label>
        </div>
        <datalist id="dlCat">{cats.map(c => <option key={c} value={c} />)}</datalist>
        <label className="field"><span>النص</span>
          <textarea value={f.body} maxLength={20000} required style={{ minHeight: 200 }} onChange={e => setF({ ...f, body: e.target.value })} /></label>
        <label className="switch-row"><span><b>يتطلب إقراراً من الموظفين</b><small className="muted">تعديل النص لاحقاً يطلب إقراراً جديداً من الجميع</small></span>
          <input type="checkbox" checked={f.requireAck} onChange={e => setF({ ...f, requireAck: e.target.checked })} /></label>
        <FilePicker label={p ? 'إضافة ملفات جديدة (PDF أو صور) — الحالية من نافذة التفاصيل' : 'ملفات مرفقة (PDF أو صور)'} inputRef={files} />
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function PolicyDetail({ id, onClose, onEdit, onDelete, onAcked, onError }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    let alive = true;
    api('GET', '/api/policies/' + id).then(d => { if (alive) setP(d); }).catch(e => { onError(e.message); onClose(); });
    return () => { alive = false; };
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const done = (p.people || []).filter(x => x.at);
  async function ack() {
    try { await api('POST', `/api/policies/${id}/ack`, {}); onAcked(); } catch (e) { onError(e.message); }
  }
  return (
    <Modal title={p.title} wide onClose={onClose}
      actions={(
        <>
          {p.requireAck && !p.acknowledged && <button type="button" className="btn ok" onClick={ack}>قرأت وفهمت وأقرّ</button>}
          {p.canManage && <button type="button" className="btn ghost" onClick={() => onEdit(p)}>تعديل</button>}
          {p.canManage && <button type="button" className="btn danger" onClick={() => onDelete(p)}>حذف</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div className="chips" style={{ margin: '4px 0 12px' }}>
        <span className="badge role">{p.category || 'عام'}</span>
        <span className="badge role">النسخة {p.version}</span>
        {p.requireAck && <span className="badge role">{p.acknowledged ? <><FIcon n="check" size={13} /> أقررتَ بها</> : 'بانتظار إقرارك'}</span>}
      </div>
      <p className="muted small">{p.author.name} · آخر تحديث {ago(p.updatedAt)}</p>
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, marginTop: 10 }}>{p.body}</p>
      <FilesBlock entity="policy" id={p.id} onError={onError} />
      {p.people && (
        <>
          <h3 className="section-title">الإقرارات ({done.length}/{p.people.length})</h3>
          <div className="bar" style={{ marginBottom: 10 }}><i style={{ width: `${p.people.length ? Math.round(done.length / p.people.length * 100) : 0}%` }} /></div>
          <div className="att-grid">
            {p.people.map(x => (
              <div className="att" key={x.id}><Avatar name={x.name} size={26} />
                <div>{x.name}<small className={x.at ? 'ok' : 'wait'}> {x.at ? <><FIcon n="check" size={12} /> {ago(x.at)}</> : 'لم يُقرّ'}</small></div></div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
