'use client';
/* الشركات (المنصة) — ترحيل React لـ viewPlatform في public/settings.js.
   لمالك المنصة فقط (PLATFORM_ADMINS): إضافة شركة، حدّ المستخدمين، إيقاف/تفعيل، آخر دخول للمدير. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDT } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Icon, Modal } from '../../components/ui';

export default function PlatformPage() {
  const { me, error } = useMe();
  const [list, setList] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [modal, setModal] = useState(null);   // { kind: 'new' | 'limit' | 'secret', ... }
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/platform/orgs')); setLoadErr(''); }
    catch (e) { if (e.message !== 'unauthorized') setLoadErr(e.message); }
  }, []);
  useEffect(() => { if (me && me.platformAdmin) load(); }, [me, load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  async function setSuspended(o, suspended) {
    try { await api('PATCH', '/api/platform/orgs/' + o.id, { suspended }); load(); }
    catch (e) { setToast(e.message); }
  }

  const total = list ? list.reduce((s, o) => s + (o.activeUsers ?? o.users), 0) : 0;
  return (
    <AppShell active="platform" title="الشركات (المنصة)" sub="إدارة الشركات المشتركة" me={me}>
      {error && <div className="empty-box"><p>{error}</p></div>}
      {me && !me.platformAdmin && (
        <div className="empty-box"><span className="ico"><Icon name="audit" /></span><p>هذه الصفحة لمالك المنصة فقط.</p></div>
      )}
      {loadErr && <div className="notice">{loadErr}</div>}

      {me && me.platformAdmin && list && (
        <>
          <div className="grid kpis">
            <div className="card kpi"><small>الشركات</small><b>{list.length}</b></div>
            <div className="card kpi"><small>إجمالي المستخدمين الفعّالين</small><b>{total}</b></div>
            <div className="card kpi"><small>الموقوفة</small><b>{list.filter(o => o.suspended).length}</b></div>
          </div>

          <div className="toolbar">
            <span className="grow muted">الشركات المسجّلة على منصتك، وعدد المستخدمين الفعّالين مقابل الحد المسموح لكل شركة.</span>
            <button className="btn" onClick={() => setModal({ kind: 'new' })}><Icon name="plus" /> شركة جديدة</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>الشركة</th><th>المستخدمون الفعّالون</th><th>المهام</th><th>أُنشئت</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {list.map(o => {
                  const act = o.activeUsers ?? o.users;
                  const full = o.maxUsers != null && act >= o.maxUsers;
                  return (
                    <tr key={o.id}>
                      <td>
                        <b>{o.name}</b>
                        {o.ceo && (
                          <><br /><small className="muted">
                            {o.ceo.name} · <span dir="ltr">{o.ceo.email}</span> · {o.ceo.lastLoginAt ? 'آخر دخول ' + fmtDT(o.ceo.lastLoginAt).slice(0, 10) : <span className="warn-text">لم يدخل بعد</span>}
                          </small></>
                        )}
                      </td>
                      <td>
                        {full
                          ? <span className="badge REJECTED">{act} / {o.maxUsers}</span>
                          : <><b>{act}</b>{o.maxUsers != null ? ` / ${o.maxUsers}` : <> <span className="muted small">بلا حد</span></>}</>}
                      </td>
                      <td>{o.tasks}</td>
                      <td>{fmtDT(o.createdAt).slice(0, 10)}</td>
                      <td>{o.suspended ? <span className="badge REJECTED">موقوفة</span> : <span className="badge DONE">فعّالة</span>}</td>
                      <td className="nowrap">
                        <button className="btn sm ghost" onClick={() => setModal({ kind: 'limit', org: o, act })}>عدد المستخدمين</button>{' '}
                        {o.id === (me.org && me.org.id)
                          ? <span className="muted small">شركتك</span>
                          : <button className={`btn sm ${o.suspended ? 'ok' : 'danger'}`} onClick={() => setSuspended(o, !o.suspended)}>{o.suspended ? 'تفعيل' : 'إيقاف'}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && modal.kind === 'new' && (
        <NewOrgModal onClose={() => setModal(null)} onDone={r => { setModal({ kind: 'secret', password: r.tempPassword }); load(); }} />
      )}
      {modal && modal.kind === 'limit' && (
        <LimitModal org={modal.org} act={modal.act} onClose={() => setModal(null)} onDone={() => { setModal(null); setToast('تم حفظ الحد'); load(); }} />
      )}
      {modal && modal.kind === 'secret' && (
        <Modal title="تم إنشاء الشركة — كلمة المرور المؤقتة للمدير التنفيذي" onClose={() => setModal(null)}
          actions={<button className="btn" onClick={() => setModal(null)}>تم</button>}>
          <p className="muted small">تظهر مرة واحدة فقط. انسخها وأعطها للمدير ليغيّرها عند أول دخول.</p>
          <input className="input" readOnly dir="ltr" value={modal.password} onFocus={e => e.target.select()} style={{ textAlign: 'center', fontWeight: 800, marginTop: 8 }} />
        </Modal>
      )}
      {toast && <div className="toast show" role="status">{toast}</div>}
    </AppShell>
  );
}

function NewOrgModal({ onClose, onDone }) {
  const [f, setF] = useState({ company: '', name: '', email: '', maxUsers: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const raw = f.maxUsers.trim();
      const r = await api('POST', '/api/platform/orgs', {
        company: f.company, name: f.name, email: f.email,
        ...(raw ? { maxUsers: Math.round(+raw) } : {}),
      });
      onDone(r);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title="شركة جديدة" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="row2">
          <label className="field"><span>اسم الشركة</span><input value={f.company} onChange={set('company')} required maxLength={100} /></label>
          <label className="field"><span>اسم المدير التنفيذي</span><input value={f.name} onChange={set('name')} required maxLength={60} /></label>
          <label className="field"><span>بريد المدير التنفيذي</span><input type="email" dir="ltr" style={{ textAlign: 'right' }} value={f.email} onChange={set('email')} required maxLength={191} /></label>
          <label className="field"><span>الحد الأقصى للمستخدمين (اختياري)</span><input type="number" min="1" max="100000" placeholder="بلا حد" value={f.maxUsers} onChange={set('maxUsers')} /></label>
        </div>
        <p className="muted small">يُنشأ حساب المدير التنفيذي بصلاحية مسؤول النظام وكلمة مرور مؤقتة تظهر مرة واحدة، ويُطلب منه تغييرها عند أول دخول.</p>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>إنشاء الشركة</button>
        </div>
      </form>
    </Modal>
  );
}

function LimitModal({ org, act, onClose, onDone }) {
  const [v, setV] = useState(org.maxUsers ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const raw = String(v).trim();
      await api('PATCH', '/api/platform/orgs/' + org.id, { maxUsers: raw === '' ? null : Math.round(+raw) });
      onDone();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={'عدد المستخدمين — ' + org.name} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted" style={{ marginBottom: 10 }}>المستخدمون الفعّالون حالياً: <b>{act}</b></p>
        <label className="field"><span>الحد الأقصى للمستخدمين (اتركه فارغاً لبلا حد)</span>
          <input type="number" min="1" max="100000" value={v} placeholder="مثال: 25" onChange={e => setV(e.target.value)} /></label>
        <p className="muted small">تقليص الحد لا يحذف أو يعطّل أحداً؛ يمنع الإضافة والدعوات الجديدة حتى ينزل العدد تحت الحد.</p>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
