'use client';
/* فلترة المهام على طريقة Jira: لوحة «تصفية» بثلاثة أوضاع (أساسي / متقدّم / JQL) + فلاتر محفوظة + «تجميع». */
import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS } from './../lib/constants';
import { Avatar, Icon } from './ui';
import { FIcon } from './Icon';

export const EMPTY_FILTER = { mode: 'basic', basic: {}, extra: [], adv: [], jql: '' };
const NONE = '__none';
let advSeq = 1;

/* ───────── تعريف الحقول القابلة للتصفية ───────── */
export function buildFields(ctx, tasks, sprints) {
  const me = ctx.me.user;
  const uniq = (arr, key) => [...new Map(arr.filter(Boolean).map(x => [key(x), x])).values()];
  const people = uniq(tasks.map(t => t.assignee), a => a.id);
  const parents = uniq(tasks.map(t => t.parent), p => p.id);
  const labels = [...new Set(tasks.flatMap(t => t.labels || []))].sort();
  const fields = [
    { key: 'parent', label: ctx.fl('parent'), none: 'بدون أم / ملحمة',
      opts: parents.map(p => ({ v: String(p.id), label: p.title, sub: p.key })), get: t => (t.parentId ? [String(t.parentId)] : []) },
    { key: 'assignee', label: ctx.fl('assignee'), none: 'غير مُسنَد', me: true,
      opts: people.map(p => ({ v: String(p.id), label: p.name, avatar: p.name })), get: t => (t.assignee ? [String(t.assignee.id)] : []) },
    { key: 'status', label: ctx.fl('status'), opts: ctx.statusOpts('').map(([k, l]) => ({ v: k, label: l })), get: t => [t.status] },
    { key: 'type', label: ctx.fl('type'), none: 'بدون نوع', opts: [...Object.entries(ctx.itype).map(([k, l]) => ({ v: k, label: l })), ...[...new Set(tasks.map(t => t.issueType).filter(x => x && !ctx.itype[x]))].map(x => ({ v: x, label: x }))], get: t => (t.issueType ? [t.issueType] : []) },
    { key: 'labels', label: ctx.fl('labels'), none: 'بدون وسم', opts: labels.map(l => ({ v: l, label: l })), get: t => t.labels || [] },
    { key: 'priority', label: ctx.fl('priority'), opts: Object.entries(ctx.priority).map(([k, l]) => ({ v: k, label: l })), get: t => [t.priority] },
    { key: 'project', label: ctx.fl('project'), none: 'بدون مساحة',
      opts: uniq(tasks.map(t => t.project), p => p.id).map(p => ({ v: String(p.id), label: p.name, sub: p.key })), get: t => (t.projectId ? [String(t.projectId)] : []) },
    { key: 'sprint', label: ctx.fl('sprint'), none: 'Backlog (بلا سباق)',
      opts: sprints.filter(s => s.state !== 'CLOSED').map(s => ({ v: String(s.id), label: s.name + (s.state === 'ACTIVE' ? ' (جارٍ)' : '') })), get: t => (t.sprintId ? [String(t.sprintId)] : []) },
  ];
  /* الحقول المخصصة القابلة للاختيار */
  ctx.cfDefs.forEach(d => {
    if (['select', 'multiselect'].includes(d.type)) {
      fields.push({ key: 'cf:' + d.key, label: ctx.cfLabel(d), none: 'فارغ', opts: (d.options || []).map(o => ({ v: o, label: o })),
        get: t => { const v = (t.customFields || {})[d.key]; return Array.isArray(v) ? v : v ? [String(v)] : []; } });
    } else if (d.type === 'user') {
      fields.push({ key: 'cf:' + d.key, label: ctx.cfLabel(d), none: 'فارغ', opts: ctx.users.map(u => ({ v: String(u.id), label: u.name, avatar: u.name })),
        get: t => { const v = (t.customFields || {})[d.key]; return v ? [String(v)] : []; } });
    } else if (d.type === 'checkbox') {
      fields.push({ key: 'cf:' + d.key, label: ctx.cfLabel(d), opts: [{ v: 'true', label: 'نعم' }, { v: 'false', label: 'لا' }],
        get: t => [String(!!(t.customFields || {})[d.key])] });
    }
  });
  void me;
  return fields;
}

