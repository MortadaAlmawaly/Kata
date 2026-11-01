'use client';
/* تبويبات الإعدادات الأساسية: حسابي · الإشعارات · الشركة · الموافقات · الأمان · التكاملات (ترحيل settings.js + views-biz.js). */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { ROLE } from '../../lib/constants';
import { WEEKDAYS } from '../../lib/util';
import { Modal } from '../../components/ui';
import { ago } from '../../components/hooks';
import { withBase } from '@/lib/base';
import { FIcon } from '../../components/Icon';

const b64ToUint8 = s => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};
async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch (_) { return 'unsupported'; }
}
async function pushEnable() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('لم يتم السماح بالإشعارات من المتصفح');
  const { key } = await api('GET', '/api/push/key');
  if (!key) throw new Error('إشعارات الهاتف غير مفعّلة على الخادم');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  await api('POST', '/api/push/subscribe', sub.toJSON());
}
async function pushDisable() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { try { await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }); } catch (_) { /* تجاهل */ } await sub.unsubscribe(); }
}

const TIMEZONES = [['Asia/Baghdad', 'بغداد'], ['Asia/Riyadh', 'الرياض'], ['Asia/Kuwait', 'الكويت'], ['Asia/Dubai', 'دبي'], ['Asia/Qatar', 'الدوحة'],
  ['Asia/Amman', 'عمّان'], ['Asia/Beirut', 'بيروت'], ['Africa/Cairo', 'القاهرة'], ['Europe/Istanbul', 'إسطنبول'], ['UTC', 'UTC']];
const NOTIF_PREFS = [
  ['mention', 'الإشارات (@) إليّ', 'عندما يذكرك زميل بتعليق'],
  ['task', 'المهام والتعليقات', 'تكليف جديد، إنجاز، تعليق'],
  ['request', 'الطلبات والموافقات', 'طلب بانتظار موافقتك أو نتيجة طلبك'],
  ['event', 'المواعيد والدعوات', 'دعوة اجتماع أو تعديله أو إلغاؤه'],
  ['announcement', 'التعاميم', 'تعميم جديد للشركة أو الفريق'],
  ['whatsapp', 'واتساب', 'نسخة من الإشعارات على رقمك (يتطلب أن تكون الشركة فعّلت الربط وأن تضيف رقم هاتفك)'],
];

/* مساعد: تشغيل حفظ مع رسالة نجاح/خطأ */
export function useRunner(toast) {
  return async (fn, okMsg = 'تم الحفظ') => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, 'err'); return undefined; }
  };
}

