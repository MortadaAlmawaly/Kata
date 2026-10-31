'use client';
/* محرّر تخطيط حقول المهمة لكل نوع (مثل Issue types ← Fields في Jira) + أقسام مسمّاة يضيفها المستخدم ويعيد تسميتها ويحذفها.
   يُستعمل في إعدادات الشركة (التخطيط الافتراضي) وفي إعدادات كل لوحة (تخطيط خاص بها يتفوّق عليه). */
import { useState } from 'react';
import { CF_TYPE_AR, CORE_KEYS, FL_KEYS, MAIN_SECTIONS, SPECIAL_CONTEXT } from '../lib/tasks';

const ICO_OF = { text: 'Aa', longtext: '¶', date: '📅', number: '#', select: '▾', multiselect: '☰', user: '👤', checkbox: '☑', url: '🔗', money: '💲', percent: '%', rating: '★', datetime: '🕒', time: '⏱', radio: '◉', tags: '🏷', users: '👥', email: '✉', phone: '☎', color: '🎨' };
const isSec = k => k.startsWith('sec:');

/* props:
   types: [[key,label]] · fields: الحقول المخصصة المتاحة · fieldLabels: مسميات الحقول الأساسية
   layouts/setLayouts: { TYPE: {description:[], context:[], sections:{id:name}} }
   onNewField(preset,typeKey,cur)→مفتاح الحقل الجديد أو null · toast · ask · inherit · compact */
function Zone({ title, sub, children, empty, extra, onDrop }) {
  return (
    <div className="ltx-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onDrop(); }}>
      <div className="ltx-zh"><b>{title}</b><small>{sub}</small><span className="grow" />{extra}</div>
      {children}
      {empty && <p className="ltx-empty">اسحب حقولاً إلى هنا أو أضفها من القائمة</p>}
    </div>
  );
}