export const DEFAULT_PINNED = ['parent', 'assignee', 'status', 'type', 'labels'];

/* حقول نصية للمتقدّم وJQL */
const TEXT_FIELDS = [
  { key: 'summary', label: 'الملخّص', text: t => t.title },
  { key: 'key', label: 'الرقم', text: t => t.key },
  { key: 'description', label: 'الوصف', text: t => t.description || '' },
];

/* ───────── تطبيق الفلاتر ───────── */
function basicTest(filter, fieldMap, meId) {
  const active = Object.entries(filter.basic).filter(([, vals]) => vals && vals.length);
  if (!active.length) return null;
  return t => active.every(([k, vals]) => {
    const f = fieldMap.get(k);
    if (!f) return true;
    const have = f.get(t);
    return vals.some(v => {
      if (v === NONE) return have.length === 0;
      if (v === '__me') return have.includes(String(meId));
      return have.includes(v);
    });
  });
}

function advTest(filter, fieldMap, meId) {
  const rows = filter.adv.filter(r => r.field && String(r.val ?? '') !== '');
  if (!rows.length) return null;
  return t => rows.every(r => {
    const txt = TEXT_FIELDS.find(x => x.key === r.field);
    if (txt) {
      const has = String(txt.text(t)).toLowerCase().includes(String(r.val).toLowerCase());
      return r.op === 'not' ? !has : has;
    }
    const f = fieldMap.get(r.field);
    if (!f) return true;
    const have = f.get(t);
    const hit = r.val === NONE ? have.length === 0 : r.val === '__me' ? have.includes(String(meId)) : have.includes(String(r.val));
    return r.op === 'not' ? !hit : hit;
  });
}

