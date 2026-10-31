'use client';
/* المساحات (Spaces): قائمة المساحات + إنشاء مساحة بخلفية، وصفحة إعدادات كل مساحة:
   عام (الاسم والخلفية) · اللوحات (لوحات المساحة وسير عمل كل لوحة) · عناصر العمل (حقول مهام المساحة) · الصلاحيات (من يرى ويحرّك ويعدّل، وإخفاء لوحة عن شخص). */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ROLE } from '../lib/constants';
import { CF_TYPE_AR } from '../lib/tasks';
import { CAPS, PRESETS, RECOMMENDED, capsOf, presetKeyOf, valueFromCaps } from '../lib/spacePerms';
import { Avatar, Modal } from './ui';
import { FIcon } from './Icon';
import { withBase } from '@/lib/base';

export const BG_PRESETS = [
  { v: '#1D3557', n: 'كحلي' }, { v: '#0B5D5E', n: 'زمردي' }, { v: '#5B3A8C', n: 'بنفسجي' }, { v: '#8C2F39', n: 'عنابي' },
  { v: '#3A3F47', n: 'فحمي' }, { v: '#2E6B3F', n: 'أخضر' },
  { v: 'linear-gradient(135deg,#0F2027,#2C5364)', n: 'محيط' }, { v: 'linear-gradient(135deg,#42275A,#734B6D)', n: 'غروب' },
  { v: 'linear-gradient(135deg,#134E5E,#71B280)', n: 'غابة' }, { v: 'linear-gradient(135deg,#C33764,#1D2671)', n: 'شفق' },
  { v: 'linear-gradient(135deg,#232526,#414345)', n: 'رماد' }, { v: 'linear-gradient(135deg,#1E3C72,#2A5298)', n: 'أزرق ملكي' },
];

/* قيمة الخلفية → خاصية CSS background */
export const bgCss = v => (!v ? '' : v.startsWith('data:') || v.startsWith('/') ? `center / cover no-repeat url("${v}")` : v);

/* نسخة الوضع الفاتح من الخلفية: نفس الألوان لكن مفتّحة (ممزوجة بالأبيض) ليبقى النص الداكن مقروءاً؛ الصور يُغطّيها حجاب أبيض شفاف */
const tint = (hex, k) => { const n = parseInt(hex.slice(1), 16); const m = c => Math.round(c + (255 - c) * k); return '#' + [m(n >> 16), m((n >> 8) & 255), m(n & 255)].map(x => x.toString(16).padStart(2, '0')).join(''); };
export const bgCssThemed = (v, light) => {
  if (!v || !light) return bgCss(v);
  if (v.startsWith('data:') || v.startsWith('/')) return `linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)), ${bgCss(v)}`;
  return v.replace(/#[0-9a-fA-F]{6}/g, h => tint(h, 0.8));
};
/* يصغّر الصورة المرفوعة ويحوّلها لـ data URL بحجم مناسب */
function imageToData(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      for (let q = 0.7; q >= 0.2; q -= 0.1) {
        const out = c.toDataURL('image/jpeg', q);
        if (out.length < 190000) return resolve(out);
      }
      reject(new Error('الصورة كبيرة جداً، اختر صورة أصغر'));
    };
    img.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    img.src = url;
  });
}