/* ── حسابي ── */
export function TabAccount({ me, reload, toast }) {
  const u = me.user;
  const run = useRunner(toast);
  const [p, setP] = useState({ name: u.name, phone: u.phone || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [theme, setTheme] = useState('light');
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'light');
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = e => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const pickTheme = t => { document.documentElement.dataset.theme = t; setTheme(t); try { localStorage.setItem('rb-theme', t); } catch (_) { /* تجاهل */ } };
  return (
    <div className="grid two">
      <form className="card" onSubmit={async e => { e.preventDefault(); await run(() => api('PATCH', '/api/me', { name: p.name, phone: p.phone || null })); reload(); }}>
        <h3>معلوماتي</h3>
        <label className="field"><span>الاسم</span><input value={p.name} maxLength={60} required onChange={e => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>رقم الهاتف</span><input value={p.phone} maxLength={30} dir="ltr" style={{ textAlign: 'right' }} placeholder="07xx xxx xxxx" onChange={e => setP({ ...p, phone: e.target.value })} /></label>
        <div className="kv"><span>البريد</span><b dir="ltr">{u.email}</b></div>
        <div className="kv"><span>الدور</span><b>{ROLE[u.role]}{u.isAdmin ? ' · مسؤول النظام' : ''}</b></div>
        <div className="kv"><span>المسمى / القسم</span><b>{u.title || '—'} · {u.department || '—'}</b></div>
        <button className="btn" style={{ marginTop: 14 }}>حفظ</button>
      </form>
      <form className="card" onSubmit={async e => { e.preventDefault(); const r = await run(() => api('POST', '/api/me/password', pw)); if (r !== undefined) setPw({ current: '', next: '' }); }}>
        <h3>كلمة المرور</h3>
        <label className="field"><span>الحالية</span><input type="password" autoComplete="current-password" required value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></label>
        <label className="field"><span>الجديدة ({me.org.settings.passwordMin} أحرف على الأقل)</span><input type="password" autoComplete="new-password" required value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></label>
        <p className="muted small" style={{ marginTop: 8 }}>عند التغيير تُنهى جلساتك على الأجهزة الأخرى.</p>
        <button className="btn" style={{ marginTop: 14 }}>تغيير</button>
      </form>
      <section className="card">
        <h3>تثبيت على الهاتف</h3>
        {!standalone ? (
          <>
            <p className="muted small">ثبّت كاتا على الشاشة الرئيسية ليفتح كتطبيق بملء الشاشة ويستقبل الإشعارات.</p>
            {deferred && <button className="btn" style={{ marginTop: 12 }} onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null); }}>تثبيت التطبيق</button>}
            <ol className="steps">
              {ios
                ? <><li>افتح الموقع بمتصفح <b>Safari</b></li><li>اضغط زر المشاركة <b><FIcon n="share" size={14} /></b></li><li>اختر <b>إضافة إلى الشاشة الرئيسية</b></li></>
                : <><li>افتح الموقع بمتصفح <b>Chrome</b></li><li>اضغط القائمة <b>⋮</b></li><li>اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b></li></>}
            </ol>
          </>
        ) : <p><span className="badge DONE">مثبّت</span> تستخدم التطبيق المثبّت الآن.</p>}
      </section>
      <section className="card">
        <h3>المظهر</h3>
        <div className="seg"><button className={theme === 'light' ? 'active' : ''} onClick={() => pickTheme('light')}>فاتح</button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => pickTheme('dark')}>داكن</button></div>
      </section>
    </div>
  );
}

/* ── الإشعارات ── */
export function TabNotifications({ me, reload, toast }) {
  const run = useRunner(toast);
  const prefs = me.notifyPrefs || {};
  const [ps, setPs] = useState(null);
  const [ios, setIos] = useState(false);
  const [vals, setVals] = useState(() => Object.fromEntries(NOTIF_PREFS.map(([k]) => [k, k === 'whatsapp' ? prefs[k] === true : prefs[k] !== false])));
  useEffect(() => { pushState().then(setPs); setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)); }, []);
  const text = { on: 'مفعّلة على هذا الجهاز', off: 'غير مفعّلة على هذا الجهاز', denied: 'محظورة من إعدادات المتصفح', unsupported: 'غير مدعومة بهذا المتصفح' }[ps] || '…';
  const act = (fn, msg) => async () => { await run(fn, msg); setPs(await pushState()); };
  return (
    <div className="grid two">
      <section className="card">
        <h3>إشعارات الهاتف والمتصفح</h3>
        <p className="muted small">تصلك الإشارات والمواعيد والموافقات حتى لو التطبيق مغلق.</p>
        <div className="kv"><span>الحالة</span><b>{text}</b></div>
        {ps === 'off' && <button className="btn" style={{ marginTop: 12 }} onClick={act(pushEnable, 'تم تفعيل الإشعارات')}>تفعيل على هذا الجهاز</button>}
        {ps === 'on' && (
          <>
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={act(pushDisable, 'تم الإيقاف')}>إيقاف على هذا الجهاز</button>{' '}
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={async () => {
              const reg = await navigator.serviceWorker.ready;
              await reg.showNotification('كاتا', { body: 'هكذا تصلك الإشعارات', icon: withBase('/icon-192.png'), dir: 'rtl', lang: 'ar' });
            }}>إشعار تجريبي</button>
          </>
        )}
        {ps === 'denied' && <p className="notice">فعّل الإشعارات للموقع من إعدادات المتصفح ثم أعد المحاولة.</p>}
        {ios && <p className="notice">على آيفون: ثبّت التطبيق على الشاشة الرئيسية أولاً ثم فعّل الإشعارات.</p>}
      </section>
      <form className="card" onSubmit={async e => { e.preventDefault(); await run(() => api('PATCH', '/api/me', { notifyPrefs: vals })); reload(); }}>
        <h3>ما الذي ينبّهني؟</h3>
        {NOTIF_PREFS.map(([k, l, h]) => (
          <label className="switch-row" key={k}><span><b>{l}</b><small className="muted">{h}</small></span>
            <input type="checkbox" checked={!!vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.checked })} /></label>
        ))}
        <button className="btn" style={{ marginTop: 14 }}>حفظ التفضيلات</button>
      </form>
    </div>
  );
}

