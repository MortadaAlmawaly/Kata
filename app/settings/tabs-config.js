'use client';
/* تبويبات إعدادات الإدارة: المسميات · الإجازات · حقول المهام · الأتمتة · الصلاحيات · الدعوات (ترحيل settings.js + tasks-pro.js + views-biz.js). */
import { useEffect, useState } from 'react';
import PermPicker from '../../components/PermPicker';
import { api } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { DEFAULT_LABELS, ETYPE, fmtDT, ITYPE, PAGES, PRIORITY, PSTATUS, ROLE, RTYPE, STATUS } from '../../lib/constants';
import { CF_TYPE_AR, CORE_KEYS, FL_KEYS, MAIN_SECTIONS, rid } from '../../lib/tasks';
import { Avatar, Modal } from '../../components/ui';
import TypeLayoutEditor from '../../components/TypeLayoutEditor';
import BoardForm from '../../components/BoardForm';
import { FIcon } from '../../components/Icon';
import { useRunner } from './tabs-basic';
import { withBase } from '@/lib/base';


const CL_TEXT = {
  taskStatus: { h: 'حالات إضافية (بلا حد للعدد)', p: 'كل حالة تظهر كعمود جديد بلوحة المهام وبقوائم الحالة. حذف حالة يرجع مهامها إلى «بالانتظار».', add: 'إضافة حالة', ph: 'اسم الحالة مثل: بانتظار العميل' },
  issueType: { h: 'أنواع مهام إضافية (بلا حد للعدد)', p: 'تظهر بنموذج المهمة وفلاتر اللوحة. حذف نوع يرجع مهامه إلى «مهمة».', add: 'إضافة نوع مهمة', ph: 'اسم النوع مثل: طلب تحسين، دعم فني' },
  priority: { h: 'أولويات إضافية (بلا حد للعدد)', p: 'تظهر بقائمة أولوية المهمة وفلاتر المهام. تُرتَّب بعد الأولويات الأساسية. حذف أولوية يرجع مهامها إلى «متوسطة».', add: 'إضافة أولوية', ph: 'اسم الأولوية مثل: حرجة جداً' },
  requestType: { h: 'أنواع طلبات إضافية (بلا حد للعدد)', p: 'تظهر بنموذج الطلب وتُعامَل كطلب بمبلغ وسلسلة اعتماد مثل المصروف. حذف نوع يحوّل طلباته إلى «مصروف».', add: 'إضافة نوع طلب', ph: 'اسم النوع مثل: سلفة، سفر' },
  eventType: { h: 'أنواع مواعيد إضافية (بلا حد للعدد)', p: 'تظهر بنموذج الموعد وتصير فلتراً بالتقويم. حذف نوع يحوّل مواعيده إلى «اجتماع».', add: 'إضافة نوع موعد', ph: 'اسم النوع مثل: تدريب، مقابلة' },
  projectStatus: { h: 'حالات مشاريع إضافية (بلا حد للعدد)', p: 'تظهر بنموذج المشروع وبتبويبات المشاريع. حذف حالة يرجع مشاريعها إلى «جارٍ».', add: 'إضافة حالة مشروع', ph: 'اسم الحالة مثل: بانتظار الاعتماد' },
};

