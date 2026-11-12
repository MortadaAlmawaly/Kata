'use client';
/* تواصل مع الدعم: مدير الشركة يرسل رسالة لفريق كاتا ويتابع حالتها (تصل لداشبورد مالك المنصة). */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AppShell, { useMe } from '../../components/AppShell';
import { Icon } from '../../components/ui';
import { ago, useToast } from '../../components/hooks';

const ST = { NEW: ['قيد الانتظار', 'warn'], DONE: ['تمت المعالجة', 'ok'] };

export default function SupportPage() {
  const { me, error } = useMe();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [toast, toastNode] = useToast();
  const allowed = !!me && (me.perms || []).includes('admin');

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/support')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function send(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api('POST', '/api/support', f);
      setF({ subject: '', body: '' });
      toast('وصلت رسالتك لفريق كاتا');
      load();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <AppShell active="support" title="تواصل مع الدعم" sub="أرسل رسالة لفريق كاتا وتابع حالتها" me={me}>
      {error && <div className="notice">{error}</div>}
      {me && !allowed && <div className="notice">إرسال رسائل الدعم لمدير الشركة أو مسؤول النظام.</div>}
      {allowed && (
        <>
          <form className="card" onSubmit={send}>
            <label className="field"><span>العنوان</span>
              <input value={f.subject} maxLength={140} required onChange={e => setF({ ...f, subject: e.target.value })} placeholder="مثال: مشكلة بإضافة مستخدم" /></label>
            <label className="field"><span>الرسالة</span>
              <textarea value={f.body} maxLength={4000} required style={{ minHeight: 140 }} onChange={e => setF({ ...f, body: e.target.value })} placeholder="اشرح المشكلة أو طلبك بالتفصيل" /></label>
            <button className="btn" disabled={busy}><Icon name="plus" /> {busy ? '...' : 'إرسال'}</button>
          </form>
          <h3 style={{ margin: '18px 0 8px' }}>رسائلك السابقة</h3>
          {list && !list.length && <div className="empty-box"><p>لم ترسل أي رسالة بعد.</p></div>}
          {(list || []).map(m => (
            <article className="card" key={m.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0 }}>{m.subject}</h4>
                <span className={`badge ${ST[m.status] ? ST[m.status][1] : ''}`}>{(ST[m.status] || [m.status])[0]}</span>
              </div>
              <p className="muted small">{m.by} · {ago(m.createdAt)}</p>
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{m.body}</p>
            </article>
          ))}
        </>
      )}
      {toastNode}
    </AppShell>
  );
}
