'use client';
/* إعدادات اللوحة: أعمدة + بطاقة + صلاحيات + حقول + مسميات — ترحيل boardForm (tasks-pro.js). */
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { STATUS, PRIORITY } from '../lib/constants';
import { BOARD_CARD_FIELDS, CF_TYPE_AR, CORE_KEYS, FL_KEYS, ITYPE } from '../lib/tasks';
import { Avatar, Modal } from './ui';
import TypeLayoutEditor from './TypeLayoutEditor';
import WorkflowEditor from './WorkflowEditor';
import { BOARD_ICONS, BOARD_ICON_COLORS, FIcon } from './Icon';
import { BgPicker, PermsEditor } from './SpaceSettings';
import { withBase } from '@/lib/base';

const ROLE_AR = { VIEW: 'عارض', EDIT: 'محرّر', MANAGE: 'مدير اللوحة' };

export const BOARD_SECS = [
  ["general", "عام"], ["columns", "الأعمدة وسير العمل"], ["card", "شكل البطاقة"], ["access", "الوصول والصلاحيات"],
  ["layout", "تخطيط حقول المهمة"], ["names", "مسميات الأنواع والأولويات"],
];

export default function BoardForm({ me, board, preset, boards, onClose, onSaved, onDeleted, onError, reloadMe, asPage = false }) {
  const isNew = !board;
  const src = board || (preset ? { autoColumns: false, columns: Object.keys(STATUS).map(k => ({ status: k })), card: { fields: {}, custom: [], density: 'comfortable', color: 'none' }, labels: {}, ...preset, name: preset.name || '', visibility: 'ALL', members: [] } : { name: '', autoColumns: false, columns: Object.keys(STATUS).map(k => ({ status: k })), filters: {}, card: { fields: {}, custom: [], density: 'comfortable', color: 'none' }, labels: {} });
  const st = me.org.settings || {};
  const card0 = src.card || {};
  const [ext, setExt] = useState(null);   // { projects, directory }
  const [name, setName] = useState(src.name);
  const [projectId, setProjectId] = useState((src.filters || {}).projectId || '');
  const [skey, setSkey] = useState('');        // بادئة أرقام المهام (مفتاح المساحة المرتبطة)
  const [sbg, setSbg] = useState(null);        // خلفية اللوحة (تُحفظ على مساحتها)
  const [perms, setPerms] = useState({ users: {}, roles: {} });   // صلاحيات الأشخاص والأدوار (تُحفظ على مساحة اللوحة)
  const origPerms = useRef('{"users":{},"roles":{}}');
  const [issueTypes, setIssueTypes] = useState(() => new Set((src.filters || {}).issueTypes || []));
  const [cols, setCols] = useState(() => (src.autoColumns ? Object.keys(STATUS).map(k => ({ status: k })) : (src.columns || [])).map(c => ({ ...c, _id: c.status })));
  const [transitions, setTransitions] = useState(() => ((src.detail || {}).transitions || []).map(t => ({ ...t })));
  const [wfPos, setWfPos] = useState(() => ({ ...((src.detail || {}).wfPos || {}) }));
  const [cardFields, setCardFields] = useState(() => Object.fromEntries(Object.keys(BOARD_CARD_FIELDS).map(k => [k, (card0.fields || {})[k] !== false])));
  const [cardCustom, setCardCustom] = useState(() => new Set(card0.custom || []));
  const [density, setDensity] = useState(card0.density === 'compact' ? 'compact' : 'comfortable');
  const [color, setColor] = useState(card0.color || 'none');
  const [rules, setRules] = useState(() => (card0.rules || []).map(r => ({ ...r })));
  const [daysIn, setDaysIn] = useState(card0.daysInColumn === true);
  const [dragKey, setDragKey] = useState(null);
  const [visibility, setVisibility] = useState(src.visibility || 'ALL');
  const [members, setMembers] = useState(() => (src.members || []).map(x => ({ ...x })));
  const [memSel, setMemSel] = useState('');
  const [memRole, setMemRole] = useState('EDIT');
  const [btypes, setBtypes] = useState(() => JSON.parse(JSON.stringify((src.detail || {}).types || [])));   // أنواع مهام خاصة بهذه اللوحة
  const [prios, setPrios] = useState(() => JSON.parse(JSON.stringify((src.detail || {}).priorities || [])));
  const [hide, setHide] = useState(() => new Set([...((src.detail || {}).hide || []), ...(!board && !(preset && preset.detail) ? Object.keys(ITYPE).map(k => 'it:' + k) : [])]));   // اللوحة الجديدة تبدأ بلا أنواع جاهزة: تنشئ أنواعها بنفسك
  const [order, setOrder] = useState(() => {
    const o = ((src.detail || {}).order || []).filter(k => CORE_KEYS.includes(k));
    CORE_KEYS.forEach(k => { if (!o.includes(k)) o.push(k); });
    return o;
  });
  const [lab, setLab] = useState(() => ({ ...(src.labels || {}) }));
  const [tl, setTl] = useState(() => JSON.parse(JSON.stringify((src.detail || {}).typeLayouts || {})));
  const [bfields, setBfields] = useState(() => (src.fields || []).map(f => ({ ...f, options: f.options ? [...f.options] : undefined })));
  const [icon, setIcon] = useState(() => ({ k: 'layout', c: '#e5484d', ...(((src.detail || {}).icon) || {}) }));
  const [sec, setSec] = useState(() => { try { return (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sec')) || 'general'; } catch (_) { return 'general'; } });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(null);   // { go }
  const [baseline, setBaseline] = useState(null);
  const sig = JSON.stringify([name, icon, btypes, projectId, skey, sbg, perms, [...issueTypes], cols, cardFields, [...cardCustom], density, color, rules, daysIn, visibility, members, prios, [...hide], order, lab, tl, bfields, transitions, wfPos]);
  const dirty = baseline !== null && sig !== baseline;
  const bypass = useRef(false);
  const dirtyRef = useRef(false); dirtyRef.current = dirty && !bypass.current;
  /* خط الأساس بعد استقرار الحالة الأولية (تهيئة معرّفات الأعمدة) */
  useEffect(() => { const t = setTimeout(() => setBaseline(b => (b === null ? sigRef.current : b)), 600); return () => clearTimeout(t); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const sigRef = useRef(sig); sigRef.current = sig;
  /* تحذير المغادرة بتغييرات غير محفوظة: إغلاق/تحديث التبويب + الروابط + زر الرجوع بالمتصفح */
  useEffect(() => {
    if (!asPage) return undefined;
    const before = e => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const click = e => {
      if (!dirtyRef.current) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin || (u.pathname === window.location.pathname && u.search === window.location.search)) return;
      e.preventDefault(); e.stopPropagation();
      setLeaveAsk({ go: () => { bypass.current = true; window.location.href = withBase(a.href); } });
    };
    const pop = () => {
      if (dirtyRef.current) { window.history.pushState({ bf: 1 }, ''); setLeaveAsk({ go: () => { bypass.current = true; window.history.go(-2); } }); }
      else window.history.back();
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    window.history.pushState({ bf: 1 }, '');
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('beforeunload', before); document.removeEventListener('click', click, true); window.removeEventListener('popstate', pop); };
  }, [asPage]);
  const leave = fn => { if (dirtyRef.current) setLeaveAsk({ go: () => { bypass.current = true; fn(); } }); else fn(); };

  useEffect(() => {
    Promise.all([api('GET', '/api/spaces').catch(() => []), api('GET', '/api/directory').catch(() => [])]).then(([spaces, directory]) => {
      const sp = spaces.find(x => x.id === +projectId);
      if (sp) {
        setSkey(sp.key || ''); setSbg(sp.background || null);
        const pv = { users: { ...((sp.perms || {}).users || {}) }, roles: { ...((sp.perms || {}).roles || {}) } };
        setPerms(pv); origPerms.current = JSON.stringify(pv);
      }
      else if (preset && preset.spaceKey) setSkey(preset.spaceKey);
      setExt({ spaces, directory });
    });
  }, []);
  if (!ext) return null;
  const { spaces, directory } = ext;
  const space = spaces.find(x => x.id === +projectId) || null;
  const orgDefs = st.customFields || [];
  const statusName = s => STATUS[s] || s;
  const used = new Set(cols.map(c => c.status).filter(Boolean));
  const ownedBy = new Map((st.taskStatuses || []).filter(s => s.board).map(s => [s.key, s.board]));
  const free = Object.keys(STATUS).filter(k => !used.has(k) && (!ownedBy.has(k) || (board && ownedBy.get(k) === board.id)));
  const nameOfUser = id => ((directory.find(u => u.id === id) || {}).name) || ('#' + id);
  const setCol = (i, patch) => setCols(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const swap = (arr, set, i, j) => { const n = arr.slice(); [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const toggleSet = (setter, k) => setter(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setBfByKey = (key, patch) => setBfields(fs => fs.map(f => (f.key === key ? { ...f, ...patch } : f)));
  const deleteField = key => {
    setBfields(fs => fs.filter(f => f.key !== key));
    setTl(ls => Object.fromEntries(Object.entries(ls).map(([t, l]) => [t, { ...l, description: (l.description || []).filter(x => x !== 'cf:' + key), context: (l.context || []).filter(x => x !== 'cf:' + key) }])));
  };
  const setBf = (i, patch) => setBfields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  /* تحويل المعرّفات المحلية إلى مفاتيح حالات؛ الأعمدة الجديدة (بلا حالة بعد) تُترك لحفظ ثانٍ */
  const keyOf = (id, map) => { const c = cols.find(x => x._id === id); return map(c && c.status ? c.status : null, id); };
  const wfOut = (ts, map) => ts.map(t => ({ from: keyOf(t.from, (s, id) => (s || (map(id) !== id ? map(id) : null))), to: keyOf(t.to, (s, id) => (s || (map(id) !== id ? map(id) : null))) })).filter(t => t.from && t.to);
  const posOut = (ps, map) => Object.fromEntries(Object.entries(ps).map(([id, p]) => [keyOf(id, (s, i) => (s || (map(i) !== i ? map(i) : null))), p]).filter(([k]) => k));
  async function submit(e) {
    e.preventDefault();
    setErr(''); setConfirmSave(false);
    if (!cols.length) { setErr('أضف عموداً واحداً على الأقل'); return; }
    for (const f of bfields) {
      if (!String(f.name || '').trim()) { setErr('لكل حقل خاص باللوحة اسم'); return; }
      if (['select', 'multiselect', 'radio'].includes(f.type) && !(f.options || []).length) { setErr('أضف خياراً واحداً على الأقل للحقل «' + f.name + '»'); return; }
    }
    const labels = {};
    Object.entries(lab).forEach(([k, v]) => { if (v && String(v).trim()) labels[k] = String(v).trim(); });
    const body = {
      name: name.trim(),
      columns: cols.map(c => (c.newName !== undefined
        ? { newName: c.newName, ...(c.name ? { name: c.name } : {}), ...(c.color ? { color: c.color } : {}), max: c.max || null, min: c.min || null, ...(c.noCreate ? { noCreate: true } : {}) }
        : { status: c.status, ...(c.name ? { name: c.name } : {}), ...(c.color ? { color: c.color } : {}), max: c.max || null, min: c.min || null, ...(c.noCreate ? { noCreate: true } : {}) })),
      filters: { projectId: projectId ? +projectId : null, issueTypes: [...issueTypes] },
      card: { fields: cardFields, custom: [...cardCustom], density, color, daysInColumn: daysIn, rules: rules.filter(r => r.jql && r.jql.trim()).map(r => ({ jql: r.jql.trim(), color: r.color || '#2f7cf6', name: r.name || undefined })) },
      labels,
      fields: bfields.map(f => ({ key: f.key, name: String(f.name).trim(), type: f.type, section: f.section || 'side', card: !!f.card,
        ...((['select', 'multiselect', 'radio'].includes(f.type)) ? { options: f.options } : {}) })),
      detail: { hide: [...hide], order, icon, types: btypes.filter(t => (t.name || '').trim()).map(t => ({ key: t.key, name: t.name.trim() })), typeLayouts: tl, transitions: wfOut(transitions, x => x), wfPos: posOut(wfPos, x => x), ...(((src.detail || {}).hiddenFor || []).length ? { hiddenFor: (src.detail || {}).hiddenFor } : {}), priorities: prios.filter(p => (p.name || '').trim()).map(p => ({ key: p.key, name: p.name.trim() })) },
      visibility,
      members: visibility === 'MEMBERS' ? members.map(x => ({ userId: x.userId, role: x.role })) : [],
    };
    setBusy(true);
    try {
      /* اللوحة والمساحة كيان واحد للمستخدم: اللوحة الجديدة تُنشئ مساحتها (البادئة والخلفية)، والقديمة تحدّثها */
      let pid = projectId ? +projectId : null;
      if (!pid && (isNew || skey.trim() || sbg)) {
        const sp = await api('POST', '/api/spaces', { name: name.trim(), key: skey.trim() ? skey.trim().toUpperCase() : undefined, background: sbg || null });
        pid = sp.id; body.filters.projectId = pid;
      } else if (pid && space && ((skey.trim() && skey.trim().toUpperCase() !== (space.key || '')) || (sbg || null) !== (space.background || null) || space.name !== name.trim())) {
        await api('PATCH', '/api/spaces/' + pid, { name: name.trim(), ...(skey.trim() ? { key: skey.trim().toUpperCase() } : {}), background: sbg || null });
      }
      if (pid && JSON.stringify(perms) !== origPerms.current) await api('PATCH', '/api/spaces/' + pid, { perms });
      let r = null;
      if (isNew) r = await api('POST', '/api/boards', body); else await api('PATCH', '/api/boards/' + board.id, body);
      /* أعمدة جديدة: بعد إنشاء حالاتها نربط الأسهم والمواضع بمفاتيحها */
      if (cols.some(c => c.newName !== undefined) && (transitions.length || Object.keys(wfPos).length)) {
        const bid = r ? r.id : board.id;
        const fresh = (await api('GET', '/api/boards')).find(b => b.id === bid);
        if (fresh) {
          const m = {}; cols.forEach((c, i) => { if (c.newName !== undefined && fresh.columns[i]) m[c._id] = fresh.columns[i].status; });
          await api('PATCH', '/api/boards/' + bid, { detail: { ...(fresh.detail || {}), transitions: wfOut(transitions, id => m[id] || id), wfPos: posOut(wfPos, id => m[id] || id) } });
        }
      }
      if (reloadMe) await reloadMe();
      setBaseline(sigRef.current); setConfirmSave(false); setBusy(false);
      bypass.current = true;
      onSaved(r ? r.id : board.id);
      setTimeout(() => { bypass.current = false; }, 1500);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  async function del() {
    if (!window.confirm('تُحذف اللوحة فقط، ولا تتأثر المهام. متابعة؟')) return;
    try { await api('DELETE', '/api/boards/' + board.id); bypass.current = true; onDeleted(); } catch (ex) { onError(ex.message); }
  }

  const eye = (on, onChange) => <label className="bf-eye" title="يظهر في هذه اللوحة"><input type="checkbox" checked={on} onChange={onChange} /><span>يظهر</span></label>;

  const formNode = (
      <form onSubmit={e => { e.preventDefault(); setErr(''); setConfirmSave(true); }} noValidate className={asPage ? 'bp-form' : undefined}>
        {asPage && (
          <nav className="bp-nav" aria-label="أقسام التخصيص">
            {BOARD_SECS.map(([k, l]) => <button type="button" key={k} className={sec === k ? 'on' : ''} onClick={() => { setSec(k); try { const u = new URL(window.location.href); u.searchParams.set('sec', k); window.history.replaceState(null, '', u); } catch (_) { /* تجاهل */ } }}>{l}</button>)}
          </nav>
        )}
        <div className={asPage ? 'bp-main' : undefined}>
        <div className="bf-sec" hidden={asPage && sec !== 'general'}><h3>عام</h3>
          <div className="row2">
            <label className="field"><span>اسم اللوحة</span><input value={name} required maxLength={60} placeholder="مثال: مهام التصميم، لوحة المبيعات" onChange={e => setName(e.target.value)} /></label>
            <label className="field"><span>بادئة رقم المهام (مثل MKT)</span>
              <input dir="ltr" maxLength={10} value={skey} placeholder={space ? undefined : 'تلقائي'} onChange={e => setSkey(e.target.value.toUpperCase())} /></label>
          </div>
          <div className="field"><span>خلفية اللوحة</span><BgPicker value={sbg} onChange={setSbg} />
            {!projectId && !isNew && <small className="muted">لوحة قديمة تعرض كل المهام. عند تحديد بادئة أو خلفية سيُنشأ لها نطاق خاص بها وتعرض مهامها فقط.</small>}</div>
          <div className="field"><span>أيقونة اللوحة ولونها</span>
            <div className="bi-pick">
              <span className="jp-ico bi-prev" style={{ background: icon.c }}><FIcon n={icon.k} size={20} /></span>
              <div className="bi-grid">{BOARD_ICONS.map(k => <button type="button" key={k} className={`bi-ic ${icon.k === k ? 'on' : ''}`} aria-label={k} onClick={() => setIcon(i => ({ ...i, k }))}><FIcon n={k} size={18} /></button>)}</div>
              <div className="bi-cols">{BOARD_ICON_COLORS.map(c => <button type="button" key={c} className={`bi-c ${icon.c === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setIcon(i => ({ ...i, c }))} />)}</div>
            </div></div>
          <div className="field"><span>أنواع المهام المعروضة (اتركها فارغة للكل)</span>
            <div className="pick-list">
              {[...Object.entries(ITYPE).filter(([k]) => !hide.has('it:' + k)).map(([k, l]) => [k, lab['it:' + k] || l]),
                ...btypes.filter(t => (t.name || '').trim()).map(t => [t.key, t.name])]
                .map(([k, l]) => <label className="check" key={k}><input type="checkbox" checked={issueTypes.has(k)} onChange={() => toggleSet(setIssueTypes, k)} /> {l}</label>)}
            </div></div>
        </div>

        <div className="bf-sec" hidden={asPage && sec !== 'columns'}><h3>الأعمدة</h3>
          <p className="muted small">كل بلوك = حالة (عمود). اسحبه، سمّه، لوّنه، وارسم الأسهم بين الحالات لتحديد <b>الانتقالات المسموحة</b> (بلا أسهم = حرّ). رتّب الأعمدة وحدود العمل من القائمة تحتها.</p>
          <WorkflowEditor cols={cols} setCols={setCols} transitions={transitions} setTransitions={setTransitions} positions={wfPos} setPositions={setWfPos} statusName={statusName} dirty={dirty} onSave={() => { setErr(''); setConfirmSave(true); }} />
          <h4 className="bf-sub" style={{ marginTop: 16 }}>ترتيب الأعمدة وحدود العمل</h4>
          {cols.map((c, i) => (
            <div className="bf-col" key={i}>
              <button type="button" className="tb-btn" disabled={!i} aria-label="أعلى" onClick={() => swap(cols, setCols, i, i - 1)}>↑</button>
              <button type="button" className="tb-btn" disabled={i >= cols.length - 1} aria-label="أسفل" onClick={() => swap(cols, setCols, i, i + 1)}>↓</button>
              <input className="input bf-name" maxLength={40} value={c.newName !== undefined ? c.newName : (c.name || '')}
                placeholder={c.newName !== undefined ? 'اسم الحالة الجديدة' : statusName(c.status)}
                onChange={e => setCol(i, c.newName !== undefined ? { newName: e.target.value } : { name: e.target.value || undefined })} />
              <span className="muted small bf-st">{c.newName !== undefined ? 'حالة جديدة' : statusName(c.status)}</span>
              <input type="color" className="bf-color" value={c.color || '#2f7cf6'} title="لون العمود" onChange={e => setCol(i, { color: e.target.value })} />
              <input type="number" className="input bf-wip" min="1" max="999" placeholder="الأدنى" title="حدّ أدنى للمهام (WIP) — يصفرّ العدّاد إن نقص" value={c.min || ''} onChange={e => setCol(i, { min: e.target.value ? +e.target.value : null })} />
              <input type="number" className="input bf-wip" min="1" max="999" placeholder="الأعلى" title="حدّ أعلى للمهام (WIP) — يحمرّ العدّاد إن زاد" value={c.max || ''} onChange={e => setCol(i, { max: e.target.value ? +e.target.value : null })} />
              <label className="bf-eye" title="السماح بإنشاء مهام جديدة داخل هذا العمود (زر + بالعمود ومن نموذج الإنشاء)"><input type="checkbox" checked={!c.noCreate} onChange={e => setCol(i, { noCreate: !e.target.checked })} /><span>إنشاء</span></label>
              <button type="button" className="tb-btn" aria-label="حذف العمود" onClick={() => setCols(cs => cs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="bf-add">
            <select className="input" value="" aria-label="إضافة عمود" onChange={e => {
              const v = e.target.value; if (!v) return;
              setCols(cs => [...cs, v === '__new' ? { newName: 'حالة جديدة' } : { status: v }]);
            }}>
              <option value="">＋ إضافة عمود…</option>
              {free.map(k => <option key={k} value={k}>{statusName(k)}</option>)}
              <option value="__new">✚ حالة جديدة باسم من عندي</option>
            </select>
          </div>
        </div>

        <div className="bf-sec" hidden={asPage && sec !== 'card'}><h3>شكل المهام (البطاقة)</h3>
          <div className="pick-list cols">
            {Object.entries(BOARD_CARD_FIELDS).map(([k, l]) => <label className="check" key={k}><input type="checkbox" checked={cardFields[k]} onChange={e => setCardFields({ ...cardFields, [k]: e.target.checked })} /> {l}</label>)}
          </div>
          {orgDefs.length > 0 && (
            <div className="field"><span>حقول مخصصة تظهر على البطاقة</span>
              <div className="pick-list cols">{orgDefs.map(d => <label className="check" key={d.key}><input type="checkbox" checked={cardCustom.has(d.key)} onChange={() => toggleSet(setCardCustom, d.key)} /> {d.name}</label>)}</div></div>
          )}
          <div className="row2">
            <label className="field"><span>الكثافة</span>
              <select value={density} onChange={e => setDensity(e.target.value)}><option value="comfortable">مريحة</option><option value="compact">مضغوطة</option></select></label>
            <label className="field"><span>شريط لوني جانبي حسب</span>
              <select value={color} onChange={e => setColor(e.target.value)}><option value="none">بدون</option><option value="priority">الأولوية</option><option value="type">نوع المهمة</option><option value="assignee">المنفّذ</option><option value="jql">استعلام JQL</option></select></label>
          </div>
          {color === 'jql' && (
            <div className="field"><span>قواعد اللون (تُطبَّق أول قاعدة تطابق)</span>
              {rules.map((r, i) => (
                <div className="bf-rule" key={i}>
                  <input className="input" dir="ltr" placeholder='priority = HIGH AND status != DONE' value={r.jql || ''} onChange={e => setRules(rs => rs.map((x, j) => (j === i ? { ...x, jql: e.target.value } : x)))} />
                  <input type="color" className="bf-color" value={r.color || '#2f7cf6'} onChange={e => setRules(rs => rs.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                  <button type="button" className="tb-btn" aria-label="حذف" onClick={() => setRules(rs => rs.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="jf-addbtn" style={{ marginTop: 6 }} onClick={() => setRules(rs => [...rs, { jql: '', color: '#2f7cf6' }])}>+ قاعدة لون</button>
            </div>
          )}
          <label className="check"><input type="checkbox" checked={daysIn} onChange={e => setDaysIn(e.target.checked)} /> إظهار «أيام في العمود» على البطاقة</label>
        </div>

        <div className="bf-sec" hidden={asPage && sec !== 'access'}><h3>الأشخاص وصلاحياتهم</h3>
          <PermsEditor value={perms} onChange={setPerms} dir={directory} />
        </div>
        <div className="bf-sec" hidden={asPage && sec !== 'layout'}><h3>تخطيط حقول المهمة لكل نوع (خاص بهذه اللوحة)</h3>
          <p className="muted small">كل شي بمكان واحد: أضف الحقول، سمّها، رتّبها، أخفها أو احذفها، لكل نوع مهمة بهذه اللوحة وحدها. الأنواع بلا تخصيص تتبع تخطيط الشركة.</p>
          <TypeLayoutEditor types={[['NONE', 'بدون نوع'], ...Object.entries(ITYPE).filter(([k]) => !hide.has('it:' + k)).map(([k, l]) => [k, (lab['it:' + k] || l)]), ...btypes.filter(t => (t.name || '').trim()).map(t => [t.key, t.name])]} fields={[...(st.customFields || []), ...bfields]} fieldLabels={{ ...(st.fieldLabels || {}), ...lab }}
            compact={!asPage} layouts={tl} setLayouts={setTl} bfields={bfields} setBf={setBfByKey} deleteField={deleteField} lab={lab} setLab={setLab} inherit={st.typeLayouts || {}} toast={m => setErr(m)} ask={o => { if (window.confirm(o.text)) o.onOk(); }}
            onNewField={async preset => {
              const key = 'bf' + Math.random().toString(36).slice(2, 9);
              setBfields(fs => [...fs, { key, name: 'حقل جديد', type: preset, section: 'side', card: false, ...((['select', 'multiselect', 'radio'].includes(preset)) ? { options: ['خيار 1', 'خيار 2'] } : {}) }]);
              return 'cf:' + key;
            }} />
        </div>
        <div className="bf-sec" hidden={asPage && sec !== 'layout'}>
          <details className="bf-more">
            <summary>تسمية الأزرار والتبويبات</summary>
            <p className="muted small">أسماء أزرار نافذة المهمة وتبويبات النشاط. الاسم الفارغ = الافتراضي. أسماء الحقول والأقسام تعدّلها من ✎ في التخطيط أعلاه.</p>
            <div className="row2">
              {['startWork', 'createBtn', 'tabComments', 'tabWorklog', 'tabHistory', 'epicIssues'].map(k => (
                <label className="field" key={k}><span>{FL_KEYS[k]}</span>
                  <input maxLength={40} placeholder={(st.fieldLabels || {})[k] || FL_KEYS[k]} value={lab[k] || ''} onChange={e => setLab({ ...lab, [k]: e.target.value })} />
                  {['startWork', 'tabComments', 'tabWorklog', 'tabHistory'].includes(k) && (
                    <span className="check" style={{ marginTop: 4 }}><input type="checkbox" checked={hide.has(k)} onChange={() => toggleSet(setHide, k)} /> إخفاء</span>
                  )}</label>
              ))}
            </div>
          </details>
        </div>
        <div className="bf-sec" hidden={asPage && sec !== 'names'}><h3>مسميات أنواع المهام والأولويات</h3>
          <h4 className="bf-sub">أنواع المهام</h4>
          <div className="row2">
            {Object.entries(ITYPE).filter(([k]) => !hide.has('it:' + k)).map(([k, l]) => (
              <div className="bf-fld" key={k}><input className="input bf-fname" maxLength={40} placeholder={l} value={lab['it:' + k] || ''} onChange={e => setLab({ ...lab, ['it:' + k]: e.target.value })} />
                <button type="button" className="tb-btn" aria-label="حذف النوع" title="حذف هذا النوع الجاهز من اللوحة" onClick={() => toggleSet(setHide, 'it:' + k)}>✕</button></div>
            ))}
          </div>
          {btypes.map((t, i) => (
            <div className="bf-fld bf-own" key={t.key}>{eye(!hide.has('it:' + t.key), () => toggleSet(setHide, 'it:' + t.key))}
              <input className="input bf-fname" maxLength={40} placeholder="اسم النوع" value={t.name} onChange={e => setBtypes(ts => ts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <button type="button" className="tb-btn" aria-label="حذف النوع" onClick={() => setBtypes(ts => ts.filter((_, j) => j !== i))}>✕</button></div>
          ))}
          <div className="bf-add"><button type="button" className="btn ghost sm" onClick={() => setBtypes(ts => [...ts, { key: 'bt_' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x'), name: 'نوع جديد' }])}>+ نوع جديد لهذه اللوحة</button></div>
          {Object.keys(ITYPE).some(k => hide.has('it:' + k)) && (
            <p className="muted small" style={{ marginTop: 8 }}>أنواع جاهزة محذوفة (اضغط للاستعادة):{' '}
              {Object.entries(ITYPE).filter(([k]) => hide.has('it:' + k)).map(([k, l]) => <button type="button" key={k} className="btn ghost sm" style={{ marginInlineStart: 4 }} onClick={() => toggleSet(setHide, 'it:' + k)}>↩ {l}</button>)}</p>
          )}
          <h4 className="bf-sub">الأولويات</h4>
          <div className="row2">
            {Object.entries(PRIORITY).map(([k, l]) => (
              <div className="bf-fld" key={k}>{eye(!hide.has('pr:' + k), () => toggleSet(setHide, 'pr:' + k))}<input className="input bf-fname" maxLength={40} placeholder={l} value={lab['pr:' + k] || ''} onChange={e => setLab({ ...lab, ['pr:' + k]: e.target.value })} /></div>
            ))}
            {prios.map((p, i) => (
              <div className="bf-fld bf-own" key={p.key}>{eye(!hide.has('pr:' + p.key), () => toggleSet(setHide, 'pr:' + p.key))}
                <input className="input bf-fname" maxLength={40} placeholder="اسم الأولوية" value={p.name} onChange={e => setPrios(ps => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <button type="button" className="tb-btn" aria-label="حذف الأولوية" onClick={() => setPrios(ps => ps.filter((_, j) => j !== i))}>✕</button></div>
            ))}
          </div>
          <div className="bf-add"><button type="button" className="btn ghost sm" onClick={() => setPrios(ps => [...ps, { key: 'bp_' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x'), name: 'أولوية جديدة' }])}>+ أولوية لهذه اللوحة</button></div>
        </div>

        </div>
        <p className="err" role="alert">{err}</p>
        <div className={asPage ? 'bp-actions' : 'modal-actions'}>
          {!isNew && boards.length > 1 && <button type="button" className="btn danger" onClick={del}>حذف اللوحة</button>}
          <button type="button" className="btn ghost" onClick={() => leave(onClose)}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>{isNew ? 'إنشاء اللوحة' : 'حفظ'}</button>
        </div>
      </form>
  );
  const dialogs = (
    <>
      {confirmSave && (
        <Modal title="تأكيد الحفظ" onClose={() => setConfirmSave(false)}>
          <p style={{ margin: '8px 0 16px' }}>{isNew ? 'سيتم إنشاء اللوحة بهذه الإعدادات.' : 'سيتم حفظ كل التغييرات التي أجريتها على هذه اللوحة.'} هل أنت متأكد؟</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmSave(false)}>رجوع</button>
            <button type="button" className="btn" disabled={busy} onClick={() => submit({ preventDefault() {} })}>{busy ? 'جارٍ الحفظ…' : 'نعم، احفظ'}</button>
          </div>
        </Modal>
      )}
      {leaveAsk && (
        <Modal title="تغييرات غير محفوظة" onClose={() => setLeaveAsk(null)}>
          <p style={{ margin: '8px 0 16px' }}>لديك تغييرات لم تُحفظ بعد. إذا غادرت الصفحة الآن ستضيع. هل أنت متأكد أنك تريد المغادرة؟</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setLeaveAsk(null)}>البقاء في الصفحة</button>
            <button type="button" className="btn danger" onClick={() => { const g = leaveAsk.go; setLeaveAsk(null); g(); }}>مغادرة بدون حفظ</button>
          </div>
        </Modal>
      )}
    </>
  );
  if (asPage) return <>{formNode}{dialogs}</>;
  return <><Modal title={isNew ? 'لوحة مهام جديدة' : 'تخصيص اللوحة'} wide onClose={onClose}>{formNode}</Modal>{dialogs}</>;
}