/* ── الشركة ── */
export function TabCompany({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const o = me.org, s = o.settings;
  const [f, setF] = useState({ name: o.name, currency: o.currency, timezone: s.timezone, weekStart: s.weekStart, workDays: [...s.workDays],
    workStart: s.workStart, workEnd: s.workEnd, graceMinutes: s.graceMinutes ?? 10, leaveDefault: s.leaveDefault });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card" style={{ maxWidth: 720 }} onSubmit={async e => {
      e.preventDefault();
      await run(() => api('PATCH', '/api/admin/settings', { name: f.name, currency: f.currency, settings: {
        timezone: f.timezone, weekStart: +f.weekStart, workDays: f.workDays.map(Number), workStart: f.workStart, workEnd: f.workEnd,
        leaveDefault: +f.leaveDefault, graceMinutes: +f.graceMinutes } }));
      reload();
    }}>
      <h3>بيانات الشركة</h3>
      <div className="row2">
        <label className="field"><span>اسم الشركة</span><input value={f.name} maxLength={100} required onChange={set('name')} /></label>
        <label className="field"><span>العملة</span><input value={f.currency} maxLength={8} required onChange={set('currency')} /></label>
        <label className="field"><span>المنطقة الزمنية</span>
          <select value={f.timezone} onChange={set('timezone')}>{TIMEZONES.map(([z, l]) => <option key={z} value={z}>{l} ({z})</option>)}</select></label>
        <label className="field"><span>أول يوم بالأسبوع</span>
          <select value={f.weekStart} onChange={set('weekStart')}><option value={0}>الأحد</option><option value={6}>السبت</option><option value={1}>الاثنين</option></select></label>
      </div>
      <h3 style={{ marginTop: 20 }}>الدوام</h3>
      <div className="field"><span>أيام العمل</span>
        <div className="days-row">
          {WEEKDAYS.map((w, i) => (
            <label className="check" key={i}><input type="checkbox" checked={f.workDays.includes(i)}
              onChange={e => setF({ ...f, workDays: e.target.checked ? [...f.workDays, i] : f.workDays.filter(x => x !== i) })} /> {w}</label>
          ))}
        </div></div>
      <div className="row2">
        <label className="field"><span>بداية الدوام</span><input type="time" value={f.workStart} onChange={set('workStart')} /></label>
        <label className="field"><span>نهاية الدوام</span><input type="time" value={f.workEnd} onChange={set('workEnd')} /></label>
        <label className="field"><span>سماحية التأخير (دقائق)</span><input type="number" min="0" max="120" value={f.graceMinutes} onChange={set('graceMinutes')} /></label>
        <label className="field"><span>رصيد الإجازة السنوي الافتراضي (أيام)</span><input type="number" min="0" max="365" value={f.leaveDefault} onChange={set('leaveDefault')} /></label>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>يُطبَّق على من ينضم لاحقاً. ولكل موظف رصيده الخاص من «الهيكل والفريق ← تعديل».</p>
      <div className="toolbar" style={{ margin: '16px 0 0' }}>
        <button className="btn">حفظ</button>
        <button type="button" className="btn ghost" onClick={() => {
          const days = Math.max(0, Math.min(365, Math.round(Number(f.leaveDefault))));
          ask({ title: 'تطبيق رصيد الإجازة على الجميع', text: `سيصبح رصيد كل الموظفين ${days} يوماً سنوياً (يستبدل الأرصدة المخصّصة).`, ok: 'تطبيق', danger: false,
            onOk: async () => { await api('PATCH', '/api/admin/settings', { settings: { leaveDefault: days }, applyLeaveToAll: true }); toast('تم تطبيق الرصيد على الجميع'); reload(); } });
        }}>تطبيق الرصيد على كل الموظفين الحاليين</button>
      </div>
    </form>
  );
}

