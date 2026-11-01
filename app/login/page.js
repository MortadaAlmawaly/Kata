'use client';
/* صفحة الدخول وتسجيل شركة جديدة — ترحيل React لـ public/login.html + login.js (نفس السلوك والـ API). */
import { useState } from 'react';
import { authCall } from '../../lib/api';
import { LangButton, LogoSet, Modal, ThemeInit } from '../../components/ui';
import './login.css';
import { withBase } from '@/lib/base';

const LEVELS = [
  ['5', 'المدير التنفيذي — الشركة كلها وإعداداتها'],
  ['4', 'المدير العام — العمليات وسجل التدقيق'],
  ['3', 'مدير الإدارة — إدارة المستخدمين تحته'],
  ['2', 'مدير القسم — تكليف الفريق والموافقات'],
  ['1', 'الموظف — مهامه وأهدافه وطلباته'],
];

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ company: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const reg = mode === 'register';
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const body = reg
        ? { company: form.company, name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password };
      await authCall('POST', '/api/auth/' + (reg ? 'register-company' : 'login'), body);
      window.location.href = withBase('/dashboard');
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <ThemeInit />
      <div className="intro">
        <div className="intro-brand"><LogoSet hero /></div>
        <h2>إدارة الأداء والمهام والموافقات بهرم صلاحيات واضح</h2>
        <p className="intro-lead">كل مستوى يرى ويدير نطاقه فقط، والموافقات تصعد تلقائياً حسب حدود المبالغ، وكل عملية حساسة مسجّلة.</p>

        <main className="box">
          <h1>{reg ? 'ابدأ شركتك' : 'تسجيل الدخول'}</h1>
          <p className="lead">{reg ? 'أنشئ شركتك وكن مديرها التنفيذي، ثم أضف فريقك' : 'ادخل بحساب شركتك'}</p>
          <div className="tabs" role="tablist">
            <button type="button" className={!reg ? 'active' : ''} onClick={() => { setMode('login'); setErr(''); }}>دخول</button>
            <button type="button" className={reg ? 'active' : ''} onClick={() => { setMode('register'); setErr(''); }}>تسجيل شركة جديدة</button>
          </div>
          <form onSubmit={submit} noValidate>
            {reg && (
              <>
                <label className="field"><span>اسم الشركة</span>
                  <input value={form.company} onChange={set('company')} maxLength={100} autoComplete="organization" /></label>
                <label className="field"><span>اسمك (المدير التنفيذي)</span>
                  <input value={form.name} onChange={set('name')} maxLength={60} autoComplete="name" /></label>
              </>
            )}
            <label className="field"><span>البريد الإلكتروني</span>
              <input type="email" value={form.email} onChange={set('email')} maxLength={191} autoComplete="email" required /></label>
            <label className="field"><span>كلمة المرور</span>
              <span className="pw-wrap">
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} maxLength={200}
                  autoComplete={reg ? 'new-password' : 'current-password'} required />
                <button type="button" className="pw-toggle" aria-label="إظهار كلمة المرور" onClick={() => setShowPw(s => !s)}>
                  {showPw ? 'إخفاء' : 'إظهار'}
                </button>
              </span>
            </label>
            <button className="btn full" type="submit" disabled={busy}>{reg ? 'إنشاء الشركة' : 'دخول'}</button>
            <p className="err" role="alert">{err}</p>
          </form>
          <p className="muted small">الحسابات تُنشأ من قِبل مديرك. التسجيل بالأعلى لمن يُنشئ شركته لأول مرة.</p>
        </main>

        <button type="button" className="levels-btn" onClick={() => setShowLevels(true)}>كيف تعمل مستويات الصلاحيات؟</button>
      </div>
      {showLevels && (
        <Modal center title="هرم الصلاحيات" onClose={() => setShowLevels(false)} actions={<button className="btn" type="button" onClick={() => setShowLevels(false)}>فهمت</button>}>
          <p className="muted small" style={{ marginTop: 0 }}>كل مستوى أعلى يرى كل ما تحته، ولا يرى من هم بمستواه أو فوقه. الموافقات تصعد درجة درجة حسب حدود المبالغ.</p>
          <div className="lvl-list">
            {LEVELS.map(([n, t]) => { const [role, desc] = t.split(' — '); return (
              <div className="lvl-row" key={n}>
                <span className="lvl-n" aria-label={`المستوى ${n}`}><small>مستوى</small>{n}</span>
                <span><b>{role}</b><small className="muted">{desc}</small></span>
              </div>
            ); })}
          </div>
        </Modal>
      )}      <LangButton className="" style={{ position: 'fixed', top: 14, insetInlineEnd: 14, zIndex: 50, padding: '6px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--text)' }} />
    </div>
  );
}