/* يحلّل تدرّجاً بسيطاً linear-gradient(135deg,#a,#b[,#c]) إلى أجزائه */
function parseGrad(v) {
  const m = /^linear-gradient\((\d{1,3})deg,\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})(?:\s*,\s*(#[0-9a-fA-F]{6}))?\)$/.exec(v || '');
  return m ? { a: +m[1], c1: m[2], c2: m[3], c3: m[4] || null } : null;
}

export function BgPicker({ value, onChange }) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value || '');
  const [g, setG] = useState(() => parseGrad(value) || { a: 135, c1: '#1e3c72', c2: '#2a5298', c3: null });
  const push = n => { setG(n); onChange(`linear-gradient(${n.a}deg,${n.c1},${n.c2}${n.c3 ? ',' + n.c3 : ''})`); };
  const isGrad = !!parseGrad(value);
  return (
    <div className="sp-bg">
      <div className="sp-swatches">
        <button type="button" className={`sp-sw none ${!value ? 'on' : ''}`} onClick={() => onChange(null)} title="بدون خلفية">∅</button>
        {BG_PRESETS.map(p => (
          <button type="button" key={p.v} className={`sp-sw ${value === p.v ? 'on' : ''}`} style={{ background: p.v }} title={p.n} aria-label={p.n} onClick={() => { onChange(p.v); const pg = parseGrad(p.v); if (pg) setG(pg); }} />
        ))}
      </div>
      <div className="sp-grad">
        <b className="small">تدرّج لوني مخصّص</b>
        <div className="sp-grad-row">
          <label className="sp-gc"><span>اللون 1</span><input type="color" value={g.c1} onChange={e => push({ ...g, c1: e.target.value })} /></label>
          <label className="sp-gc"><span>اللون 2</span><input type="color" value={g.c2} onChange={e => push({ ...g, c2: e.target.value })} /></label>
          {g.c3
            ? <label className="sp-gc"><span>اللون 3</span><input type="color" value={g.c3} onChange={e => push({ ...g, c3: e.target.value })} /></label>
            : null}
          <button type="button" className="btn ghost sm" onClick={() => push({ ...g, c3: g.c3 ? null : '#0b1b3a' })}>{g.c3 ? 'إزالة اللون 3' : '＋ لون ثالث'}</button>
        </div>
        <label className="sp-ang"><span>الاتجاه ({g.a}°)</span>
          <input type="range" min="0" max="360" step="5" value={g.a} onChange={e => push({ ...g, a: +e.target.value })} /></label>
        <div className="sp-dirs">
          {[[90, '→'], [135, '↘'], [180, '↓'], [225, '↙'], [270, '←'], [315, '↖'], [0, '↑'], [45, '↗']].map(([a, l]) => <button type="button" key={a} className={`sp-dir ${g.a === a ? 'on' : ''}`} onClick={() => push({ ...g, a })} aria-label={a + '°'}>{l}</button>)}
          <button type="button" className="btn ghost sm" onClick={() => push({ ...g, c1: g.c2, c2: g.c1 })}>⇄ عكس الألوان</button>
        </div>
        {!isGrad && <p className="muted small">اضغط أي لون/اتجاه لتطبيق التدرّج.</p>}
      </div>
      <div className="sp-bg-row">
        <label className="field sp-color"><span>لون مصمت</span>
          <input type="color" value={isHex ? value : '#1d3557'} onChange={e => onChange(e.target.value.toUpperCase())} /></label>
        <label className="btn ghost sm sp-upload"><FIcon n="image" size={14} /> رفع صورة خلفية
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            try { onChange(await imageToData(f)); } catch (ex) { window.alert(ex.message); }
          }} /></label>
      </div>
      <div className="sp-preview" style={{ background: bgCss(value) || 'var(--panel-2)' }}><span>معاينة الخلفية</span></div>
    </div>
  );
}
const LEVEL_AR = { '': 'افتراضي (حسب الصلاحيات العامة)', NONE: 'مخفي — لا يرى مهام المساحة', VIEW: 'عرض فقط', MOVE: 'عرض + تحريك المهام', EDIT: 'تحكّم كامل (إنشاء وتعديل وحذف)' };