export default function TypeLayoutEditor({ types, fields, fieldLabels = {}, layouts, setLayouts, onNewField, toast, ask, inherit, compact, bfields = [], setBf, deleteField, lab, setLab }) {
  const [sel, setSel] = useState(types[0] ? types[0][0] : 'NONE');
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState(null);
  const [showPal, setShowPal] = useState(!compact);
  const [target, setTarget] = useState('context');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const canEdit = !!setLab;
  const ownOf = k => (k.startsWith('cf:') ? bfields.find(f => 'cf:' + f.key === k) : null);
  const nameKey = k => (k === 'timetracking' ? 'secTime' : k);

  const coreLabel = k => fieldLabels[k] || FL_KEYS[k] || k;
  const isMain = k => !!MAIN_SECTIONS[k];
  const isCtxOnly = k => isSec(k) || SPECIAL_CONTEXT.includes(k);
  const cfOf = k => fields.find(d => 'cf:' + d.key === k);
  const base = () => (inherit && inherit[sel] ? JSON.parse(JSON.stringify(inherit[sel])) : {
    description: [...Object.keys(MAIN_SECTIONS), ...fields.filter(d => d.section === 'main' && applicable(d)).map(d => 'cf:' + d.key)],
    context: [...CORE_KEYS, ...fields.filter(d => d.section !== 'main' && applicable(d)).map(d => 'cf:' + d.key), ...SPECIAL_CONTEXT],
    sections: {},
  });
  function applicable(d) { return !d.issueTypes || !d.issueTypes.length || d.issueTypes.includes(sel); }
  const custom = !!layouts[sel];
  const cur = { sections: {}, ...(layouts[sel] || base()) };
  cur.sections = cur.sections || {};
  const labelOf = k => (isSec(k) ? (cur.sections[k.slice(4)] || 'قسم') : isMain(k) ? (fieldLabels[k] || MAIN_SECTIONS[k])
    : k === 'timetracking' ? (fieldLabels.secTime || FL_KEYS.secTime) : k.startsWith('cf:') ? ((cfOf(k) || {}).name || k) : coreLabel(k));
  const used = new Set([...cur.description, ...cur.context]);
  const all = [...Object.keys(MAIN_SECTIONS), ...CORE_KEYS, ...SPECIAL_CONTEXT, ...fields.map(d => 'cf:' + d.key)];
  const avail = all.filter(k => !used.has(k) && (!q.trim() || labelOf(k).toLowerCase().includes(q.trim().toLowerCase())));
  const setCur = next => setLayouts(ls => ({ ...ls, [sel]: { sections: cur.sections, ...next } }));

  function dropTo(section, beforeKey) {
    if (!drag) return;
    const k = drag.key;
    if (section === 'description' && isCtxOnly(k)) { toast('هذا العنصر للجانب فقط (حقول السياق)', 'err'); return; }
    if (section === 'context' && isMain(k)) { toast('أقسام المحتوى الرئيسية تبقى في حقول الوصف', 'err'); return; }
    const d = cur.description.filter(x => x !== k), c = cur.context.filter(x => x !== k);
    const list = section === 'description' ? d : c;
    const idx = beforeKey ? list.indexOf(beforeKey) : -1;
    if (idx >= 0) list.splice(idx, 0, k); else list.push(k);
    setCur({ description: d, context: c });
    setDrag(null);
  }
  const remove = k => {
    const sections = { ...cur.sections };
    if (isSec(k)) delete sections[k.slice(4)];
    setLayouts(ls => ({ ...ls, [sel]: { description: cur.description.filter(x => x !== k), context: cur.context.filter(x => x !== k), sections } }));
  };
  const move = (section, i, dir) => {
    const list = [...cur[section]]; const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setCur({ ...cur, [section]: list });
  };
  const addTo = (k, where) => {
    const sec = isMain(k) ? 'description' : isCtxOnly(k) ? 'context' : where || target;
    setCur({ ...cur, [sec]: [...cur[sec], k] });
  };
  const flip = (k, section) => {
    const to = section === 'description' ? 'context' : 'description';
    if (to === 'description' && isCtxOnly(k)) { toast('هذا العنصر للجانب فقط (حقول السياق)', 'err'); return; }
    if (to === 'context' && isMain(k)) { toast('أقسام المحتوى الرئيسية تبقى في حقول الوصف', 'err'); return; }
    setCur({ ...cur, [section]: cur[section].filter(x => x !== k), [to]: [...cur[to], k] });
  };
  const addSection = () => {
    const id = 's' + Math.random().toString(36).slice(2, 8);
    setLayouts(ls => ({ ...ls, [sel]: { description: cur.description, context: [...cur.context, 'sec:' + id], sections: { ...cur.sections, [id]: 'قسم جديد' } } }));
  };
  const renameSection = (k, name) => setLayouts(ls => ({ ...ls, [sel]: { description: cur.description, context: cur.context, sections: { ...cur.sections, [k.slice(4)]: name } } }));
  async function create(preset) {
    const key = await onNewField(preset, sel, cur);
    if (key) setLayouts(ls => { const n = ls[sel] || cur; return { ...ls, [sel]: { ...n, sections: n.sections || cur.sections, [target]: [...n[target], key] } }; });
  }

  /* تلميح مصغّر لشكل قيمة كل عنصر */
  const hintOf = k => {
    if (isSec(k) || isMain(k) || k === 'timetracking') return '';
    const d = cfOf(k);
    if (d) return CF_TYPE_AR[d.type] || '';
    if (k === 'status' || k === 'type' || k === 'priority') return 'قائمة';
    if (k === 'assignee' || k === 'reporter' || k === 'watchers') return 'شخص';
    if (k === 'due' || k === 'start' || k === 'created' || k === 'updated') return 'تاريخ';
    return '';
  };
  const row = (k, section, i) => (
    <div key={k} className="ltx-rw">
    <div className={`ltx-row ${isSec(k) ? 'sec' : ''} ${isMain(k) ? 'big' : ''} ${drag && drag.key === k ? 'dragging' : ''}`} draggable
      onDragStart={() => setDrag({ key: k })} onDragEnd={() => setDrag(null)}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); dropTo(section, k); }}>
      <span className="ltx-grip" aria-hidden="true">⠿</span>
      {isSec(k)
        ? <input className="ltx-secname" maxLength={40} value={cur.sections[k.slice(4)] || ''} placeholder="اسم القسم" aria-label="اسم القسم" onChange={e => renameSection(k, e.target.value)} onMouseDown={e => e.stopPropagation()} draggable={false} />
        : <span className="ltx-name">{labelOf(k)}</span>}
      {hintOf(k) && <span className="ltx-hint">{hintOf(k)}</span>}
      <span className="ltx-acts">
        {canEdit && !isSec(k) && <button type="button" title="تعديل الاسم والخيارات" aria-label="تعديل" className={editing === k ? 'on' : ''} onClick={() => setEditing(e => (e === k ? null : k))}>✎</button>}
        {!isSec(k) && !isMain(k) && !SPECIAL_CONTEXT.includes(k) && <button type="button" title={section === 'description' ? 'نقل إلى الجانب' : 'نقل إلى العمود الرئيسي'} aria-label="نقل" onClick={() => flip(k, section)}>⇄</button>}
        <button type="button" aria-label="أعلى" onClick={() => move(section, i, -1)}>↑</button>
        <button type="button" aria-label="أسفل" onClick={() => move(section, i, 1)}>↓</button>
        <button type="button" aria-label="إزالة" className="x" onClick={() => remove(k)}>✕</button>
      </span>
    </div>
    {editing === k && canEdit && editPanel(k)}
    </div>
  );
  const editPanel = k => {
    const own = ownOf(k);
    const optional = own && ['select', 'multiselect', 'radio'].includes(own.type);
    return (
      <div className="ltx-edit">
        <label className="ltx-ef"><span>الاسم</span>
          <input className="input" maxLength={40} autoFocus value={own ? own.name || '' : (lab[nameKey(k)] || '')} placeholder={own ? 'اسم الحقل' : (k.startsWith('cf:') ? (cfOf(k) || {}).name : (FL_KEYS[k] || MAIN_SECTIONS[k] || FL_KEYS.secTime))}
            onChange={e => (own ? setBf(own.key, { name: e.target.value }) : setLab({ ...lab, [nameKey(k)]: e.target.value }))} /></label>
        {own && (
          <>
            <label className="ltx-ef"><span>النوع</span>
              <select className="input" value={own.type} onChange={e => setBf(own.key, { type: e.target.value, ...(['select', 'multiselect', 'radio'].includes(e.target.value) && !(own.options || []).length ? { options: ['خيار 1', 'خيار 2'] } : {}) })}>
                {Object.entries(CF_TYPE_AR).map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select></label>
            {optional && <label className="ltx-ef"><span>الخيارات (خيار بكل سطر)</span>
              <textarea className="input" rows={3} value={(own.options || []).join('\n')} onChange={e => setBf(own.key, { options: e.target.value.split('\n') })} /></label>}
            <label className="check"><input type="checkbox" checked={!!own.card} onChange={e => setBf(own.key, { card: e.target.checked })} /> يظهر على بطاقة اللوحة</label>
            <button type="button" className="btn danger sm" onClick={() => ask({ title: 'حذف الحقل', text: 'سيُحذف الحقل «' + (own.name || '') + '» من كل أنواع المهام بهذه اللوحة. القيم المخزّنة بالمهام تبقى لكن لا تظهر.', ok: 'حذف', danger: true, onOk: () => { setEditing(null); deleteField(own.key); } })}>حذف الحقل نهائياً</button>
          </>
        )}
        {!own && <p className="muted small" style={{ margin: 0 }}>الاسم يخص هذه اللوحة فقط. اتركه فارغاً للاسم الافتراضي.</p>}
      </div>
    );
  };
  const coreAvail = avail.filter(k => !k.startsWith('cf:'));
  const cfAvail = avail.filter(k => k.startsWith('cf:'));
  const palItem = k => (
    <div key={k} className="ltx-pi" draggable onDragStart={() => setDrag({ key: k })} onDragEnd={() => setDrag(null)}>
      <span className="ltx-name">{labelOf(k)}</span>
      {isMain(k) || isCtxOnly(k)
        ? <button type="button" className="ltx-add" onClick={() => addTo(k)}>＋ إضافة</button>
        : <><button type="button" className="ltx-add" onClick={() => addTo(k, 'description')}>＋ رئيسي</button>
          <button type="button" className="ltx-add" onClick={() => addTo(k, 'context')}>＋ جانبي</button></>}
    </div>
  );

  return (
    <div className={`lt-grid ltx ${compact ? 'lt-compact' : ''}`}>
      <div className="ltx-types">
        {types.map(([k, l]) => (
          <button type="button" key={k} className={`ltx-type ${sel === k ? 'on' : ''}`} onClick={() => setSel(k)}>
            {l}
          </button>
        ))}
        <span className="grow" />
        {custom && <button type="button" className="btn ghost sm" onClick={() => ask({ title: 'إعادة التخطيط الافتراضي', text: 'سيعود هذا النوع للتخطيط الأعلى منه (الشركة أو الافتراضي).', ok: 'إعادة', danger: false,
          onOk: () => { setLayouts(ls => { const n = { ...ls }; delete n[sel]; return n; }); } })}>إعادة الافتراضي</button>}
        {compact && <button type="button" className="btn ghost sm" onClick={() => setShowPal(s => !s)}>{showPal ? 'إخفاء الحقول' : '＋ الحقول'}</button>}
      </div>

      <section className="ltx-main">
        <p className="ltx-tip">هكذا ستظهر نافذة المهمة لنوع «{(types.find(t => t[0] === sel) || [])[1] || sel}». اسحب الحقول بين العمودين لترتيبها، وما ليس هنا لن يظهر.</p>
        <div className="ltx-task">
          <div className="ltx-top"><span className="ltx-key">KEY-12</span><span className="ltx-title">عنوان المهمة</span></div>
          <div className="ltx-cols">
            <Zone onDrop={() => dropTo('description', null)} section="description" title="العمود الرئيسي" sub="الوصف والمحتوى" empty={!cur.description.length}>
              {cur.description.map((k, i) => row(k, 'description', i))}
            </Zone>
            <Zone onDrop={() => dropTo('context', null)} section="context" title="الجانب" sub="تفاصيل سريعة" empty={!cur.context.length}
              extra={<button type="button" className="ltx-link" onClick={addSection}>＋ قسم</button>}>
              {cur.context.map((k, i) => row(k, 'context', i))}
            </Zone>
          </div>
        </div>
      </section>

      {showPal && (
        <aside className="ltx-pal">
          <div className="ltx-ph"><b>الحقول</b>
            <button type="button" className="ltx-newbtn" onClick={() => setShowNew(s => !s)}>{showNew ? 'إغلاق' : '＋ حقل جديد'}</button></div>
          {showNew && (
            <div className="ltx-new">
              <div className="ltx-seg">
                <button type="button" className={target === 'description' ? 'on' : ''} onClick={() => setTarget('description')}>في الرئيسي</button>
                <button type="button" className={target === 'context' ? 'on' : ''} onClick={() => setTarget('context')}>في الجانب</button>
              </div>
              <div className="ltx-kinds">
                {Object.entries(CF_TYPE_AR).map(([k, l]) => (
                  <button type="button" key={k} onClick={() => { create(k); setShowNew(false); }}><span>{ICO_OF[k] || '◆'}</span>{l}</button>
                ))}
              </div>
            </div>
          )}
          <input className="input" placeholder="ابحث…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="ltx-list">
            {coreAvail.length > 0 && <div className="ltx-gh">أساسية</div>}
            {coreAvail.map(k => palItem(k))}
            {cfAvail.length > 0 && <div className="ltx-gh">مخصّصة</div>}
            {cfAvail.map(k => palItem(k))}
            {!avail.length && <p className="ltx-empty">كل الحقول مضافة.</p>}
          </div>
        </aside>
      )}
    </div>
  );
}