/* JQL مبسّط: field op value [AND ...] — العوامل = != ~ !~ IN NOT IN IS EMPTY IS NOT EMPTY */
const ALIAS = {
  assignee: 'assignee', 'المنفذ': 'assignee', status: 'status', 'الحالة': 'status', priority: 'priority', 'الأولوية': 'priority',
  type: 'type', issuetype: 'type', worktype: 'type', 'النوع': 'type', label: 'labels', labels: 'labels', 'الوسوم': 'labels',
  parent: 'parent', epic: 'parent', 'الملحمة': 'parent', sprint: 'sprint', 'السباق': 'sprint',
  summary: 'summary', title: 'summary', text: 'summary', 'العنوان': 'summary', key: 'key', id: 'key', description: 'description',
};
function splitAnd(s) {
  const out = []; let cur = '', q = '', depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (!depth && /^\s+and\s+/i.test(s.slice(i)) && /\s/.test(ch)) {
      const m = /^\s+and\s+/i.exec(s.slice(i));
      out.push(cur); cur = ''; i += m[0].length - 1; continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const unq = v => String(v).trim().replace(/^["']|["']$/g, '');

export function compileJql(jql, fieldMap, meId, meName) {
  const src = String(jql || '').trim();
  if (!src) return { fn: null };
  const clauses = splitAnd(src);
  const tests = [];
  for (const c of clauses) {
    const m = /^(.+?)\s*(!=|!~|=|~|\bnot\s+in\b|\bin\b|\bis\s+not\b|\bis\b)\s*(.+)$/i.exec(c);
    if (!m) return { error: `لم أفهم: «${c}»` };
    const fk = ALIAS[unq(m[1]).toLowerCase()];
    if (!fk) return { error: `حقل غير معروف: «${unq(m[1])}»` };
    const op = m[2].toLowerCase().replace(/\s+/g, ' ');
    let raw = m[3].trim();
    const isList = op === 'in' || op === 'not in';
    let vals;
    if (isList) {
      const mm = /^\((.*)\)$/.exec(raw);
      if (!mm) return { error: 'القائمة بعد IN تكون بين أقواس: IN (a, b)' };
      vals = mm[1].split(',').map(unq).filter(Boolean);
    } else vals = [unq(raw)];
    const lower = vals.map(v => v.toLowerCase());
    const txt = TEXT_FIELDS.find(x => x.key === fk);
    if (txt) {
      if (op === '~' || op === '=' || op === 'in') tests.push(t => lower.some(v => String(txt.text(t)).toLowerCase().includes(v)));
      else tests.push(t => !lower.some(v => String(txt.text(t)).toLowerCase().includes(v)));
      continue;
    }
    const f = fieldMap.get(fk);
    if (!f) return { error: `الحقل «${fk}» غير متاح` };
    const labelOf = new Map(f.opts.map(o => [o.v, o.label.toLowerCase()]));
    const matchTask = t => {
      const have = f.get(t);
      return lower.some(v => {
        if (v === 'empty' || v === 'null' || v === 'فارغ') return have.length === 0;
        if (v === 'currentuser()' || v === 'me') return have.includes(String(meId)) || (meName && have.some(h => (labelOf.get(h) || '') === meName.toLowerCase()));
        return have.some(h => h.toLowerCase() === v || (labelOf.get(h) || '') === v);
      });
    };
    if (op === 'is' || op === '=' || op === 'in' || op === '~') tests.push(matchTask);
    else if (op === 'is not' || op === '!=' || op === 'not in' || op === '!~') tests.push(t => !matchTask(t));
  }
  return { fn: t => tests.every(fn => fn(t)) };
}

export function useTaskFilter(ctx, tasks, sprints, filter) {
  const fields = useMemo(() => (ctx ? buildFields(ctx, tasks, sprints) : []), [ctx, tasks, sprints]);
  const fieldMap = useMemo(() => new Map(fields.map(f => [f.key, f])), [fields]);
  const meId = ctx ? ctx.me.user.id : 0;
  const meName = ctx ? ctx.me.user.name : '';
  const { fn, error } = useMemo(() => {
    if (filter.mode === 'basic') return { fn: basicTest(filter, fieldMap, meId) };
    if (filter.mode === 'adv') return { fn: advTest(filter, fieldMap, meId) };
    return compileJql(filter.jql, fieldMap, meId, meName);
  }, [filter, fieldMap, meId, meName]);
  return { fields, fieldMap, test: fn || (() => true), error };
}

export function activeCount(filter) {
  if (filter.mode === 'basic') return Object.values(filter.basic).filter(v => v && v.length).length;
  if (filter.mode === 'adv') return filter.adv.filter(r => r.field && String(r.val ?? '') !== '').length;
  return filter.jql.trim() ? 1 : 0;
}

/* ───────── الواجهة ───────── */
export const GROUPS = [
  ['', 'بدون تجميع'], ['assignee', 'المنفّذ'], ['parent', 'الملحمة / الأم'], ['priority', 'الأولوية'], ['type', 'النوع'], ['labels', 'الوسم'], ['sprint', 'السباق'],
];

export default function TaskFilterBar({ ctx, fields, fieldMap, filter, setFilter, error, group, setGroup, showGroup, tasks, boardKey, showQuick = true }) {
  const [open, setOpen] = useState(false);
  const [gOpen, setGOpen] = useState(false);
  const [sel, setSel] = useState('assignee');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addQ, setAddQ] = useState('');
  const [saved, setSaved] = useState([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const wrap = useRef(null);
  /* إبقاء النافذة المنبثقة ضمن حدود الشاشة (تزاح أفقياً عند الحاجة) */
  useEffect(() => {
    if (!open && !gOpen) return;
    (wrap.current ? [...wrap.current.querySelectorAll('.jf-pop')] : []).forEach(el => {
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      const dx = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
      if (dx) el.style.transform = 'translateX(' + dx + 'px)';
    });
  }, [open, gOpen]);
  const key = 'rb-savedfilters-' + (boardKey || 0);
  const count = activeCount(filter);

  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { setSaved([]); } }, [key]);
  const persist = list => { setSaved(list); try { localStorage.setItem(key, JSON.stringify(list)); } catch (_) { /* تجاهل */ } };

  useEffect(() => {
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setGOpen(false); setAddOpen(false); setSavedOpen(false); } };
    const keyd = e => {
      if (e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !document.querySelector('.modal')) { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') { setOpen(false); setGOpen(false); }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', keyd);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', keyd); };
  }, []);

  const pinned = [...DEFAULT_PINNED, ...filter.extra].filter(k => fieldMap.has(k));
  const cur = fieldMap.get(sel) || fieldMap.get(pinned[0]);
  const setBasic = (k, vals) => setFilter(f => ({ ...f, basic: { ...f.basic, [k]: vals } }));
  const toggleVal = (k, v) => {
    const have = filter.basic[k] || [];
    setBasic(k, have.includes(v) ? have.filter(x => x !== v) : [...have, v]);
  };
  const clearAll = () => setFilter(f => ({ ...f, basic: {}, adv: [], jql: '' }));

  /* خيارات الحقل الحالي في اللوحة اليمنى */
  const options = useMemo(() => {
    if (!cur) return [];
    const base = [];
    if (cur.none) base.push({ v: NONE, label: cur.none });
    if (cur.me) base.push({ v: '__me', label: 'المستخدم الحالي (أنا)', avatar: ctx.me.user.name });
    return [...base, ...cur.opts];
  }, [cur, ctx.me.user.name]);
  const shown = options.filter(o => !q.trim() || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q.trim().toLowerCase()));
  const selected = (cur && filter.basic[cur.key]) || [];

  const addable = fields.filter(f => !pinned.includes(f.key) && (!addQ.trim() || f.label.toLowerCase().includes(addQ.trim().toLowerCase())));

  /* أفاتار الأشخاص السريعة (كما في Jira) */
  const people = fieldMap.get('assignee') ? fieldMap.get('assignee').opts.slice(0, 3) : [];
  const selPeople = filter.basic.assignee || [];

  return (
    <div className="jf-bar" ref={wrap}>
      <div className="jf-avatars" aria-label="تصفية سريعة بالأشخاص">
        <button type="button" className={`jf-av jf-unas ${selPeople.includes(NONE) ? 'on' : ''}`} title="غير مُسنَد" aria-label="غير مُسنَد"
            onClick={() => { setFilter(f => ({ ...f, mode: 'basic' })); toggleVal('assignee', NONE); }}><FIcon n="user" size={16} /></button>
        {people.map(p => (
          <button type="button" key={p.v} className={`jf-av ${selPeople.includes(p.v) ? 'on' : ''}`} title={p.label}
            onClick={() => { setFilter(f => ({ ...f, mode: 'basic' })); toggleVal('assignee', p.v); }}><Avatar name={p.label} size={28} /></button>
        ))}
      </div>

      <div className="jf-wrap">
        <button type="button" className={`btn ghost jf-btn ${count ? 'has' : ''}`} onClick={() => { setOpen(!open); setGOpen(false); }} aria-expanded={open}>
          <FIcon n="filter" size={16} /> تصفية{count > 0 && <span className="jf-count">{count}</span>}
        </button>
        {count > 0 && <button type="button" className="jf-clear" onClick={clearAll}>مسح</button>}

        {open && (
          <div className="jf-pop" role="dialog" aria-label="تصفية المهام">
            <div className="jf-head">
              <div className="jf-tabs">
                {[['basic', 'أساسي'], ['adv', 'متقدّم'], ['jql', 'JQL']].map(([k, l]) => (
                  <button type="button" key={k} className={filter.mode === k ? 'on' : ''} onClick={() => setFilter(f => ({ ...f, mode: k }))}>{l}</button>
                ))}
              </div>
              <div className="jf-saved">
                <button type="button" className="jf-link" onClick={() => setSavedOpen(!savedOpen)}>فلاتر محفوظة <FIcon n="chev" size={13} /></button>
                {savedOpen && (
                  <div className="jf-menu">
                    {saved.map((s, i) => (
                      <div className="jf-menu-row" key={i}>
                        <button type="button" onClick={() => { setFilter({ ...EMPTY_FILTER, ...s.filter }); setSavedOpen(false); }}>{s.name}</button>
                        <button type="button" aria-label="حذف" onClick={() => persist(saved.filter((_, j) => j !== i))}><FIcon n="x" size={14} /></button>
                      </div>
                    ))}
                    {!saved.length && <p className="muted small" style={{ padding: '8px 10px' }}>لا توجد فلاتر محفوظة.</p>}
                    <button type="button" className="jf-menu-save" disabled={!count}
                      onClick={() => { const name = window.prompt('اسم الفلتر المحفوظ'); if (name && name.trim()) persist([...saved, { name: name.trim(), filter }]); setSavedOpen(false); }}>+ حفظ الفلتر الحالي</button>
                  </div>
                )}
              </div>
            </div>

            {filter.mode === 'basic' && (
              <div className="jf-body">
                <div className="jf-fields">
                  {pinned.map(k => {
                    const f = fieldMap.get(k);
                    const n = (filter.basic[k] || []).length;
                    return (
                      <button type="button" key={k} className={`jf-field ${cur && cur.key === k ? 'on' : ''}`} onClick={() => { setSel(k); setQ(''); }}>
                        <span>{f.label}</span>{n > 0 && <b className="jf-n">{n}</b>}
                      </button>
                    );
                  })}
                  <div className="jf-add">
                    <button type="button" className="jf-addbtn" onClick={() => setAddOpen(!addOpen)}>+ إضافة حقل</button>
                    {addOpen && (
                      <div className="jf-menu jf-addmenu">
                        <input className="input" autoFocus placeholder="ابحث عن حقل…" value={addQ} onChange={e => setAddQ(e.target.value)} />
                        <div className="jf-addlist">
                          {addable.map(f => (
                            <button type="button" key={f.key} onClick={() => { setFilter(x => ({ ...x, extra: [...x.extra, f.key] })); setSel(f.key); setAddOpen(false); setAddQ(''); }}>{f.label}</button>
                          ))}
                          {!addable.length && <p className="muted small" style={{ padding: 8 }}>لا توجد حقول أخرى.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="jf-values">
                  {cur ? (
                    <>
                      <label className="search-field jf-search"><Icon name="search" size={15} />
                        <input className="input" placeholder={`ابحث في ${cur.label}…`} value={q} onChange={e => setQ(e.target.value)} /></label>
                      <div className="jf-list">
                        {shown.map(o => (
                          <label className="jf-opt" key={o.v}>
                            <input type="checkbox" checked={selected.includes(o.v)} onChange={() => toggleVal(cur.key, o.v)} />
                            {o.avatar && <Avatar name={o.avatar} size={22} />}
                            <span className="jf-ol">{o.label}{o.sub && <small className="muted"> {o.sub}</small>}</span>
                          </label>
                        ))}
                        {!shown.length && <p className="muted small" style={{ padding: 10 }}>لا توجد نتائج.</p>}
                      </div>
                      <div className="jf-vfoot">
                        <button type="button" className="jf-link" disabled={!selected.length} onClick={() => setBasic(cur.key, [])}>مسح</button>
                        <span className="muted small">{options.length} من {options.length} · محدّد {selected.length}</span>
                      </div>
                    </>
                  ) : <p className="muted small" style={{ padding: 14 }}>اختر حقلاً.</p>}
                </div>
              </div>
            )}

            {filter.mode === 'adv' && (
              <div className="jf-adv">
                {filter.adv.map(r => {
                  const f = fieldMap.get(r.field);
                  const isText = !!TEXT_FIELDS.find(x => x.key === r.field);
                  const opts = f ? [...(f.none ? [{ v: NONE, label: f.none }] : []), ...(f.me ? [{ v: '__me', label: 'المستخدم الحالي (أنا)' }] : []), ...f.opts] : [];
                  const upd = patch => setFilter(x => ({ ...x, adv: x.adv.map(y => (y.id === r.id ? { ...y, ...patch } : y)) }));
                  return (
                    <div className="jf-row" key={r.id}>
                      <select className="input" value={r.field} onChange={e => upd({ field: e.target.value, val: '' })}>
                        {fields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                        {TEXT_FIELDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                      <select className="input" value={r.op} onChange={e => upd({ op: e.target.value })}>
                        <option value="is">{isText ? 'يحتوي' : 'هو'}</option><option value="not">{isText ? 'لا يحتوي' : 'ليس'}</option>
                      </select>
                      {isText
                        ? <input className="input" placeholder="النص…" value={r.val} onChange={e => upd({ val: e.target.value })} />
                        : <select className="input" value={r.val} onChange={e => upd({ val: e.target.value })}>
                          <option value="">— اختر —</option>{opts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}</select>}
                      <button type="button" className="tb-btn" aria-label="حذف" onClick={() => setFilter(x => ({ ...x, adv: x.adv.filter(y => y.id !== r.id) }))}><FIcon n="x" size={14} /></button>
                    </div>
                  );
                })}
                <button type="button" className="jf-addbtn" onClick={() => setFilter(x => ({ ...x, adv: [...x.adv, { id: advSeq++, field: 'status', op: 'is', val: '' }] }))}>+ إضافة شرط</button>
                <p className="muted small" style={{ marginTop: 8 }}>تُطبَّق كل الشروط معاً (AND).</p>
              </div>
            )}

            {filter.mode === 'jql' && (
              <div className="jf-jql">
                <textarea className="input" rows={4} dir="ltr" spellCheck={false} placeholder={'assignee = currentUser() AND status IN ("TODO","REVIEW")'}
                  value={filter.jql} onChange={e => setFilter(f => ({ ...f, jql: e.target.value }))} />
                {error ? <p className="err">{error}</p> : <p className="muted small">الحقول: assignee, status, priority, type, labels, parent, sprint, summary, key — العوامل: = != ~ IN NOT IN IS EMPTY — الربط: AND</p>}
                <small className="muted">{tasks.length} مهمة في النطاق</small>
              </div>
            )}

            <div className="jf-foot">
              <button type="button" className="jf-link" onClick={clearAll}>مسح الكل</button>
              <span className="muted small">اضغط <kbd>Shift</kbd> + <kbd>F</kbd> للفتح والإغلاق</span>
            </div>
          </div>
        )}
      </div>

      {showGroup && (
        <div className="jf-wrap">
          <button type="button" className={`btn ghost jf-btn ${group ? 'has' : ''}`} onClick={() => { setGOpen(!gOpen); setOpen(false); }} aria-expanded={gOpen}>
            <FIcon n="layers" size={16} /> تجميع{group ? `: ${(GROUPS.find(g => g[0] === group) || [])[1] || ''}` : ''}
          </button>
          {gOpen && (
            <div className="jf-menu jf-gmenu">
              {GROUPS.map(([k, l]) => (
                <button type="button" key={k} className={group === k ? 'on' : ''} onClick={() => { setGroup(k); setGOpen(false); }}>{group === k ? <FIcon n="check" size={13} /> : null} {l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {showQuick && saved.length > 0 && (
        <div className="jf-quick" aria-label="فلاتر سريعة">
          {saved.map((s, i) => {
            const on = JSON.stringify({ ...EMPTY_FILTER, ...s.filter }) === JSON.stringify(filter);
            return <button type="button" key={i} className={`jf-qbtn ${on ? 'on' : ''}`} onClick={() => setFilter(on ? EMPTY_FILTER : { ...EMPTY_FILTER, ...s.filter })}>{s.name}</button>;
          })}
        </div>
      )}    </div>
  );
}
