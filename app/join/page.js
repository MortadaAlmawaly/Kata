'use client';
/* الانضمام بدعوة — ترحيل React لـ public/join.html + join.js. الرمز من ?token= */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authCall } from '../../lib/api';
import { ROLE } from '../../lib/constants';
import { LangButton, LogoSet, ThemeInit } from '../../components/ui';
import '../login/login.css';

function JoinInner() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState({ phase: 'loading' });
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    authCall('GET', '/api/auth/invite/' + encodeURIComponent(token))
      .then(inv => { if (alive) { setName(inv.name || ''); setState({ phase: 'ready', inv }); } })
      .catch(e => { if (alive) setState({ phase: 'bad', msg: e.message }); });
    return () => { alive = false; };
  }, [token]);

  async function accept(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await authCall('POST', '/api/auth/invite/' + encodeURIComponent(token) + '/accept', { name, password: pw });
      window.location.href = '/dashboard';
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  const { phase, inv, msg } = state;
  return (
    <main className="card box">
      <div className="join-logo"><LogoSet /></div>
      {phase === 'loading' && <p className="muted">جارٍ التحقق من الدعوة…</p>}
      {phase === 'bad' && (
        <>
          <h1>الدعوة غير صالحة</h1>
          <p className="muted">{msg}</p>
          <p className="muted small">اطلب من مسؤول شركتك دعوة جديدة.</p>
        </>
      )}
      {phase === 'ready' && (
        <>
          <h1>انضم إلى {inv.company}</h1>
          <p className="muted">دعاك {inv.inviter} للانضمام بدور <b>{inv.roleLabel || ROLE[inv.role]}</b>.</p>
          <div className="who"><small className="muted">بريدك</small><b dir="ltr" style={{ textAlign: 'right' }}>{inv.email}</b></div>
          <form onSubmit={accept} noValidate>
            <label className="field"><span>اسمك</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="name" required /></label>
            <label className="field"><span>اختر كلمة مرور ({inv.passwordMin} أحرف على الأقل)</span>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" maxLength={200} required /></label>
            <button className="btn full" type="submit" disabled={busy}>إنشاء الحساب والدخول</button>
            <p className="err" role="alert">{err}</p>
          </form>
        </>
      )}
    </main>
  );
}

export default function JoinPage() {
  return (
    <div className="join-page">
      <ThemeInit />
      <Suspense fallback={<main className="card box"><p className="muted">جارٍ التحميل…</p></main>}>
        <JoinInner />
      </Suspense>
      <LangButton className="" style={{ position: 'fixed', top: 14, insetInlineEnd: 14, zIndex: 50, padding: '6px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--panel)' }} />
    </div>
  );
}