/* ───────────── قائمة المساحات + إنشاء ───────────── */
export function SpacesHome({ me, toast }) {
  const [spaces, setSpaces] = useState(null);
  const [form, setForm] = useState(null);
  const load = useCallback(async () => { try { setSpaces(await api('GET', '/api/spaces')); } catch (e) { toast(e.message, 'err'); } }, [toast]);
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!spaces) return null;
  const canMake = spaces.length ? spaces[0].canManage : (me.perms || []).some(p => p === 'admin' || p === 'boards.manage');

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const r = await api('POST', '/api/spaces', { name: form.name.trim(), key: form.key ? form.key.trim().toUpperCase() : undefined, background: form.background || null });
      window.location.href = withBase('/spaces?id=' + r.id);
    } catch (ex) { toast(ex.message, 'err'); }
  }

  return (
    <>
      <div className="notice" style={{ margin: '0 0 12px' }}>
        <b>إعدادات المساحة:</b> المساحة = مشروع مستقل له <b>خلفيته ولوحاته وسير عمل كل لوحة وحقول مهامه وصلاحياته</b>. أنشئ مساحة، ثم ادخل إعداداتها لإضافة اللوحات وتحديد الحقول ومن يرى ويحرّك المهام.
      </div>
      <div className="toolbar" style={{ margin: '0 0 12px' }}>
        <h3 style={{ margin: 0 }}>المساحات ({spaces.length})</h3><span className="grow" />
        {canMake && <button className="btn" onClick={() => setForm({ name: '', key: '', background: BG_PRESETS[0].v })}>＋ مساحة جديدة</button>}
      </div>
      <div className="sp-grid">
        {spaces.map(s => (
          <div className="sp-card" key={s.id}>
            <div className="sp-cover" style={{ background: bgCss(s.background) || 'var(--panel-2)' }}><b>{s.key}</b></div>
            <div className="sp-body">
              <h4>{s.name}</h4>
              <p className="muted small">{s.boards.length} لوحة · {s.fields.length} حقل مخصّص</p>
              <div className="sp-acts">
                <a className="btn sm ghost" href={'/tasks?space=' + s.id}>فتح المهام</a>
                {s.canManage && <a className="btn sm" href={'/spaces?id=' + s.id}>إعدادات المساحة</a>}
              </div>
            </div>
          </div>
        ))}
        {!spaces.length && <p className="muted">لا توجد مساحات بعد. أنشئ أول مساحة.</p>}
      </div>
      {form && (
        <Modal title="مساحة جديدة" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <label className="field"><span>اسم المساحة</span><input autoFocus required maxLength={120} value={form.name} placeholder="مثال: التسويق، المبيعات" onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>مفتاح المساحة (بادئة أرقام المهام، اختياري)</span><input dir="ltr" maxLength={10} value={form.key} placeholder="MKT" onChange={e => setForm({ ...form, key: e.target.value.toUpperCase() })} /></label>
            <div className="field"><span>الخلفية</span><BgPicker value={form.background} onChange={v => setForm({ ...form, background: v })} /></div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setForm(null)}>إلغاء</button>
              <button className="btn">إنشاء</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ───────────── إعدادات مساحة واحدة ───────────── */
const TABS = [['general', 'عام'], ['boards', 'اللوحات وسير العمل'], ['items', 'عناصر العمل (الحقول)'], ['perms', 'الصلاحيات']];

export function SpaceDetail({ me, id, toast, ask, reloadMe }) {
  const [space, setSpace] = useState(null);
  const [boards, setBoards] = useState([]);
  const [dir, setDir] = useState([]);
  const [tab, setTab] = useState('general');
  const [bform, setBform] = useState(null);
  const load = useCallback(async () => {
    try {
      const [sp, bs, ds] = await Promise.all([api('GET', '/api/spaces'), api('GET', '/api/boards'), api('GET', '/api/directory').catch(() => [])]);
      setSpace(sp.find(x => x.id === id) || false); setBoards(bs.filter(b => (b.filters || {}).projectId === id)); setDir(ds);
    } catch (e) { toast(e.message, 'err'); }
  }, [id, toast]);
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (space === null) return null;
  if (space === false) return <div className="notice">المساحة غير موجودة. <a href="/spaces">كل المساحات</a></div>;

  return (
    <>
      <div className="sp-head" style={{ background: bgCss(space.background) || 'var(--panel-2)' }}>
        <div><small>إعدادات المساحة</small><h2>{space.name} <span className="sp-key">{space.key}</span></h2></div>
        <span className="grow" />
        <a className="btn sm ghost" href="/spaces">كل المساحات</a>
        <a className="btn sm" href={'/tasks?space=' + space.id}>فتح المهام</a>
      </div>
      <div className="toolbar"><div className="seg wrap">{TABS.map(([k, l]) => <button key={k} className={k === tab ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div></div>
      {tab === 'general' && <GeneralTab space={space} toast={toast} ask={ask} onSaved={load} />}
      {tab === 'boards' && <BoardsTab space={space} boards={boards} me={me} toast={toast} ask={ask} bform={bform} setBform={setBform} reload={load} reloadMe={reloadMe} />}
      {tab === 'items' && <ItemsTab space={space} toast={toast} onSaved={load} />}
      {tab === 'perms' && <PermsTab space={space} boards={boards} dir={dir} toast={toast} onSaved={load} />}
    </>
  );
}

function GeneralTab({ space, toast, ask, onSaved }) {
  const [f, setF] = useState({ name: space.name, key: space.key || '', description: space.description || '', background: space.background || null });
  async function save(e) {
    e.preventDefault();
    try { await api('PATCH', '/api/spaces/' + space.id, { name: f.name.trim(), key: f.key.trim().toUpperCase() || undefined, description: f.description.trim() || null, background: f.background || null }); toast('تم الحفظ'); onSaved(); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  return (
    <form className="card" onSubmit={save}>
      <div className="row2">
        <label className="field"><span>اسم المساحة</span><input required maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>المفتاح (بادئة أرقام المهام)</span><input dir="ltr" maxLength={10} value={f.key} onChange={e => setF({ ...f, key: e.target.value.toUpperCase() })} /></label>
      </div>
      <label className="field"><span>وصف (اختياري)</span><textarea rows={2} maxLength={4000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <div className="field"><span>الخلفية</span><BgPicker value={f.background} onChange={v => setF({ ...f, background: v })} /></div>
      <div className="toolbar" style={{ marginTop: 14 }}>
        <button className="btn">حفظ</button><span className="grow" />
        <button type="button" className="btn danger" onClick={() => ask({ title: 'حذف المساحة', text: `ستُحذف مساحة «${space.name}»؛ المهام تبقى بدون مساحة واللوحات تبقى كما هي.`, ok: 'حذف',
          onOk: async () => { await api('DELETE', '/api/spaces/' + space.id); window.location.href = withBase('/spaces'); } })}>حذف المساحة</button>
      </div>
    </form>
  );
}

function BoardsTab({ space, boards, me, toast, ask, bform, setBform, reload, reloadMe }) {
  const remove = b => ask({ title: 'حذف اللوحة', text: `ستُحذف لوحة «${b.name}» وإعداداتها فقط؛ المهام لا تتأثر.`, ok: 'حذف',
    onOk: async () => { await api('DELETE', '/api/boards/' + b.id); toast('تم حذف اللوحة'); reload(); } });
  return (
    <>
      <div className="notice" style={{ margin: '0 0 12px' }}>لكل لوحة <b>أعمدتها (سير العمل)</b> وأسماؤها وألوانها وحدود العمل، وحقولها ومسمياتها وشكل بطاقتها. لوحات هذه المساحة تعرض مهام المساحة فقط.</div>
      <div className="toolbar" style={{ margin: '0 0 12px' }}>
        <h3 style={{ margin: 0 }}>لوحات «{space.name}» ({boards.length})</h3><span className="grow" />
        <a className="btn" href={'/boards?new=1&space=' + space.id}>＋ لوحة جديدة</a>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>اللوحة</th><th>سير العمل (الأعمدة)</th><th /></tr></thead>
          <tbody>
            {boards.map(b => (
              <tr key={b.id}>
                <td><b>{b.name}</b></td>
                <td>{b.autoColumns ? 'حالات الشركة' : (b.columns || []).map(c => c.name || c.status).join(' ‹ ')}</td>
                <td className="nowrap">
                  <a className="btn sm" href={'/boards?id=' + b.id}>تخصيص اللوحة وسير العمل</a>{' '}
                  <button className="btn sm danger" onClick={() => remove(b)}>حذف</button>
                </td>
              </tr>
            ))}
            {!boards.length && <tr><td colSpan={3} className="muted">لا توجد لوحات في هذه المساحة بعد.</td></tr>}
          </tbody>
        </table>
      </div>

    </>
  );
}

function ItemsTab({ space, toast, onSaved }) {
  const [fields, setFields] = useState(() => space.fields.map(f => ({ ...f, options: f.options ? [...f.options] : undefined })));
  const set = (i, patch) => setFields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  async function save() {
    for (const f of fields) {
      if (!String(f.name || '').trim()) { toast('لكل حقل اسم', 'err'); return; }
      if ((f.type === 'select' || f.type === 'multiselect') && !(f.options || []).filter(o => o.trim()).length) { toast('أضف خياراً واحداً على الأقل للحقل «' + f.name + '»', 'err'); return; }
    }
    try {
      await api('PATCH', '/api/spaces/' + space.id, { fields: fields.map(f => ({ key: f.key, name: String(f.name).trim(), type: f.type, section: f.section || 'side', card: !!f.card,
        ...((f.type === 'select' || f.type === 'multiselect') ? { options: (f.options || []).map(o => o.trim()).filter(Boolean) } : {}) })) });
      toast('تم حفظ الحقول'); onSaved();
    } catch (ex) { toast(ex.message, 'err'); }
  }
  return (
    <div className="card">
      <p className="muted small">الحقول التي تضيفها هنا تظهر في <b>مهام هذه المساحة فقط</b> (نافذة المهمة ونموذج الإنشاء). تقدر لاحقاً ترتيبها وإخفاءها لكل نوع من «تخصيص اللوحة» ← تخطيط حقول المهمة.</p>
      {fields.map((f, i) => (
        <div className="bf-fld bf-own" key={f.key}>
          <input className="input bf-fname" maxLength={60} value={f.name} placeholder="اسم الحقل" onChange={e => set(i, { name: e.target.value })} />
          <select className="input bf-ftype" value={f.type} onChange={e => set(i, { type: e.target.value })}>
            {Object.entries(CF_TYPE_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="input bf-fsec" value={f.section === 'main' ? 'main' : 'side'} onChange={e => set(i, { section: e.target.value })}>
            <option value="main">أساسي</option><option value="side">جانبي</option></select>
          <label className="bf-eye" title="يظهر على بطاقة اللوحة"><input type="checkbox" checked={!!f.card} onChange={e => set(i, { card: e.target.checked })} /><span>بطاقة</span></label>
          <button type="button" className="tb-btn" aria-label="حذف الحقل" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}><FIcon n="x" size={14} /></button>
          {(f.type === 'select' || f.type === 'multiselect') && (
            <textarea className="input bf-fopts" rows={2} placeholder="الخيارات (خيار بكل سطر)" value={(f.options || []).join('\n')} onChange={e => set(i, { options: e.target.value.split('\n') })} />
          )}
        </div>
      ))}
      {!fields.length && <p className="muted">لا توجد حقول بعد.</p>}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={() => setFields(fs => [...fs, { key: 'sf' + Math.random().toString(36).slice(2, 9), name: '', type: 'text', section: 'side', card: false }])}>＋ حقل جديد</button>
        <span className="grow" /><button type="button" className="btn" onClick={save}>حفظ الحقول</button>
      </div>
    </div>
  );
}

/* محرّر قيمة صلاحية واحدة: حزمة جاهزة + خصائص مخصّصة يضيفها المدير لهذا الدور/الشخص */
function PermEntry({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const key = presetKeyOf(value), caps = capsOf(value) || [];
  const toggleCap = c => { const n = caps.includes(c) ? caps.filter(x => x !== c) : [...caps, c]; onChange(valueFromCaps(n)); };
  return (
    <div className="pe">
      <div className="pe-row">
        <select value={key} onChange={e => { const v = e.target.value; if (v === '') onChange(null); else if (v === 'CUSTOM') { onChange({ caps }); setOpen(true); } else onChange(v); }}>
          <option value="">افتراضي (حسب الصلاحيات العامة)</option>
          {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="CUSTOM">مخصّص…</option>
        </select>
        {key !== '' && <button type="button" className="btn ghost sm" onClick={() => setOpen(o => !o)}>{open ? 'إخفاء الخصائص' : `الخصائص (${caps.length})`}</button>}
      </div>
      {open && key !== '' && (
        <div className="pe-caps">
          {CAPS.map(([c, l]) => <label className="check" key={c}><input type="checkbox" checked={caps.includes(c)} onChange={() => toggleCap(c)} /> {l}</label>)}
        </div>
      )}
    </div>
  );
}

/* محرّر الصلاحيات (متحكَّم به): اختيار الأشخاص يدوياً وإضافتهم بحزمة وتعديل خصائص كل واحد. value = { users, roles } */
export function PermsEditor({ value, onChange, dir }) {
  const users = value.users || {}, roles = value.roles || {};
  const [pick, setPick] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [bulk, setBulk] = useState('EDITOR');
  const setMap = (which, k, v) => {
    const cur = { ...(value[which] || {}) };
    if (v != null && v !== '') cur[k] = v; else delete cur[k];
    onChange({ ...value, [which]: cur });
  };
  const nameOf = id => ((dir.find(u => u.id === +id) || {}).name) || '#' + id;
  const candidates = dir.filter(u => !(String(u.id) in users) && (!q.trim() || (u.name + ' ' + (u.title || '')).toLowerCase().includes(q.trim().toLowerCase())));
  const togglePick = id => setPick(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addPicked = () => {
    const cur = { ...users }; pick.forEach(id => { cur[String(id)] = bulk; });
    onChange({ ...value, users: cur }); setPick(new Set());
  };
  return (
    <>
      <div className="notice" style={{ margin: '0 0 12px' }}>
        <b>أضف الأشخاص بنفسك</b> واختر لكل شخص حزمة جاهزة (مدير اللوحة، مدير قسم، محرّر، محرّك مهام، معلّق، مشاهد، مخفي) أو عدّل <b>خصائصه</b> واحدة واحدة. من تضيفه هنا يرى اللوحة ومهامها حسب خصائصه. صلاحية الشخص تتفوّق على صلاحية دوره.
      </div>

      <div className="card">
        <h3>الأشخاص ({Object.keys(users).length})</h3>
        {Object.keys(users).map(id => (
          <div className="perm-row" key={id}>
            <div className="who"><Avatar name={nameOf(id)} size={26} /> <b>{nameOf(id)}</b></div>
            <span className="row-inline"><PermEntry value={users[id]} onChange={v => setMap('users', id, v)} />
              <button type="button" className="tb-btn" aria-label="إزالة" onClick={() => setMap('users', id, null)}><FIcon n="x" size={14} /></button></span>
          </div>
        ))}
        {!Object.keys(users).length && <p className="muted small">لم تُضف أحداً بعد. اختر الأشخاص من القائمة بالأسفل.</p>}

        <div className="pp-add">
          <b className="small">إضافة أشخاص</b>
          <input className="input" placeholder="ابحث بالاسم أو المسمى…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="pp-list">
            {candidates.map(u => (
              <label className="pp-item" key={u.id}><input type="checkbox" checked={pick.has(u.id)} onChange={() => togglePick(u.id)} />
                <Avatar name={u.name} size={24} /><span>{u.name}</span>{u.title && <small className="muted">{u.title}</small>}</label>
            ))}
            {!candidates.length && <p className="muted small" style={{ padding: 8 }}>لا يوجد المزيد.</p>}
          </div>
          <div className="toolbar" style={{ margin: 0 }}>
            <select value={bulk} onChange={e => setBulk(e.target.value)}>{PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
            <button type="button" className="btn sm" disabled={!pick.size} onClick={addPicked}>＋ إضافة المحدّدين ({pick.size})</button>
            <button type="button" className="btn ghost sm" onClick={() => setPick(new Set(candidates.map(u => u.id)))}>تحديد الكل</button>
          </div>
        </div>
      </div>

    </>
  );
}

/* نسخة بزر حفظ مستقل (للاستعمال القديم) */
export function PermsTab({ space, boards = [], dir, toast, onSaved, embedded = false }) {
  const [val, setVal] = useState(() => ({ users: { ...((space.perms || {}).users || {}) }, roles: { ...((space.perms || {}).roles || {}) } }));
  async function save() {
    try { await api('PATCH', '/api/spaces/' + space.id, { perms: val }); toast('تم حفظ الصلاحيات'); onSaved(); } catch (ex) { toast(ex.message, 'err'); }
  }
  return (
    <>
      <PermsEditor value={val} onChange={setVal} dir={dir} />
      <div className="toolbar" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={save}>حفظ صلاحيات المهام</button></div>
      {!embedded && <h3 className="section-title">إخفاء لوحة عن أشخاص</h3>}
      {!embedded && boards.map(b => <HideBoard key={b.id} board={b} dir={dir} toast={toast} onSaved={onSaved} />)}
    </>
  );
}
function HideBoard({ board, dir, toast, onSaved }) {
  const [list, setList] = useState(() => ((board.detail || {}).hiddenFor || []).slice());
  const [pick, setPick] = useState('');
  async function persist(next) {
    try {
      await api('PATCH', '/api/boards/' + board.id, { detail: { ...(board.detail || {}), hiddenFor: next } });
      setList(next); toast('تم الحفظ'); onSaved();
    } catch (ex) { toast(ex.message, 'err'); }
  }
  const nameOf = id => ((dir.find(u => u.id === id) || {}).name) || '#' + id;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b>{board.name}</b>
      <div className="pills" style={{ margin: '8px 0' }}>
        {list.map(id => <span className="pill" key={id}>{nameOf(id)} <button type="button" aria-label="إظهار" onClick={() => persist(list.filter(x => x !== id))}><FIcon n="x" size={12} /></button></span>)}
        {!list.length && <span className="muted small">ظاهرة للجميع.</span>}
      </div>
      <div className="toolbar">
        <select value={pick} onChange={e => setPick(e.target.value)}><option value="">— إخفاء عن —</option>{dir.filter(u => !list.includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button type="button" className="btn ghost sm" disabled={!pick} onClick={() => { persist([...list, +pick]); setPick(''); }}>إخفاء</button>
      </div>
    </div>
  );
}