/* ── الموافقات ── */
export function TabApprovals({ me, reload, toast }) {
  const run = useRunner(toast);
  const o = me.org, lim = o.approvalLimits || {};
  const [f, setF] = useState({ MANAGER: lim.MANAGER ?? 0, DIRECTOR: lim.DIRECTOR ?? 0, GM: lim.GM ?? 0, note: !!o.settings.requireApprovalNote });
  return (
    <form className="card" style={{ maxWidth: 620 }} onSubmit={async e => {
      e.preventDefault();
      await run(() => api('PATCH', '/api/admin/settings', { approvalLimits: { MANAGER: +f.MANAGER, DIRECTOR: +f.DIRECTOR, GM: +f.GM }, settings: { requireApprovalNote: f.note } }));
      reload();
    }}>
      <h3>حدود الموافقة على المبالغ ({o.currency})</h3>
      <p className="muted small">الطلب الأكبر من حدّ الموافق يصعد تلقائياً للرئيس الأعلى منه. المدير التنفيذي بلا حد. الإجازات يعتمدها الرئيس المباشر.</p>
      {['MANAGER', 'DIRECTOR', 'GM'].map(r => (
        <label className="field" key={r}><span>{ROLE[r]} يوافق حتى</span>
          <input type="number" min="0" step="any" value={f[r]} onChange={e => setF({ ...f, [r]: e.target.value })} /></label>
      ))}
      <label className="switch-row" style={{ marginTop: 14 }}><span><b>إلزام كتابة سبب عند الرفض</b><small className="muted">لا يُقبل رفض بدون ملاحظة</small></span>
        <input type="checkbox" checked={f.note} onChange={e => setF({ ...f, note: e.target.checked })} /></label>
      <button className="btn" style={{ marginTop: 16 }}>حفظ</button>
    </form>
  );
}

/* ── الأمان والبيانات ── */
export function TabSecurity({ me, reload, toast }) {
  const run = useRunner(toast);
  const s = me.org.settings;
  const [f, setF] = useState({ passwordMin: s.passwordMin, sessionDays: s.sessionDays, inviteDays: s.inviteDays });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function exportData() {
    const data = await api('GET', '/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'company-export.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <div className="grid two">
      <form className="card" onSubmit={async e => {
        e.preventDefault();
        await run(() => api('PATCH', '/api/admin/settings', { settings: { passwordMin: +f.passwordMin, sessionDays: +f.sessionDays, inviteDays: +f.inviteDays } }));
        reload();
      }}>
        <h3>سياسة الدخول</h3>
        <label className="field"><span>أقل طول لكلمة المرور</span><input type="number" min="6" max="64" value={f.passwordMin} onChange={set('passwordMin')} /></label>
        <label className="field"><span>مدة بقاء الجلسة (أيام)</span><input type="number" min="1" max="90" value={f.sessionDays} onChange={set('sessionDays')} /></label>
        <label className="field"><span>صلاحية رابط الدعوة (أيام)</span><input type="number" min="1" max="30" value={f.inviteDays} onChange={set('inviteDays')} /></label>
        <button className="btn" style={{ marginTop: 14 }}>حفظ</button>
      </form>
      <section className="card">
        <h3>بيانات الشركة</h3>
        <p className="muted small">نزّل نسخة كاملة من بيانات شركتك (مستخدمون، مهام، أهداف، مشاريع، طلبات، مواعيد، تعاميم) بصيغة JSON.</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => run(exportData, null)}>تصدير بيانات الشركة</button>
      </section>
      {me.perms.includes('audit.view') && (
        <section className="card">
          <h3>سجل التدقيق</h3>
          <p className="muted small">كل العمليات الحساسة في النظام: من فعل ماذا ومتى (إنشاء مستخدمين، تغيير صلاحيات، اعتمادات…).</p>
          <a className="btn ghost" style={{ marginTop: 12 }} href="/audit">فتح سجل التدقيق</a>
        </section>
      )}
    </div>
  );
}