/* ── المسميات ── */
export function TabLabels({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const st = me.org.settings || {};
  const L = st.labels || {};
  const groups = [
    ['roles', 'الأدوار الوظيفية', ROLE, 'مثال: «رئيس قسم» بدل «مدير قسم»، «مدير فرع» بدل «مدير إدارة»'],
    ['taskStatus', 'حالات المهام', STATUS, ''], ['issueType', 'أنواع المهام', ITYPE, ''], ['priority', 'أولويات المهام', PRIORITY, ''],
    ['requestType', 'أنواع الطلبات', RTYPE, ''], ['eventType', 'أنواع المواعيد', ETYPE, ''], ['projectStatus', 'حالات المشاريع', PSTATUS, ''],
  ];
  const defaults = Object.fromEntries(groups.map(([g, , map]) => [g, DEFAULT_LABELS[g] || map]));
  const pages = PAGES.filter(p => p.id !== 'platform');
  const defPages = Object.fromEntries(pages.map(p => [p.id, p.title]));
  const stored = g => (g === 'taskStatus' ? (st.taskStatuses || []) : ((st.customItems || {})[g] || []));
  const [vals, setVals] = useState(() => {
    const v = {};
    groups.forEach(([g, , map]) => Object.keys(defaults[g]).forEach(k => { v[`${g}.${k}`] = (L[g] || {})[k] || ''; }));
    pages.forEach(p => { v[`pages.${p.id}`] = (L.pages || {})[p.id] || ''; });
    return v;
  });
  const HIDEABLE = ['issueType', 'priority'];
  const [hid, setHid] = useState(() => Object.fromEntries(HIDEABLE.map(g => [g, new Set((st.hiddenItems || {})[g] || [])])));
  const [lists, setLists] = useState(() => Object.fromEntries(Object.keys(CL_TEXT).map(g => [g, stored(g).map(s => ({ key: s.key, name: s.name, ...(s.board ? { board: s.board } : {}) }))])));

  async function save(labels, withLists) {
    const extra = withLists ? {
      taskStatuses: lists.taskStatus.filter(s => s.name.trim()).map(s => ({ key: s.key, name: s.name.trim(), ...(s.board ? { board: s.board } : {}) })),
      customItems: Object.fromEntries(['priority', 'issueType', 'requestType', 'eventType', 'projectStatus'].map(g => [g, lists[g].filter(s => s.name.trim()).map(s => ({ key: s.key, name: s.name.trim() }))])),
    } : {};
    const hiddenItems = Object.fromEntries(HIDEABLE.map(g => [g, [...hid[g]]]));
    await run(() => api('PATCH', '/api/admin/settings', { settings: { labels, hiddenItems, ...extra } }), 'تم حفظ المسميات');
    reload();
  }
  function submit(e) {
    e.preventDefault();
    const labels = {};
    Object.entries(vals).forEach(([k, v]) => {
      const val = String(v).trim();
      if (!val) return;
      const [g, key] = k.split('.');
      (labels[g] = labels[g] || {})[key] = val;
    });
    save(labels, true);
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>المسميات المخصّصة</h3>
      <p className="muted small">اكتب الاسم الذي تستعمله شركتك. الحقل الفارغ = الاسم الافتراضي. يظهر الاسم الجديد بكل صفحات الموقع والنوافذ.</p>
      {groups.map(([g, title, , hint]) => (
        <div key={g}>
          <h4 className="perm-group">{title}</h4>
          {hint && <p className="muted small">{hint}</p>}
          <div className="row2">
            {Object.keys(defaults[g]).map(k => (
              <label className="field" key={k}><span>{defaults[g][k]}</span>
                <input maxLength={30} value={vals[`${g}.${k}`] || ''} placeholder={defaults[g][k]} onChange={e => setVals({ ...vals, [`${g}.${k}`]: e.target.value })} />
                {HIDEABLE.includes(g) && (
                  <span className="check" style={{ marginTop: 4 }}>
                    <input type="checkbox" checked={hid[g].has(k)} onChange={e => setHid(h => { const n = new Set(h[g]); if (e.target.checked) n.add(k); else n.delete(k); return { ...h, [g]: n }; })} /> إخفاء من القوائم
                  </span>
                )}</label>
            ))}
          </div>
          {g !== 'roles' && (
            <>
              <h5 style={{ margin: '14px 0 4px' }}>{CL_TEXT[g].h}</h5>
              <p className="muted small">{CL_TEXT[g].p}</p>
              <div className="cl-list">
                {lists[g].map((s, i) => (
                  <div className="st-row" key={s.key}>
                    <input maxLength={30} value={s.name} placeholder={CL_TEXT[g].ph} aria-label="الاسم"
                      onChange={e => setLists({ ...lists, [g]: lists[g].map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    {s.board && <span className="badge role" title="أُنشئت من إعدادات لوحة وتظهر في تلك اللوحة فقط">خاصة بلوحة</span>}
                    <button type="button" className="btn sm danger" aria-label="حذف" onClick={() => setLists({ ...lists, [g]: lists[g].filter((_, j) => j !== i) })}>حذف</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setLists({ ...lists, [g]: [...lists[g], { key: 's' + Math.random().toString(36).slice(2, 10), name: '' }] })}>+ {CL_TEXT[g].add}</button>
            </>
          )}
        </div>
      ))}
      <h4 className="perm-group">أسماء الصفحات</h4>
      <div className="row2">
        {pages.map(p => (
          <label className="field" key={p.id}><span>{defPages[p.id] || p.title}</span>
            <input maxLength={30} value={vals[`pages.${p.id}`] || ''} placeholder={defPages[p.id] || p.title} onChange={e => setVals({ ...vals, [`pages.${p.id}`]: e.target.value })} /></label>
        ))}
      </div>
      <div className="toolbar" style={{ margin: '18px 0 0' }}>
        <button className="btn">حفظ المسميات</button>
        <button type="button" className="btn ghost" onClick={() => ask({ title: 'استعادة الأسماء', text: 'ستعود كل المسميات للأسماء الافتراضية (الحالات الإضافية تبقى).', ok: 'استعادة', danger: false, onOk: () => save({}, false) })}>استعادة الأسماء الافتراضية</button>
      </div>
    </form>
  );
}

/* ── الإجازات ── */
export function TabLeaves({ me, reload, toast }) {
  const run = useRunner(toast);
  const [types, setTypes] = useState(() => (me.org.settings.leaveTypes || []).map(t => ({ ...t })));
  const set = (i, patch) => setTypes(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <form className="card" style={{ maxWidth: 760 }} onSubmit={async e => {
      e.preventDefault();
      await run(() => api('PATCH', '/api/admin/settings', { settings: { leaveTypes: types.map(t => ({ key: t.key, name: t.name.trim() || t.key, days: t.days ?? null, paid: t.paid !== false })) } }));
      reload();
    }}>
      <h3>أنواع الإجازات</h3>
      <p className="muted small">لكل نوع رصيد سنوي. اترك الأيام فارغة لـ«غير محدود». رصيد «السنوية» يؤخذ من رصيد كل موظف (يُضبط من الهيكل والفريق ← تعديل).</p>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>الاسم</th><th>الأيام بالسنة</th><th>مدفوعة</th><th /></tr></thead>
          <tbody>
            {types.map((t, i) => (
              <tr key={t.key}>
                <td><input className="input" maxLength={30} value={t.name} onChange={e => set(i, { name: e.target.value })} /></td>
                <td>{t.key === 'annual' ? <span className="muted small">حسب رصيد كل موظف</span>
                  : <input className="input" type="number" min="0" max="365" placeholder="غير محدود" style={{ maxWidth: 150 }} value={t.days ?? ''}
                    onChange={e => set(i, { days: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />}</td>
                <td><input type="checkbox" checked={t.paid !== false} onChange={e => set(i, { paid: e.target.checked })} /></td>
                <td>{t.key !== 'annual' && <button type="button" className="btn sm ghost" onClick={() => setTypes(ts => ts.filter((_, j) => j !== i))}>حذف</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ margin: '14px 0 0' }}>
        <button type="button" className="btn ghost" onClick={() => setTypes(ts => [...ts, { key: 'type' + Math.random().toString(36).slice(2, 6), name: 'نوع جديد', days: 5, paid: true }])}>+ نوع إجازة</button>
        <button className="btn">حفظ</button>
      </div>
    </form>
  );
}

/* ── حقول المهام المخصصة ── */
export function TabFields({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const st = me.org.settings;
  const list = (st.customFields || []).map(d => ({ ...d }));
  const secName = s => ((st.fieldSections || {})[s] || '').trim() || (s === 'main' ? 'تفاصيل أساسية' : 'حقول إضافية');
  const [edit, setEdit] = useState(null);   // { d|null, idx }
  const [sec, setSec] = useState({ main: (st.fieldSections || {}).main || '', side: (st.fieldSections || {}).side || '' });
  const [fl, setFl] = useState(() => Object.fromEntries(Object.keys(FL_KEYS).map(k => [k, (st.fieldLabels || {})[k] || ''])));
  const save = async next => {
    await run(() => api('PATCH', '/api/admin/settings', { settings: { customFields: next.map(d => ({ key: d.key, name: d.name, type: d.type, options: d.options || undefined,
      section: d.section || 'side', card: !!d.card, issueTypes: d.issueTypes && d.issueTypes.length ? d.issueTypes : undefined })) } }));
    reload();
  };
  const move = (i, j) => { const n = list.slice(); [n[i], n[j]] = [n[j], n[i]]; save(n); };
  return (
    <div className="card">
      <div className="toolbar" style={{ margin: '0 0 12px' }}><h3 style={{ margin: 0 }}>حقول المهام المخصصة</h3><span className="grow" />
        <button className="btn sm" onClick={() => setEdit({ d: null, idx: -1 })}>+ حقل جديد</button></div>
      <p className="muted small">أضف أي حقول تناسب طبيعة عمل شركتك وسمّها كما تشاء (مثل: رقم العقد، اسم العميل، الفرع، رقم الطلب…). تُدار من هنا فقط وتختلف من شركة لأخرى؛ تظهر داخل المهمة وفي نموذج الإنشاء، ويمكن إظهارها على بطاقة اللوحة. بلا حد للعدد.</p>
      <form className="row2 sec-names" style={{ margin: '12px 0', alignItems: 'end' }} onSubmit={async e => {
        e.preventDefault();
        await run(() => api('PATCH', '/api/admin/settings', { settings: { fieldSections: { main: sec.main.trim(), side: sec.side.trim() } } }));
        reload();
      }}>
        <label className="field"><span>اسم قسم الحقول الأساسي (عمود المحتوى)</span><input maxLength={40} placeholder="تفاصيل أساسية" value={sec.main} onChange={e => setSec({ ...sec, main: e.target.value })} /></label>
        <label className="field"><span>اسم قسم الحقول الجانبي</span><input maxLength={40} placeholder="حقول إضافية" value={sec.side} onChange={e => setSec({ ...sec, side: e.target.value })} /></label>
        <div><button className="btn sm ghost">حفظ أسماء الأقسام</button></div>
      </form>
      <details className="fl-box">
        <summary><b>مسميات حقول المهمة الأساسية</b> <span className="muted small">— غيّر «المنفّذ»، «الأولوية»، «السباق»… بما يناسب شركتك</span></summary>
        <form style={{ marginTop: 10 }} onSubmit={async e => {
          e.preventDefault();
          const out = {};
          Object.keys(FL_KEYS).forEach(k => { const v = String(fl[k] || '').trim(); if (v) out[k] = v; });
          await run(() => api('PATCH', '/api/admin/settings', { settings: { fieldLabels: out } }));
          reload();
        }}>
          <div className="row2">
            {Object.entries(FL_KEYS).map(([k, l]) => (
              <label className="field" key={k}><span>{l}</span><input maxLength={30} placeholder={l} value={fl[k]} onChange={e => setFl({ ...fl, [k]: e.target.value })} /></label>
            ))}
          </div>
          <button className="btn sm" style={{ marginTop: 10 }}>حفظ المسميات</button>
        </form>
      </details>
      {list.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الحقل</th><th>النوع</th><th>المكان</th><th>على البطاقة</th><th /></tr></thead>
            <tbody>
              {list.map((d, i) => (
                <tr key={d.key}>
                  <td><b>{d.name}</b>{d.options && d.options.length > 0 && <><br /><small className="muted">{d.options.join('، ')}</small></>}</td>
                  <td>{CF_TYPE_AR[d.type] || d.type}</td>
                  <td>{d.section === 'main' ? secName('main') : secName('side')}</td>
                  <td>{d.card ? '✓' : '—'}</td>
                  <td className="nowrap">
                    <button className="btn sm ghost" disabled={!i} aria-label="أعلى" onClick={() => move(i, i - 1)}>↑</button>{' '}
                    <button className="btn sm ghost" disabled={i >= list.length - 1} aria-label="أسفل" onClick={() => move(i, i + 1)}>↓</button>{' '}
                    <button className="btn sm ghost" onClick={() => setEdit({ d, idx: i })}>تعديل</button>{' '}
                    <button className="btn sm danger" onClick={() => ask({ title: 'حذف الحقل', text: 'تُحذف قيمه من المهام عند العرض ولا يمكن استرجاعها.', ok: 'حذف',
                      onOk: () => save(list.filter((_, j) => j !== i)) })}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-box"><p>لا توجد حقول مخصصة بعد.</p></div>}
      {edit && <FieldForm d={edit.d} secName={secName} onClose={() => setEdit(null)}
        onSave={item => { const next = list.slice(); if (edit.d) next[edit.idx] = item; else next.push(item); setEdit(null); save(next); }} />}
    </div>
  );
}

function FieldForm({ d, secName, onClose, onSave, preset }) {
  const [f, setF] = useState({ name: d ? d.name : '', type: d ? d.type : (preset || 'text'), section: d && d.section === 'main' ? 'main' : 'side', card: d ? !!d.card : false,
    options: (d && d.options || []).join('\n'), issueTypes: new Set((d && d.issueTypes) || []) });
  const [err, setErr] = useState('');
  const hasOpts = f.type === 'select' || f.type === 'multiselect';
  function submit(e) {
    e.preventDefault();
    const options = f.options.split('\n').map(x => x.trim()).filter(Boolean);
    if (hasOpts && !options.length) { setErr('أضف خياراً واحداً على الأقل'); return; }
    onSave({ key: d ? d.key : rid('f'), name: f.name.trim(), type: f.type, section: f.section, card: f.card, options: hasOpts ? options : undefined, issueTypes: [...f.issueTypes] });
  }
  return (
    <Modal title={d ? 'تعديل الحقل' : 'حقل جديد'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>اسم الحقل</span><input value={f.name} required maxLength={60} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>النوع</span>
            <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{Object.entries(CF_TYPE_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field"><span>مكان الظهور</span>
            <select value={f.section} onChange={e => setF({ ...f, section: e.target.value })}>
              <option value="main">{secName('main')} (عمود المحتوى)</option><option value="side">{secName('side')} (اللوحة الجانبية)</option></select></label>
        </div>
        {hasOpts && <label className="field"><span>الخيارات (خيار بكل سطر)</span><textarea rows={4} maxLength={2000} value={f.options} onChange={e => setF({ ...f, options: e.target.value })} /></label>}
        <label className="switch-row"><span><b>يظهر على بطاقة اللوحة</b><small className="muted">يُعرض الاسم والقيمة أسفل عنوان المهمة</small></span>
          <input type="checkbox" checked={f.card} onChange={e => setF({ ...f, card: e.target.checked })} /></label>
        <div className="field"><span>يقتصر على أنواع مهام معيّنة (اتركه فارغاً للكل)</span>
          <div className="pick-list">
            {Object.entries(ITYPE).map(([k, l]) => (
              <label className="check" key={k}><input type="checkbox" checked={f.issueTypes.has(k)}
                onChange={e => setF(s => { const n = new Set(s.issueTypes); if (e.target.checked) n.add(k); else n.delete(k); return { ...s, issueTypes: n }; })} /> {l}</label>
            ))}
          </div></div>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── الأتمتة ── */
const AUTO_TRIGGER_AR = { MANUAL: 'يدوي — زر ⚡ داخل المهمة', STATUS_CHANGED: 'عند انتقال المهمة إلى حالة', CREATED: 'عند إنشاء مهمة' };
const AUTO_ACTION_AR = { setStatus: 'تغيير الحالة', setPriority: 'تغيير الأولوية', assign: 'إسناد إلى شخص', addLabel: 'إضافة وسم', notify: 'إرسال إشعار', comment: 'إضافة تعليق', startTimer: 'بدء مؤقّت العمل', stopTimer: 'إيقاف المؤقّت وتسجيل الوقت', setField: 'تعيين حقل مخصص' };

export function TabAutomation({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const rules = (me.org.settings.automations || []).map(r => ({ ...r, actions: (r.actions || []).map(a => ({ ...a })) }));
  const [edit, setEdit] = useState(null);   // { r|null, idx }
  const [users, setUsers] = useState([]);
  useEffect(() => { api('GET', '/api/users').then(us => setUsers(us.filter(u => u.active && (u.inScope || u.id === me.user.id)))).catch(() => {}); }, [me.user.id]);
  const save = async next => { await run(() => api('PATCH', '/api/admin/settings', { settings: { automations: next } })); reload(); };
  const summary = r => (r.actions || []).map(a => AUTO_ACTION_AR[a.type] || a.type).join(' ← ');
  return (
    <div className="card">
      <div className="toolbar" style={{ margin: '0 0 12px' }}><h3 style={{ margin: 0 }}>أتمتة المهام</h3><span className="grow" />
        <button className="btn ghost sm" onClick={() => ask({ title: 'قواعد جاهزة', text: 'ستُضاف أزرار «بدء العمل» و«توقف العمل» و«إرسال للمراجعة» داخل المهام.', ok: 'إضافة', danger: false, onOk: async () => {
          const have = new Set(rules.map(r => r.name));
          const presets = [
            { name: 'بدء العمل', trigger: 'MANUAL', actions: [{ type: 'setStatus', value: 'IN_PROGRESS' }, { type: 'startTimer' }] },
            { name: 'توقف العمل', trigger: 'MANUAL', actions: [{ type: 'stopTimer' }] },
            { name: 'إرسال للمراجعة', trigger: 'MANUAL', actions: [{ type: 'stopTimer' }, { type: 'setStatus', value: 'REVIEW' }] },
          ].filter(p => !have.has(p.name)).map(p => ({ ...p, id: rid('r') }));
          await save([...rules, ...presets]);
        } })}>+ قواعد جاهزة</button>
        <button className="btn sm" onClick={() => setEdit({ r: null, idx: -1 })}>+ قاعدة جديدة</button></div>
      <p className="muted small">قواعد تنفّذ إجراءات تلقائياً أو بضغطة زر ⚡ داخل المهمة، مثل «بدء العمل» (يحوّل الحالة ويشغّل المؤقّت) أو «إرسال للمراجعة».</p>
      {rules.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>القاعدة</th><th>متى</th><th>ماذا تفعل</th><th /></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b></td>
                  <td>{AUTO_TRIGGER_AR[r.trigger]}{r.trigger === 'STATUS_CHANGED' ? ` «${STATUS[r.status] || r.status || ''}»` : ''}</td>
                  <td>{summary(r)}</td>
                  <td className="nowrap">
                    <button className="btn sm ghost" onClick={() => setEdit({ r, idx: i })}>تعديل</button>{' '}
                    <button className="btn sm danger" onClick={() => ask({ title: 'حذف القاعدة', text: 'لن تعمل بعد الآن.', ok: 'حذف', onOk: () => save(rules.filter((_, j) => j !== i)) })}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-box"><p>لا توجد قواعد أتمتة بعد.</p></div>}
      {edit && <RuleForm r={edit.r} users={users} fields={me.org.settings.customFields || []} onClose={() => setEdit(null)}
        onSave={item => { const next = rules.slice(); if (edit.r) next[edit.idx] = item; else next.push(item); setEdit(null); save(next); }} />}
    </div>
  );
}

function RuleForm({ r, users, fields, onClose, onSave }) {
  const [cur, setCur] = useState(() => (r ? { ...r, actions: r.actions.map(a => ({ ...a })) }
    : { id: rid('r'), name: '', trigger: 'MANUAL', status: 'DONE', actions: [{ type: 'setStatus', value: 'IN_PROGRESS' }] }));
  const [err, setErr] = useState('');
  const setAct = (i, patch) => setCur(c => ({ ...c, actions: c.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  function submit(e) {
    e.preventDefault();
    if (!cur.name.trim()) { setErr('اكتب اسم القاعدة'); return; }
    if (!cur.actions.length) { setErr('أضف إجراءً واحداً على الأقل'); return; }
    onSave({ id: cur.id, name: cur.name.trim(), trigger: cur.trigger, status: cur.trigger === 'STATUS_CHANGED' ? cur.status : undefined,
      actions: cur.actions.map(a => ({ type: a.type, value: a.value })) });
  }
  const valueInput = (a, i) => {
    const v = a.value;
    switch (a.type) {
      case 'setStatus': return <select className="input" value={v || 'TODO'} onChange={e => setAct(i, { value: e.target.value })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
      case 'setPriority': return <select className="input" value={v || 'MEDIUM'} onChange={e => setAct(i, { value: e.target.value })}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
      case 'assign': return <select className="input" value={v || ''} onChange={e => setAct(i, { value: +e.target.value })}><option value="">— اختر —</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>;
      case 'addLabel': return <input className="input" maxLength={30} placeholder="اسم الوسم" value={v || ''} onChange={e => setAct(i, { value: e.target.value })} />;
      case 'comment': return <input className="input" maxLength={500} placeholder="نص التعليق" value={v || ''} onChange={e => setAct(i, { value: e.target.value })} />;
      case 'notify': {
        const nv = v || { text: '', userIds: [] };
        return (
          <div className="au-notify">
            <input className="input" maxLength={150} placeholder="نص التنبيه" value={nv.text || ''} onChange={e => setAct(i, { value: { ...nv, text: e.target.value } })} />
            <div className="pick-list">
              {users.map(u => (
                <label className="check" key={u.id}><input type="checkbox" checked={(nv.userIds || []).includes(u.id)}
                  onChange={e => setAct(i, { value: { ...nv, userIds: e.target.checked ? [...(nv.userIds || []), u.id] : (nv.userIds || []).filter(x => x !== u.id) } })} /> {u.name}</label>
              ))}
            </div>
          </div>
        );
      }
      case 'setField': {
        const fv = v || { key: (fields[0] || {}).key || '', value: '' };
        return (
          <div className="au-field">
            <select className="input" value={fv.key} onChange={e => setAct(i, { value: { ...fv, key: e.target.value } })}>{fields.map(d => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
            <input className="input" maxLength={300} placeholder="القيمة" value={fv.value ?? ''} onChange={e => setAct(i, { value: { ...fv, value: e.target.value } })} />
          </div>
        );
      }
      default: return <span className="muted small">بلا قيمة</span>;
    }
  };
  return (
    <Modal title={r ? 'تعديل القاعدة' : 'قاعدة جديدة'} wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>اسم القاعدة (يظهر على الزر)</span><input required maxLength={60} value={cur.name} onChange={e => setCur({ ...cur, name: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>متى تعمل</span>
            <select value={cur.trigger} onChange={e => setCur({ ...cur, trigger: e.target.value })}>{Object.entries(AUTO_TRIGGER_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {cur.trigger === 'STATUS_CHANGED' && (
            <label className="field"><span>الحالة المستهدفة</span>
              <select value={cur.status || 'DONE'} onChange={e => setCur({ ...cur, status: e.target.value })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          )}
        </div>
        <h3 className="section-title">الإجراءات</h3>
        {cur.actions.map((a, i) => (
          <div className="au-act" key={i}>
            <select className="input" value={a.type} onChange={e => setAct(i, { type: e.target.value, value: e.target.value === 'setStatus' ? 'IN_PROGRESS' : e.target.value === 'setPriority' ? 'HIGH' : '' })}>
              {Object.entries(AUTO_ACTION_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <div className="au-val">{valueInput(a, i)}</div>
            <button type="button" className="btn sm danger" aria-label="حذف الإجراء" onClick={() => setCur(c => ({ ...c, actions: c.actions.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => setCur(c => ({ ...c, actions: [...c.actions, { type: 'setStatus', value: 'IN_PROGRESS' }] }))}>+ إضافة إجراء</button>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── الصلاحيات ── */
export function TabPermissions({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const [d, setD] = useState(null);
  const [vals, setVals] = useState({});
  const [acc, setAcc] = useState(null);
  const load = async () => {
    try {
      const x = await api('GET', '/api/admin/permissions');
      setD(x);
      setVals(Object.fromEntries(Object.entries(x.catalog).map(([k, c]) => [k, x.overrides[k] ?? c.min])));
    } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const groups = {};
  for (const [k, c] of Object.entries(d.catalog)) (groups[c.group] = groups[c.group] || []).push([k, c]);
  const levels = ['EMPLOYEE', 'MANAGER', 'DIRECTOR', 'GM', 'CEO'];
  return (
    <>
      <GlobalAdminCard me={me} toast={toast} ask={ask} onChanged={load} />
      <div className="notice" style={{ margin: '0 0 14px' }}>النطاق ثابت: كل شخص يرى ويدير نفسه ومن تحته فقط. من هنا تحدد <b>ماذا يقدر يفعل</b> ضمن نطاقه.</div>
      <form className="card" onSubmit={async e => {
        e.preventDefault();
        await run(() => api('PUT', '/api/admin/permissions', { overrides: Object.fromEntries(Object.keys(d.catalog).map(k => [k, +vals[k]])) }));
        reload(); load();
      }}>
        <h3>الحد الأدنى للدور لكل صلاحية</h3>
        {Object.entries(groups).map(([g, list]) => (
          <div key={g}>
            <h4 className="perm-group">{g}</h4>
            {list.map(([k, c]) => (
              <div className="perm-row" key={k}>
                <div><b>{c.label}</b>{c.hint && <small className="muted">{c.hint}</small>}</div>
                <select value={vals[k]} onChange={e => setVals({ ...vals, [k]: +e.target.value })}>
                  {levels.map((r, i) => <option key={r} value={i + 1}>{ROLE[r]} فما فوق{c.min === i + 1 ? ' (افتراضي)' : ''}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn">حفظ المصفوفة</button>
          <button type="button" className="btn ghost" onClick={() => ask({ title: 'استعادة الافتراضي', text: 'ستعود كل الصلاحيات للقيم الافتراضية.', ok: 'استعادة', danger: false,
            onOk: async () => { await api('PUT', '/api/admin/permissions', { overrides: {} }); reload(); load(); } })}>استعادة الافتراضي</button>
        </div>
      </form>

      <h2 className="section-title">صلاحيات فردية</h2>
      <p className="muted small" style={{ marginBottom: 10 }}>امنح شخصاً صلاحية إضافية بغض النظر عن دوره (مثلاً موظف الموارد البشرية يرى التقارير)، أو امنعه صلاحية.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الاسم</th><th>الدور</th><th>مستوى التحكم</th><th>صلاحيات إضافية</th><th /></tr></thead>
          <tbody>
            {d.users.map(u => (
              <tr key={u.id}>
                <td><span className="who"><Avatar name={u.name} size={24} />{u.name}</span></td>
                <td>{ROLE[u.role]}</td>
                <td>{u.role === 'CEO' ? <span className="badge role">مدير الشركة</span> : u.isAdmin ? <span className="badge DONE">أدمن شامل</span> : <span className="muted">—</span>}</td>
                <td>{u.extraPerms.length || (u.deniedPerms || []).length ? <>{u.extraPerms.map(p => <span className="badge role" key={p}>＋ {(d.catalog[p] || {}).label || p}</span>)}{(u.deniedPerms || []).map(p => <span className="badge REJECTED" key={p}>－ {(d.catalog[p] || {}).label || p}</span>)}</> : <span className="muted">—</span>}</td>
                <td><button className="btn sm ghost" onClick={() => setAcc(u)}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {acc && <AccessForm u={acc} catalog={d.catalog} onClose={() => setAcc(null)} onSaved={() => { setAcc(null); toast('تم الحفظ'); load(); }} onError={m => toast(m, 'err')} />}
    </>
  );
}

/* ── الأدمن الشامل: شخص واحد يتحكم بالنظام ككل؛ يعيّنه ويستبدله مدير الشركة وحده ── */
function GlobalAdminCard({ me, toast, ask, onChanged }) {
  const [d, setD] = useState(null);
  const [pick, setPick] = useState('');
  const load = async () => { try { setD(await api('GET', '/api/admin/global-admin')); } catch (e) { toast(e.message, 'err'); } };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const cur = d.current;
  const set = async (userId, msg) => {
    try { await api('PUT', '/api/admin/global-admin', { userId }); toast(msg); setPick(''); await load(); if (onChanged) onChanged(); } catch (e) { toast(e.message, 'err'); }
  };
  const target = d.candidates.find(c => String(c.id) === String(pick));
  return (
    <section className="card ga-card">
      <div className="ga-head">
        <div><h3>الأدمن الشامل</h3>
          <p className="muted small">شخص واحد يتحكم بالنظام ككل (الإعدادات والصلاحيات واللوحات والمستخدمين). لا يعيّنه ولا يستبدله إلا مدير الشركة.</p></div>
      </div>
      <div className="ga-cur">
        {cur
          ? <><Avatar name={cur.name} size={42} /><div className="ga-who"><b>{cur.name}</b><small className="muted">{ROLE[cur.role]}{cur.title ? ' · ' + cur.title : ''}</small></div><span className="badge DONE">أدمن شامل</span></>
          : <span className="muted">لم يُعيَّن أدمن شامل بعد — مدير الشركة يتحكم وحده حالياً.</span>}
      </div>
      {d.canManage ? (
        <div className="ga-set">
          <select value={pick} onChange={e => setPick(e.target.value)} aria-label="اختر الأدمن الشامل">
            <option value="">{cur ? 'استبداله بشخص آخر…' : 'اختر شخصاً…'}</option>
            {d.candidates.filter(c => !cur || c.id !== cur.id).map(c => <option key={c.id} value={c.id}>{c.name} — {ROLE[c.role]}</option>)}
          </select>
          <button type="button" className="btn" disabled={!pick}
            onClick={() => ask({ title: cur ? 'استبدال الأدمن الشامل' : 'تعيين أدمن شامل',
              text: cur ? `سيُسحب الدور من «${cur.name}» ويُمنح لـ «${target ? target.name : ''}». يبقى أدمن شامل واحد فقط.` : `سيصبح «${target ? target.name : ''}» أدمن شامل بتحكم كامل بالنظام.`,
              ok: cur ? 'استبدال' : 'تعيين', danger: false, onOk: () => set(+pick, 'تم تعيين الأدمن الشامل') })}>{cur ? 'استبدال' : 'تعيين'}</button>
          {cur && <button type="button" className="btn ghost" onClick={() => ask({ title: 'إلغاء الأدمن الشامل', text: `سيُسحب الدور من «${cur.name}».`, ok: 'إلغاء الدور', danger: true, onOk: () => set(null, 'أُلغي الأدمن الشامل') })}>إلغاء الدور</button>}
        </div>
      ) : <p className="muted small" style={{ margin: '10px 0 0' }}>تعيين الأدمن الشامل أو استبداله لمدير الشركة فقط.</p>}
    </section>
  );
}
function AccessForm({ u, catalog, onClose, onSaved, onError }) {
  const [extra, setExtra] = useState(() => new Set(u.extraPerms));
  const [denied, setDenied] = useState(() => new Set(u.deniedPerms || []));
  async function submit(e) {
    e.preventDefault();
    try { await api('PUT', `/api/admin/users/${u.id}/access`, { extraPerms: [...extra], deniedPerms: [...denied] }); onSaved(); } catch (ex) { onError(ex.message); }
  }
  return (
    <Modal title={'صلاحيات ' + u.name} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted small">لكل صلاحية: <b>افتراضي</b> = حسب دور الشخص، <b>مسموح</b> = تُمنح له رغم دوره، <b>ممنوع</b> = تُسحب منه رغم دوره.</p>
        <PermPicker catalog={catalog} extra={extra} denied={denied} setExtra={setExtra} setDenied={setDenied} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── الدعوات ── */
const INV_STATUS = { PENDING: 'بانتظار القبول', ACCEPTED: 'تم القبول', REVOKED: 'ملغاة', EXPIRED: 'منتهية' };
const LV = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3, GM: 4, CEO: 5 };

export function TabInvites({ me, toast, ask }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ email: '', name: '', role: '', managerId: '', title: '', department: '' });
  const [link, setLink] = useState(null);   // { link, email }
  const load = async () => {
    try { const [list, users] = await Promise.all([api('GET', '/api/invitations'), api('GET', '/api/users')]); setData({ list, users }); } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  const { list, users } = data;
  const admin = me.perms.includes('admin');
  const myLevel = admin ? 5 : me.level;
  const roles = Object.keys(LV).filter(r => r !== 'CEO' && (admin || LV[r] < myLevel));
  const role = f.role || roles[0] || 'EMPLOYEE';
  const mgrs = users.filter(u => u.active && (admin || u.inScope) && LV[u.role] > LV[role]);
  const mgrId = mgrs.some(u => u.id === +f.managerId) ? +f.managerId : (mgrs.find(u => u.id === me.user.id) || mgrs[0] || {}).id || '';
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function create(e) {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/invitations', { email: f.email, name: f.name || undefined, role, managerId: mgrId ? +mgrId : undefined, title: f.title || undefined, department: f.department || undefined });
      setLink({ link: r.link, email: f.email }); setF({ ...f, email: '', name: '' }); load();
    } catch (ex) { toast(ex.message, 'err'); }
  }
  return (
    <>
      <form className="card" style={{ marginBottom: 16 }} onSubmit={create}>
        <h3>دعوة شخص للانضمام</h3>
        <div className="row2">
          <label className="field"><span>البريد الإلكتروني</span><input type="email" required dir="ltr" style={{ textAlign: 'right' }} maxLength={191} value={f.email} onChange={set('email')} /></label>
          <label className="field"><span>الاسم (اختياري)</span><input maxLength={60} value={f.name} onChange={set('name')} /></label>
          <label className="field"><span>الدور</span><select value={role} onChange={set('role')}>{roles.map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
          <label className="field"><span>الرئيس المباشر</span>
            <select value={mgrId} onChange={set('managerId')}>
              {mgrs.length ? mgrs.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>) : <option value="">لا يوجد رئيس مناسب</option>}</select></label>
          <label className="field"><span>المسمى الوظيفي (اكتب أي مسمى)</span><input list="dlT" maxLength={80} value={f.title} onChange={set('title')} /></label>
          <label className="field"><span>القسم (اكتب أي اسم)</span><input list="dlD" maxLength={60} value={f.department} onChange={set('department')} /></label>
          <datalist id="dlT">{[...new Set(users.map(u => u.title).filter(Boolean))].map(t => <option key={t} value={t} />)}</datalist>
          <datalist id="dlD">{[...new Set(users.map(u => u.department).filter(Boolean))].map(t => <option key={t} value={t} />)}</datalist>
        </div>
        <button className="btn" style={{ marginTop: 14 }}>إنشاء رابط الدعوة</button>
        <p className="muted small" style={{ marginTop: 8 }}>صلاحية الرابط {me.org.settings.inviteDays} أيام، ويُستخدم مرة واحدة.</p>
        {me.org.maxUsers > 0 && <p className="muted small">المستخدمون الفعّالون: <b>{users.filter(u => u.active).length}</b> من <b>{me.org.maxUsers}</b> (الحد الذي يحدده مزوّد المنصة). لإضافة مقاعد تواصل معه، أو عطّل مستخدمين غير مستعملين.</p>}
      </form>
      {list.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>البريد</th><th>الدور</th><th>الحالة</th><th>تنتهي</th><th /></tr></thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id}>
                  <td dir="ltr" style={{ textAlign: 'right' }}>{i.email}</td><td>{ROLE[i.role]}</td>
                  <td><span className={`badge ${i.status === 'ACCEPTED' ? 'DONE' : i.status === 'PENDING' ? 'PENDING' : 'REJECTED'}`}>{INV_STATUS[i.status]}</span></td>
                  <td>{fmtDT(i.expiresAt).slice(0, 10)}</td>
                  <td className="nowrap">
                    {i.status !== 'ACCEPTED' && <button className="btn sm ghost" onClick={async () => {
                      try { const r = await api('POST', `/api/invitations/${i.id}/renew`, {}); setLink({ link: r.link, email: i.email }); load(); } catch (ex) { toast(ex.message, 'err'); }
                    }}>تجديد الرابط</button>}{' '}
                    {i.status === 'PENDING' && <button className="btn sm ghost" onClick={() => ask({ title: 'إلغاء الدعوة', text: 'لن يعمل الرابط بعد الآن.', ok: 'إلغاء الدعوة',
                      onOk: async () => { await api('DELETE', '/api/invitations/' + i.id); load(); } })}>إلغاء</button>}{' '}
                    <button className="btn sm danger" aria-label="حذف الدعوة" onClick={() => ask({ title: 'حذف الدعوة', text: 'ستُحذف الدعوة من القائمة نهائياً ويتوقف رابطها عن العمل.', ok: 'حذف',
                      onOk: async () => { await api('DELETE', `/api/invitations/${i.id}?permanent=1`); toast('تم حذف الدعوة'); load(); } })}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-box"><p>لا توجد دعوات بعد.</p></div>}
      {link && (
        <Modal title="رابط الدعوة" onClose={() => setLink(null)} actions={<button className="btn" onClick={() => setLink(null)}>تم</button>}>
          <p className="notice">انسخ الرابط وأرسله للمدعو — لن يظهر مرة ثانية (تقدر تجدّده من القائمة).</p>
          <div className="secret" style={{ direction: 'ltr', fontSize: '.8rem', wordBreak: 'break-all' }}>{link.link}</div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={async () => { if (await copyText(link.link)) toast('تم النسخ'); else toast('انسخه يدوياً'); }}>نسخ الرابط</button>
            <a className="btn ghost" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`دعوة للانضمام إلى ${me.org.name} على كاتا:\n${link.link}`)}`}>واتساب</a>
            <a className="btn ghost" href={`mailto:${encodeURIComponent(link.email)}?subject=${encodeURIComponent('دعوة انضمام — ' + me.org.name)}&body=${encodeURIComponent(`دعوة للانضمام إلى ${me.org.name} على كاتا:\n${link.link}`)}`}>بريد</a>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── أنواع المهام وتخطيط حقولها (التخطيط الافتراضي للشركة؛ كل لوحة تقدر تتفوّق عليه من إعداداتها) ── */
export function TabIssueTypes({ me, reload, toast, ask }) {
  const run = useRunner(toast);
  const st = me.org.settings;
  const [layouts, setLayouts] = useState(() => JSON.parse(JSON.stringify(st.typeLayouts || {})));
  const [newField, setNewField] = useState(null);   // { preset, resolve }
  const cfs = st.customFields || [];
  const secName = s => ((st.fieldSections || {})[s] || '').trim() || (s === 'main' ? 'تفاصيل أساسية' : 'حقول إضافية');

  async function save() {
    await run(() => api('PATCH', '/api/admin/settings', { settings: { typeLayouts: layouts } }), 'تم حفظ تخطيط الحقول');
    reload();
  }
  const onNewField = preset => new Promise(resolve => setNewField({ preset, resolve }));
  async function createField(item) {
    const resolve = newField && newField.resolve;
    setNewField(null);
    const next = [...cfs, item];
    await run(() => api('PATCH', '/api/admin/settings', { settings: {
      customFields: next.map(d => ({ key: d.key, name: d.name, type: d.type, options: d.options || undefined, section: d.section || 'side', card: !!d.card, issueTypes: d.issueTypes && d.issueTypes.length ? d.issueTypes : undefined })) } }), 'أُنشئ الحقل');
    reload();
    if (resolve) resolve('cf:' + item.key);
  }
  return (
    <>
      <div className="notice" style={{ margin: '0 0 12px' }}>
        هذا التخطيط <b>الافتراضي لكل اللوحات</b>. لتخصيص شكل المهمة <b>للوحة معيّنة</b> (عروض الأسعار، الميديا، المبيعات…): من صفحة المهام اضغط «⋯» بجانب اسم اللوحة ← «تخصيص اللوحة» ← «تخطيط حقول المهمة».
      </div>
      <div className="toolbar" style={{ margin: '0 0 8px' }}><span className="grow" /><button type="button" className="btn" onClick={save}>حفظ التخطيط</button></div>
      <TypeLayoutEditor types={[['NONE', 'بدون نوع'], ...Object.entries(ITYPE)]} fields={cfs} fieldLabels={st.fieldLabels || {}} layouts={layouts} setLayouts={setLayouts}
        onNewField={onNewField} toast={toast} ask={ask} />
      {newField && <FieldForm d={null} preset={newField.preset} secName={secName} onClose={() => { newField.resolve(null); setNewField(null); }} onSave={createField} />}
    </>
  );
}

/* ── إدارة اللوحات: كل لوحة بإعداداتها وإعدادات مهامها المنفصلة ── */
export function TabBoards({ me, reload, toast, ask }) {
  const [boards, setBoards] = useState(null);
  const [form, setForm] = useState(null);     // { board|null, preset|null }
  const [pick, setPick] = useState(false);    // نافذة اختيار نقطة بداية لوحة جديدة
  const [from, setFrom] = useState('');
  const load = async () => { try { setBoards(await api('GET', '/api/boards')); } catch (e) { toast(e.message, 'err'); } };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!boards) return null;

  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= boards.length) return;
    const a = boards[i], b = boards[j];
    try {
      await api('PATCH', '/api/boards/' + a.id, { position: j });
      await api('PATCH', '/api/boards/' + b.id, { position: i });
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const duplicate = b => { window.location.href = withBase('/boards?dup=' + b.id); };
  const remove = b => ask({ title: 'حذف اللوحة', text: `ستُحذف لوحة «${b.name}» وإعداداتها فقط؛ المهام لا تتأثر.`, ok: 'حذف',
    onOk: async () => { await api('DELETE', '/api/boards/' + b.id); toast('تم حذف اللوحة'); load(); } });
  const vis = b => (b.visibility === 'MEMBERS' ? `أشخاص محدّدون (${(b.members || []).length})` : 'كل الشركة');

  return (
    <>
      <div className="notice" style={{ margin: '0 0 12px' }}>
        <b>إدارة اللوحات:</b> كل لوحة لها <b>أعمدتها وحالاتها وشكل بطاقتها ومسمياتها وحقول مهامها وتخطيطها وصلاحيات الوصول إليها</b> منفصلة تماماً عن غيرها. أنشئ لوحة لكل قسم (عروض الأسعار، الميديا، المبيعات…) وتحكّم بكل شيء فيها. صلاحية إدارة اللوحات تُمنح من الإعدادات ← الصلاحيات («إدارة اللوحات»).
      </div>
      <div className="toolbar" style={{ margin: '0 0 12px' }}>
        <h3 style={{ margin: 0 }}>اللوحات ({boards.length})</h3><span className="grow" />
        <button className="btn" onClick={() => { setFrom(''); setPick(true); }}>＋ لوحة جديدة</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الترتيب</th><th>اللوحة</th><th>الأعمدة</th><th>من يصل إليها</th><th>حقول خاصة</th><th /></tr></thead>
          <tbody>
            {boards.map((b, i) => (
              <tr key={b.id}>
                <td className="nowrap">
                  <button className="btn sm ghost" disabled={!i} aria-label="أعلى" onClick={() => move(i, -1)}>↑</button>{' '}
                  <button className="btn sm ghost" disabled={i >= boards.length - 1} aria-label="أسفل" onClick={() => move(i, 1)}>↓</button>
                </td>
                <td><span className="jp-ico bsw-ico" aria-hidden="true" style={{ background: ((b.detail || {}).icon || {}).c || '#e5484d', marginInlineEnd: 8 }}><FIcon n={((b.detail || {}).icon || {}).k || 'layout'} size={13} /></span><b>{b.name}</b></td>
                <td>{b.autoColumns ? 'حالات الشركة' : (b.columns || []).map(c => c.name || c.status).join(' ‹ ')}</td>
                <td>{vis(b)}</td>
                <td>{(b.fields || []).length}</td>
                <td className="nowrap">
                  <button className="btn sm" onClick={() => { window.location.href = withBase('/boards?id=' + b.id); }}>تخصيص اللوحة</button>{' '}
                  <button className="btn sm ghost" onClick={() => duplicate(b)}>تكرار</button>{' '}
                  {boards.length > 1 && <button className="btn sm danger" onClick={() => remove(b)}>حذف</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>«تخصيص اللوحة» يفتح صفحة كاملة بكل شيء: الأعمدة، البطاقة، الصلاحيات، الحقول، تخطيط المهمة لكل نوع، المسميات، والإخفاء.</p>

      {pick && (
        <Modal title="لوحة جديدة" onClose={() => setPick(false)}>
          <p className="muted" style={{ marginTop: 6 }}>من أين تبدأ؟</p>
          <label className="field"><span>نقطة البداية</span>
            <select value={from} onChange={e => setFrom(e.target.value)}>
              <option value="">لوحة فارغة (بحالات الشركة)</option>
              {boards.map(b => <option key={b.id} value={b.id}>نسخة من «{b.name}» بكل إعداداتها</option>)}
            </select></label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setPick(false)}>إلغاء</button>
            <button type="button" className="btn" onClick={() => { const b = boards.find(x => String(x.id) === String(from)); setPick(false); window.location.href = withBase(b ? '/boards?dup=' + b.id + '&blank=1' : '/boards?new=1'); }}>متابعة</button>
          </div>
        </Modal>
      )}

    </>
  );
}