/* ── التكاملات ── */
export function TabIntegrations({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const admin = me.perms.includes('admin');
  const [ics, setIcs] = useState(null);
  const [hooks, setHooks] = useState(null);
  const wa = (me.org.settings && me.org.settings.whatsapp) || {};
  const [w, setW] = useState({ phoneNumberId: wa.phoneNumberId || '', token: '', countryCode: wa.countryCode || '964', enabled: wa.enabled !== false });
  const [h, setH] = useState({ url: '', events: ['*'] });
  const [secret, setSecret] = useState(null);
  const loadAll = async () => {
    try {
      setIcs(await api('GET', '/api/integrations/ics'));
      if (admin) setHooks(await api('GET', '/api/integrations/webhooks'));
    } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { loadAll(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!ics) return null;
  return (
    <>
      <div className="grid two">
        <section className="card">
          <h3>اشتراك التقويم (Google / Apple / Outlook)</h3>
          <p className="muted small">أضف هذا الرابط لتطبيق التقويم ليعرض مواعيدك وتسليماتك تلقائياً (للقراءة فقط، ويتحدّث كل ساعة تقريباً).</p>
          <div className="secret" style={{ fontSize: '.78rem', wordBreak: 'break-all' }}>{ics.url}</div>
          <div className="toolbar" style={{ margin: '10px 0 0' }}>
            <button className="btn" onClick={async () => { if (await copyText(ics.url)) toast('تم نسخ الرابط'); else toast('انسخه يدوياً', 'err'); }}>نسخ الرابط</button>
            <button className="btn ghost" onClick={() => ask({ title: 'رابط جديد', text: 'سيتوقف الرابط القديم عن العمل.', ok: 'تجديد', danger: false,
              onOk: async () => { await api('POST', '/api/integrations/ics/reset', {}); loadAll(); } })}>رابط جديد</button>
          </div>
          <ol className="steps"><li>Google: الإعدادات ← إضافة تقويم ← من عنوان URL</li><li>Apple: ملف ← اشتراك بتقويم جديد</li><li>Outlook: إضافة تقويم ← الاشتراك من الويب</li></ol>
          <p className="muted small">الرابط سرّي — من يملكه يرى مواعيدك. اضغط «رابط جديد» لإلغاء القديم.</p>
        </section>
        {admin && (
          <section className="card">
            <h3>واتساب (Cloud API)</h3>
            <p className="muted small">يرسل إشعارات الشركة لأرقام الموظفين الذين فعّلوا «واتساب» بتفضيلاتهم. يتطلب حساب WhatsApp Business API من Meta (قد تُطبَّق رسوم وقواعد قوالب الرسائل).</p>
            <form onSubmit={async e => {
              e.preventDefault();
              const body = { enabled: w.enabled, countryCode: w.countryCode || '964' };
              if (w.phoneNumberId) body.phoneNumberId = w.phoneNumberId;
              if (w.token) body.token = w.token;
              await run(() => api('PATCH', '/api/integrations/whatsapp', body));
              setW({ ...w, token: '' }); reload();
            }}>
              <label className="field"><span>معرّف رقم الهاتف (Phone Number ID)</span><input value={w.phoneNumberId} dir="ltr" placeholder="1234567890" onChange={e => setW({ ...w, phoneNumberId: e.target.value })} /></label>
              <label className="field"><span>Access Token {wa.configured ? '(محفوظ — اتركه فارغاً للإبقاء عليه)' : ''}</span>
                <input type="password" autoComplete="off" dir="ltr" placeholder={wa.configured ? '••••••••' : 'EAAG…'} value={w.token} onChange={e => setW({ ...w, token: e.target.value })} /></label>
              <label className="field"><span>رمز الدولة للأرقام التي تبدأ بـ 0</span><input value={w.countryCode} dir="ltr" maxLength={4} style={{ maxWidth: 120 }} onChange={e => setW({ ...w, countryCode: e.target.value })} /></label>
              <label className="switch-row"><span><b>مفعّل</b></span><input type="checkbox" checked={w.enabled} onChange={e => setW({ ...w, enabled: e.target.checked })} /></label>
              <div className="toolbar" style={{ margin: '12px 0 0' }}>
                <button className="btn">حفظ</button>
                {wa.configured && <button type="button" className="btn ghost" onClick={async () => {
                  try { const r = await api('POST', '/api/integrations/whatsapp/test', {}); toast(r.ok ? 'أُرسلت رسالة الاختبار' : 'فشل الإرسال — تحقق من البيانات', r.ok ? 'ok' : 'err'); } catch (ex) { toast(ex.message, 'err'); }
                }}>رسالة اختبار لرقمي</button>}
              </div>
            </form>
          </section>
        )}
      </div>
      {admin && hooks && (
        <>
          <h2 className="section-title">Webhooks — ربط الأحداث بأنظمتك</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>يُرسَل JSON موقّع (HMAC-SHA256 بالترويسة X-Routine-Signature) عند وقوع الأحداث. مناسب لـ n8n / Zapier / Make أو نظامك الداخلي.</p>
          <form className="card" style={{ marginBottom: 14 }} onSubmit={async e => {
            e.preventDefault();
            try {
              const r = await api('POST', '/api/integrations/webhooks', { url: h.url, events: h.events.includes('*') ? ['*'] : h.events });
              setSecret(r.secret); setH({ url: '', events: ['*'] }); loadAll();
            } catch (ex) { toast(ex.message, 'err'); }
          }}>
            <div className="row2">
              <label className="field"><span>رابط الاستقبال (https)</span><input type="url" required dir="ltr" placeholder="https://hooks.example.com/…" value={h.url} onChange={e => setH({ ...h, url: e.target.value })} /></label>
              <label className="field"><span>الأحداث</span>
                <select multiple size={4} style={{ height: 'auto' }} value={h.events} onChange={e => setH({ ...h, events: [...e.target.selectedOptions].map(o => o.value) })}>
                  {['*', ...hooks.available].map(ev => <option key={ev} value={ev}>{ev === '*' ? 'كل الأحداث' : ev}</option>)}
                </select></label>
            </div>
            <button className="btn" style={{ marginTop: 12 }}>إضافة</button>
          </form>
          {hooks.hooks.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>الرابط</th><th>الأحداث</th><th>آخر استدعاء</th><th>مفعّل</th><th /></tr></thead>
                <tbody>
                  {hooks.hooks.map(k => (
                    <tr key={k.id}>
                      <td dir="ltr" style={{ textAlign: 'right', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.url}</td>
                      <td>{(k.events || []).map(ev => <span className="badge role" key={ev}>{ev === '*' ? 'الكل' : ev}</span>)}</td>
                      <td>{k.lastAt ? <><span className={`badge ${k.lastStatus >= 200 && k.lastStatus < 300 ? 'DONE' : 'REJECTED'}`}>{k.lastStatus || 'فشل'}</span> {ago(k.lastAt)}</> : <span className="muted">—</span>}</td>
                      <td><input type="checkbox" checked={!!k.active} onChange={async e => { try { await api('PATCH', '/api/integrations/webhooks/' + k.id, { active: e.target.checked }); loadAll(); } catch (ex) { toast(ex.message, 'err'); } }} /></td>
                      <td>
                        <button className="btn sm ghost" onClick={async () => {
                          try {
                            const r = await api('POST', `/api/integrations/webhooks/${k.id}/test`, {});
                            const ok = r.status >= 200 && r.status < 300;
                            toast(ok ? 'وصل الاختبار بنجاح (' + r.status + ')' : 'لم يصل — الحالة: ' + (r.status || 'فشل'), ok ? 'ok' : 'err'); loadAll();
                          } catch (ex) { toast(ex.message, 'err'); }
                        }}>اختبار</button>{' '}
                        <button className="btn sm ghost" onClick={() => ask({ title: 'حذف الربط', text: 'سيتوقف إرسال الأحداث لهذا الرابط.', ok: 'حذف',
                          onOk: async () => { await api('DELETE', '/api/integrations/webhooks/' + k.id); loadAll(); } })}>حذف</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-box"><p>لا توجد روابط ربط بعد.</p></div>}
        </>
      )}
      {secret && (
        <Modal title="تم إنشاء الربط" onClose={() => setSecret(null)} actions={<button className="btn" onClick={() => setSecret(null)}>تم</button>}>
          <p className="notice">احفظ المفتاح السرّي للتحقق من التوقيع — لن يظهر مرة ثانية.</p>
          <div className="secret">{secret}</div>
        </Modal>
      )}
    </>
  );
}
