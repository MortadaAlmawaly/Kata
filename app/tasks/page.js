'use client';
/* المهام (لوحة / Backlog / قائمة) — ترحيل viewTasks (tasks-pro.js). */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bgCss, bgCssThemed } from '../../components/SpaceSettings';
import { createPortal } from 'react-dom';
import { FIcon } from '../../components/Icon';
import { api } from '../../lib/api';
import { hueOf, STATUS } from '../../lib/constants';
import { addDaysStr, dueInfo, todayStr } from '../../lib/util';
import { copyText } from '../../lib/clipboard';
import { cfShort, COLOR_PRI, COLOR_TYPE, makeCtx, PRI_ICON, PRI_ORDER } from '../../lib/tasks';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, MobileTabs, Modal } from '../../components/ui';
import { Bar } from '../../components/charts';
import { useConfirm, useToast } from '../../components/hooks';
import TaskForm from '../../components/TaskForm';
import TaskDetail, { TypeIcon } from '../../components/TaskDetail';
import TypeInput from '../../components/TypeInput';
import { TaskCalendar, TaskGoals, TaskReports } from '../../components/TaskViews';
import TaskFilterBar, { compileJql, EMPTY_FILTER, useTaskFilter } from '../../components/TaskFilter';
import { withBase } from '@/lib/base';

export default function TasksPage() {
  return <Suspense fallback={null}><Tasks /></Suspense>;
}

const isOverdue = t => t.status !== 'DONE' && t.dueDate && t.dueDate < todayStr();

function Tasks() {
  const { me, error, reload: reloadMe } = useMe();
  const [scope, setScope] = useState('mine');
  const [view, setView] = useState('board');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [group, setGroup] = useState('');
  /* إعدادات العرض الشخصية (مثل View settings في Jira): لا تغيّر إعدادات اللوحة لبقية الناس */
  const [vs, setVs] = useState({ fields: {}, density: '', quick: true, full: false });
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('rb-viewset') || 'null'); if (v) setVs(s => ({ ...s, ...v, full: false })); } catch (_) { /* لا تخزين */ } }, []);
  const updVs = patch => setVs(s => { const n = { ...s, ...patch }; try { localStorage.setItem('rb-viewset', JSON.stringify(n)); } catch (_) { /* تجاهل */ } return n; });
  useEffect(() => { document.documentElement.classList.toggle('jira-full', !!vs.full); return () => document.documentElement.classList.remove('jira-full'); }, [vs.full]);
  const pendingSpace = useRef(null);
  const pendingBoard = useRef(null);
  const openArchRef = useRef(false);
  const [cm, setCm] = useState(null);           // قائمة بطاقة: { t, x, y }
  const [editTitleId, setEditTitleId] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [all, setAll] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [boards, setBoards] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [folds, setFolds] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null);       // { task|null, preset }
  const [boardForm, setBoardForm] = useState(null);   // { board|null }
  const [sprintForm, setSprintForm] = useState(null); // { sprint|null }
  const [sprintAct, setSprintAct] = useState(null);   // { kind, sprint }
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();
  const canTeam = !!(me && me.perms.includes('team.view'));
  const isCfg = !!(me && (me.perms.includes('admin') || me.perms.includes('boards.manage')));   // الأدمن والمدير التنفيذي فقط يتحكّمان بشكل المهام

  useEffect(() => {
    try { const v = localStorage.getItem('rb-taskview'); if (['board', 'backlog', 'list', 'calendar', 'goals', 'reports', 'archive'].includes(v)) setView(v); } catch (_) { /* لا تخزين */ }
  }, []);
  const pickView = v => { setView(v); try { localStorage.setItem('rb-taskview', v); } catch (_) { /* تجاهل */ } };
  useEffect(() => { if (me && !canTeam && scope !== 'mine') setScope('mine'); }, [me, canTeam, scope]);

  const load = useCallback(async () => {
    try {
      const [a, s, b, sp] = await Promise.all([api('GET', '/api/tasks?scope=' + scope), api('GET', '/api/sprints'), api('GET', '/api/boards').catch(() => []), api('GET', '/api/spaces').catch(() => [])]);
      setAll(a); setSprints(s); setBoards(b); setSpaces(sp);
    } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [scope, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => {
    if (!me) return;
    api('GET', '/api/users').then(us => setUsers(us.filter(u => u.active && (u.inScope || u.id === me.user.id)))).catch(() => {});
  }, [me]);

  /* روابط من أماكن أخرى: ?open=ID أو ?new=1&projectId= */
  useEffect(() => {
    if (!me) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('board')) { pendingBoard.current = +p.get('board'); window.history.replaceState(null, '', '/tasks'); }
    if (p.get('archive')) { pendingBoard.current = +p.get('archive'); openArchRef.current = true; window.history.replaceState(null, '', '/tasks'); }
    if (p.get('space')) { pendingSpace.current = +p.get('space'); window.history.replaceState(null, '', '/tasks'); }
    if (p.get('open')) { setDetailId(+p.get('open')); window.history.replaceState(null, '', '/tasks'); }
    else if (p.get('new')) {
      setForm({ task: null, free: true, preset: p.get('projectId') ? { projectId: +p.get('projectId') } : null });
      window.history.replaceState(null, '', '/tasks');
    }
  }, [me]);

  /* ?board=ID: افتح هذه اللوحة بعينها (الرجوع من صفحة تخصيص اللوحة) */
  useEffect(() => {
    if (!pendingBoard.current || !boards.length) return;
    if (boards.some(x => x.id === pendingBoard.current)) setBoardId(pendingBoard.current);
    pendingBoard.current = null;
  }, [boards]);

  /* ?space=ID: افتح أول لوحة في هذه المساحة */
  useEffect(() => {
    if (!pendingSpace.current || !boards.length) return;
    const b = boards.find(x => (x.filters || {}).projectId === pendingSpace.current);
    if (b) setBoardId(b.id);
    pendingSpace.current = null;
  }, [boards]);
  const board = boards.find(b => String(b.id) === String(boardId)) || boards[0] || null;
  useEffect(() => { window.__kataBoard = board ? board.id : null; window.dispatchEvent(new Event('kata-board')); }, [board]);
  const spaceId = (board && (board.filters || {}).projectId) || null;
  /* الأرشيف: منجزة منذ أكثر من 90 يوماً تنتظر موافقة مسؤول اللوحة */
  const canArchive = !!(board && spaceId && (board.myRole === 'MANAGE' || isCfg));
  const [arch, setArch] = useState(null);
  const [archOpen, setArchOpen] = useState(false);
  const loadArch = useCallback(async () => {
    if (!canArchive) { setArch(null); return; }
    try { setArch(await api('GET', '/api/tasks/archive-candidates?projectId=' + spaceId)); } catch (_) { setArch(null); }
  }, [canArchive, spaceId]);
  useEffect(() => { loadArch(); }, [loadArch]);
  useEffect(() => { if (openArchRef.current && arch && arch.tasks.length) { openArchRef.current = false; setArchOpen(true); } }, [arch]);
  const space = spaces.find(s => s.id === spaceId) || null;
  /* خلفية المساحة تُطبَّق على منطقة المحتوى، وبالوضع الفاتح تُعرض نسخة مفتّحة من نفس الألوان */
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.dataset.theme !== 'dark');
    read();
    const mo = new MutationObserver(read); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const el = document.querySelector('.main'); if (!el) return undefined;
    const css = space && space.background ? bgCssThemed(space.background, isLight) : '';
    el.style.background = css; el.classList.toggle('has-space-bg', !!css);
    return () => { el.style.background = ''; el.classList.remove('has-space-bg'); };
  }, [space && space.background, isLight]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => (me ? makeCtx(me, board, users, space) : null), [me, board, users, space]);
  const flt = useTaskFilter(ctx, all || [], sprints, filter);
  /* ألوان البطاقات بقواعد JQL (أول قاعدة تطابق) */
  const jqlRules = useMemo(() => {
    const c = board && board.card;
    if (!ctx || !c || c.color !== 'jql') return [];
    return (c.rules || []).map(r => ({ color: r.color, fn: compileJql(r.jql, flt.fieldMap, ctx.me.user.id, ctx.me.user.name).fn })).filter(r => r.fn);
  }, [board, ctx, flt.fieldMap]);
  useEffect(() => {   // اختصار C لإنشاء مهمة (مثل Jira)
    const onKey = e => {
      if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('.modal')) return;
      e.preventDefault(); setForm({ task: null });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const foldKey = 'rb-colfold-' + (board ? board.id : 0);
  useEffect(() => {
    try { setFolds(new Set(JSON.parse(localStorage.getItem(foldKey) || '[]'))); } catch (_) { setFolds(new Set()); }
  }, [foldKey]);
  const saveFolds = n => { setFolds(n); try { localStorage.setItem(foldKey, JSON.stringify([...n])); } catch (_) { /* تجاهل */ } };

  async function duplicateBoard() {
    if (!board) return;
    try {
      const r = await api('POST', '/api/boards', {
        name: board.name + ' (نسخة)',
        columns: (board.autoColumns ? Object.keys(STATUS).map(k => ({ status: k })) : board.columns).map(c => ({ status: c.status, ...(c.name ? { name: c.name } : {}), ...(c.color ? { color: c.color } : {}), ...(c.max ? { max: c.max } : {}), ...(c.min ? { min: c.min } : {}), ...(c.noCreate ? { noCreate: true } : {}) })),
        filters: board.filters || {}, card: board.card, labels: board.labels || {}, fields: board.fields || [], detail: board.detail || {}, visibility: 'ALL', members: [],
      });
      toast('نُسخت اللوحة — عدّل اسمها وإعداداتها'); await load(); setBoardId(r.id);
    } catch (e) { toast(e.message, 'err'); }
  }
  if (!me || !ctx) {
    return <AppShell active="tasks" title="المهام" sub="ما عليك وما كلّفت به فريقك" me={me}>{error && <div className="notice">{error}</div>}</AppShell>;
  }

  const bcfg = board ? board.card : { fields: {}, custom: [], density: 'comfortable', color: 'none' };
  const bshow = k => (vs.fields[k] !== undefined ? vs.fields[k]
    : k === 'days' ? bcfg.daysInColumn === true : (!board || (bcfg.fields || {})[k] !== false));
  const density = vs.density || bcfg.density;
  const myRole = board ? (board.myRole || 'EDIT') : 'MANAGE';
  const canMove = view !== 'board' || myRole !== 'VIEW';
  const A = all || [];
  const liveSprints = sprints.filter(s => s.state !== 'CLOSED');
  const activeSprint = sprints.find(s => s.state === 'ACTIVE');
  const epics = A.filter(t => t.issueType === 'EPIC');
  const labelSet = [...new Set(A.flatMap(t => t.labels || []))].sort();
  const people = [...new Map(A.map(t => [t.assignee.id, t.assignee])).values()];
  const open = A.filter(t => t.status !== 'DONE').length;

  const boardCols = () => {
    if (!board || board.autoColumns) return Object.entries(STATUS).map(([k, l]) => ({ status: k, label: l, color: null }));
    return board.columns.filter(c => STATUS[c.status] !== undefined).map(c => ({ status: c.status, label: c.name || STATUS[c.status], color: c.color || null, max: c.max || null, min: c.min || null, noCreate: !!c.noCreate }));
  };

  const filtered = (ignoreSprint = false) => {
    const s = q.trim().toLowerCase();
    const bf = (view === 'board' && board) ? (board.filters || {}) : {};
    return A.filter(t =>
      (!bf.projectId || t.projectId === bf.projectId) && (!(bf.issueTypes && bf.issueTypes.length) || bf.issueTypes.includes(t.issueType)) &&
      flt.test(ignoreSprint ? { ...t, sprintId: null } : t) &&
      (!s || t.title.toLowerCase().includes(s) || t.key.toLowerCase().includes(s) || (t.assignee && t.assignee.name.toLowerCase().includes(s))));
  };

  const move = async (taskId, patch, msg) => {
    try { await api('PATCH', '/api/tasks/' + taskId, patch); if (msg) toast(msg); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const openDetail = id => setDetailId(id);

  /* ───────── بطاقة اللوحة ───────── */
  const Card = ({ t }) => {
    const d = dueInfo(t);
    const stripe = bcfg.color === 'priority' ? COLOR_PRI[t.priority] : bcfg.color === 'type' ? (COLOR_TYPE[t.issueType] || '#6b7a90')
      : bcfg.color === 'assignee' ? (t.assignee ? `hsl(${hueOf(t.assignee.name)} 62% 52%)` : '#6b7a90')
        : bcfg.color === 'jql' ? ((jqlRules.find(r => r.fn(t)) || {}).color || '#6b7a90') : '';
    const days = bshow('days') && t.statusChangedAt && t.status !== 'DONE' ? Math.max(0, Math.floor((Date.now() - new Date(t.statusChangedAt).getTime()) / 864e5)) : null;
    return (
      <article className={`kcard issue ${density === 'compact' ? 'compact' : ''} ${(t.labels || []).includes('معوّق') ? 'flagged' : ''}`} style={stripe ? { borderInlineStart: `4px solid ${stripe}` } : undefined}
        draggable={canMove} onClick={() => openDetail(t.id)}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(t.id)); } catch (_) { /* تجاهل */ } e.currentTarget.classList.add('dragging'); }}
        onDragEnd={e => e.currentTarget.classList.remove('dragging')}>
        {bshow('cover') && t.coverUrl && <div className="kcard-cover"><img src={t.coverUrl} alt="" loading="lazy" /></div>}
        {bshow('epic') && t.parent && <div className="epic-tag" title={t.parent.title}><TypeIcon k={t.parent.issueType} ctx={ctx} /> {t.parent.key}</div>}
        {editTitleId === t.id
          ? <input className="ktitle-in" autoFocus defaultValue={t.title} maxLength={120} onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; e.currentTarget.blur(); } }}
            onBlur={e => { const v = e.target.value.trim(); setEditTitleId(null); if (!e.target.dataset.cancel && v && v !== t.title) move(t.id, { title: v }, 'تم تعديل العنوان'); }} />
          : (
            <div className="ktitle"><b>{t.title}</b>
              {canMove && <span className="kacts">
                <button type="button" className="kact" title="تعديل العنوان" aria-label="تعديل العنوان" onClick={e => { e.stopPropagation(); setEditTitleId(t.id); }}><FIcon n="pencil" size={13} /></button>
                <button type="button" className="kact" title="المزيد" aria-label="المزيد" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCm({ t, x: r.left, y: r.bottom + 4 }); }}><FIcon n="dots" size={14} /></button>
              </span>}
            </div>)}
        {bshow('labels') && t.labels && t.labels.length > 0 && <div className="lbls">{t.labels.map(l => <span className="lbl" key={l} style={{ '--lh': hueOf(l) }}>{l}</span>)}</div>}
        {bshow('due') && d && <div className={`kdue ${d.cls}`} title={d.text}>{new Date(t.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{d.cls === 'late' && <FIcon n="warn" size={14} />}{d.cls === 'soon' && <span className="kdue-t">· {d.text}</span>}</div>}
        <div className="meta kbot">
          {bshow('type') && <TypeIcon k={t.issueType} ctx={ctx} />} {bshow('key') && <small className="muted key">{t.key}</small>}
          {bshow('points') && t.storyPoints != null && <span className="sp" title={ctx.fl('points')}>{t.storyPoints}</span>}
          {bshow('checklist') && t.checklist && t.checklist.total > 0 && <span className="kmi"><FIcon n="checksq" size={13} /> {t.checklist.done}/{t.checklist.total}</span>}
          {bshow('epic') && t.children > 0 && <span className="kmi" title="مهام فرعية"><FIcon n="link" size={13} /> {t.children}</span>}
          {bshow('comments') && t.comments > 0 && <span className="kmi"><FIcon n="msg" size={13} /> {t.comments}</span>}
          <span className="grow" style={{ flex: 1 }} />
          {bshow('priority') && <span className={`pri pri-${t.priority}`} data-tip={'الأولوية: ' + (ctx.priority[t.priority] || t.priority)} aria-label={'الأولوية: ' + (ctx.priority[t.priority] || t.priority)}><FIcon n="eq" size={18} /></span>}
          {bshow('assignee') && (t.assignee ? <Avatar name={t.assignee.name} size={24} /> : <span className="kunas" title="غير مسند" />)}
        </div>        {ctx.cfDefs.filter(d2 => (board ? (bcfg.custom || []).includes(d2.key) : d2.card)).map(d2 => {
          const s = cfShort(ctx, d2, (t.customFields || {})[d2.key]);
          return s ? <div className="cf-chip" key={d2.key} title={ctx.cfLabel(d2)}><b>{ctx.cfLabel(d2)}:</b> {s}</div> : null;
        })}
        {days != null && (
          <div className={`dic ${days >= 5 ? 'old' : ''}`} title={`في هذا العمود منذ ${days} يوم`}>
            {[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= Math.max(1, days) ? 'on' : ''} />)}
          </div>
        )}
        {bshow('timer') && t.timer && <div className="cf-chip run"><FIcon n="clock" size={12} /> يعمل عليها الآن</div>}
      </article>
    );
  };

  /* ───────── اللوحة ───────── */
  function BoardView() {
    const [quick, setQuick] = useState({});   // status -> text|undefined
    const [over, setOver] = useState('');
    const [laneOff, setLaneOff] = useState(() => new Set());
    const wrapRef = useRef(null);
    const list = filtered().slice().sort((a, b) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9));
    if (!list.length) return <div className="empty-box"><span className="ico"><Icon name="tasks" /></span><p>لا توجد مهام تطابق الفلاتر.</p></div>;
    const gf = group ? flt.fieldMap.get(group) : null;
    let lanes = [{ id: 0, name: '', items: list }];
    if (gf) {
      const labelOf = new Map(gf.opts.map(o => [o.v, o.sub ? `${o.sub} — ${o.label}` : o.label]));
      const seen = new Map();
      list.forEach(t => { gf.get(t).forEach(v => { if (!seen.has(v)) seen.set(v, []); seen.get(v).push(t); }); });
      lanes = [...seen.entries()].map(([v, items]) => ({ id: v, name: labelOf.get(v) || v, items }));
      const none = list.filter(t => gf.get(t).length === 0);
      if (none.length) lanes.push({ id: '__none', name: gf.none || 'بدون', items: none });
    }
    const cols = boardCols();
    /* أقرب عمود (حالة) أفقياً لموضع المؤشر داخل اللوحة */
    const colAtX = e => {
      let best = null, bd = Infinity;
      e.currentTarget.querySelectorAll(':scope > .col').forEach(c => {
        const r = c.getBoundingClientRect();
        const d = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
        if (d < bd) { bd = d; best = c; }
      });
      return best ? best.dataset.status : null;
    };
    const drop = (e, status) => {
      e.preventDefault(); setOver('');
      const id = +e.dataTransfer.getData('text/plain');
      const t = A.find(x => x.id === id);
      if (!t || t.status === status) return;
      const trs = ((board && board.detail) || {}).transitions || [];
      if (trs.length && !trs.some(x => x.from === t.status && x.to === status)) { toast('هذا الانتقال غير مسموح في سير عمل هذه اللوحة', 'err'); return; }
      move(id, { status }, `نُقلت ${t.key} إلى «${(cols.find(c => c.status === status) || {}).label || STATUS[status]}»`);
    };
    async function create(status, title) {
      try {
        const r = await api('POST', '/api/tasks', { title, priority: 'MEDIUM', issueType: '', ...(spaceId ? { projectId: spaceId } : {}) });
        if (status !== 'TODO') await api('PATCH', '/api/tasks/' + r.id, { status });
        toast('أُنشئت ' + r.key); setQuick({ ...quick, [status]: undefined }); load();
      } catch (e) { toast(e.message, 'err'); }
    }
    return (
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {lanes.map(l => (
          <div key={l.id}>
            {l.name && (
              <h3 className="lane-title" style={{ cursor: 'pointer' }} onClick={() => setLaneOff(s => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}>
                <span className="chev" style={{ display: 'inline-grid', verticalAlign: 'middle', transform: laneOff.has(l.id) ? 'rotate(90deg)' : 'none', marginInlineEnd: 6 }}><FIcon n="chev" size={14} /></span>{l.name} <span className="n">{l.items.length}</span>
              </h3>
            )}
            {!(l.name && laneOff.has(l.id)) && <div className="board"
              /* الإفلات في المساحة الفارغة تحت العمود أو بين الأعمدة يُحسب لأقرب عمود أفقياً */
              onDragOver={e => { if (e.target.closest('.col')) return; const k = colAtX(e); if (k) { e.preventDefault(); setOver(`${l.id}:${k}`); } }}
              onDrop={e => { if (e.target.closest('.col')) return; const k = colAtX(e); if (k) drop(e, k); }}>
              {cols.map(c => {
                const k = c.status, items = l.items.filter(t => t.status === k), folded = folds.has(k);
                const key = `${l.id}:${k}`;
                const total = list.filter(t => t.status === k).length;
                const wip = c.max && total > c.max ? 'wip-over' : c.min && total < c.min ? 'wip-under' : '';
                const common = { onDragOver: e => { e.preventDefault(); setOver(key); }, onDragLeave: () => setOver(''), onDrop: e => drop(e, k) };
                if (folded) {
                  return (
                    <section key={k} data-status={k} className={`col collapsed ${over === key ? 'drop' : ''}`} style={c.color ? { '--colc': c.color } : undefined} {...common}>
                      <div className="col-unfold">
                        <span className="vt">{c.label}</span><span className="n">{items.length}</span>
                        <button type="button" className="fi" title="توسيع العمود" aria-label={`توسيع العمود ${c.label}`}
                          onClick={() => { const n = new Set(folds); n.delete(k); saveFolds(n); }}><UnfoldIcon /></button>
                      </div>
                    </section>
                  );
                }
                return (
                  <section key={k} data-status={k} className={`col ${over === key ? 'drop' : ''}`} data-done={k === 'DONE' ? '1' : undefined} style={c.color ? { '--colc': c.color } : undefined} {...common}>
                    <div className={`col-head ${c.color ? 'colored' : ''} ${wip}`}>
                      <span className="col-title">{c.label}</span>
                      <span className="n col-count" title={c.max ? `الحدّ الأعلى ${c.max}` : undefined}>{items.length}{c.max ? `/${c.max}` : ''}</span>
                      <span className="grow" style={{ flex: 1 }} />
                      <span className="col-tools">
                        {canMove && !c.noCreate && <button type="button" className="col-add" title="إنشاء مهمة في هذا العمود" aria-label="إنشاء" onClick={() => setQuick({ ...quick, [k]: quick[k] === undefined ? '' : undefined })}><FIcon n="plus" size={16} /></button>}
                        <button type="button" className="col-fold" title="تقليص العمود" aria-label="تقليص العمود" onClick={() => { const n = new Set(folds); n.add(k); saveFolds(n); }}><FoldIcon /></button>
                      </span>
                    </div>
                    <div className="col-body">
                      {quick[k] !== undefined && (
                        <div className="col-quick">
                          <input className="input" maxLength={120} placeholder="عنوان المهمة ثم Enter" autoFocus value={quick[k]}
                            onChange={e => setQuick({ ...quick, [k]: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setQuick({ ...quick, [k]: undefined });
                              else if (e.key === 'Enter') { e.preventDefault(); if (quick[k].trim()) create(k, quick[k].trim()); }
                            }} />
                        </div>
                      )}
                      {items.map(t => <Card key={t.id} t={t} />)}
                      {canMove && !c.noCreate && (
                        <button type="button" className="col-create" aria-label="إنشاء مهمة في هذا العمود" title="إنشاء مهمة في هذا العمود"
                          onClick={() => setQuick({ ...quick, [k]: quick[k] === undefined ? '' : undefined })}><FIcon n="plus" size={16} /></button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>}
          </div>
        ))}
        <Minimap watch={[list.length, folds.size, cols.length]} wrapRef={wrapRef} />
      </div>
    );
  }

  /* ───────── القائمة ───────── */
  function ListView() {
    const list = filtered();
    if (!list.length) {
      return (
        <div className="empty-box"><span className="ico"><Icon name="tasks" /></span>
          <p>{A.length ? 'لا توجد مهام تطابق البحث أو الفلتر.' : 'لا توجد مهام هنا بعد. ابدأ بإضافة أول مهمة.'}</p>
          {!A.length && <button className="btn" onClick={() => setForm({ task: null })}>+ إنشاء مهمة</button>}</div>
      );
    }
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>الرقم</th><th>المهمة</th><th>المنفّذ</th><th>الأولوية</th><th>نقاط</th><th>التسليم</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.map(t => {
              const d = dueInfo(t);
              return (
                <tr key={t.id} className={`click ${isOverdue(t) ? 'overdue' : ''}`} onClick={() => openDetail(t.id)}>
                  <td className="nowrap"><TypeIcon k={t.issueType} ctx={ctx} /> <small className="muted key">{t.key}</small></td>
                  <td><b>{t.title}</b>{t.recurrence ? <> <FIcon n="repeat" size={12} /></> : ''} {(t.labels || []).map(l => <span className="lbl" key={l}>{l}</span>)}
                    {t.checklist && t.checklist.total > 0 && <small className="muted kmi"> <FIcon n="checksq" size={12} /> {t.checklist.done}/{t.checklist.total}</small>}
                    {t.comments > 0 && <small className="muted kmi"> <FIcon n="msg" size={12} /> {t.comments}</small>}</td>
                  <td><span className="who"><Avatar name={t.assignee.name} size={24} />{t.assignee.name}</span></td>
                  <td><span className={`badge ${t.priority}`}>{ctx.priority[t.priority] || t.priority}</span></td>
                  <td>{t.storyPoints != null ? <span className="sp">{t.storyPoints}</span> : <span className="muted">—</span>}</td>
                  <td>{d ? <span className={`due ${d.cls}`}>{d.text}</span> : <span className="muted">—</span>}</td>
                  <td><span className={`badge ${t.status}`}>{STATUS[t.status] || t.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /* ───────── Backlog ───────── */
  function BacklogView() {
    const [qType, setQType] = useState('');
    const [qTitle, setQTitle] = useState('');
    const list = filtered(true);
    const backlog = list.filter(t => !t.sprintId && t.status !== 'DONE');
    const dropTo = async (e, to) => {
      e.preventDefault(); e.currentTarget.classList.remove('drop');
      const id = +e.dataTransfer.getData('text/plain');
      const t = A.find(x => x.id === id);
      if (!t || (t.sprintId || null) === to) return;
      move(id, { sprintId: to }, to ? `نُقلت ${t.key} إلى السباق` : `أُعيدت ${t.key} إلى الـ Backlog`);
    };
    const Row = ({ t }) => (
      <div className={`bl-row ${t.status === 'DONE' ? 'done' : ''}`} draggable={canMove} onClick={() => openDetail(t.id)}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(t.id)); } catch (_) { /* تجاهل */ } }}>
        <TypeIcon k={t.issueType} ctx={ctx} /> <small className="muted key">{t.key}</small>
        <span className="bl-title">{t.title}</span>{(t.labels || []).map(l => <span className="lbl" key={l}>{l}</span>)}
        {t.parent && <span className="epic-tag sm">{t.parent.key}</span>}
        <span className="grow" />
        {t.storyPoints != null && <span className="sp">{t.storyPoints}</span>}
        <span className={`badge ${t.status}`}>{STATUS[t.status] || t.status}</span>
        {t.assignee && <Avatar name={t.assignee.name} size={24} />}
      </div>
    );
    const dz = to => ({ onDragOver: e => { e.preventDefault(); e.currentTarget.classList.add('drop'); }, onDragLeave: e => e.currentTarget.classList.remove('drop'), onDrop: e => dropTo(e, to) });
    return (
      <>
        <div className="bl-bar">
          {canTeam && <button className="btn ghost sm" onClick={() => setSprintForm({ sprint: null })}>+ إنشاء سباق</button>}
          <span className="muted small">اسحب المهام بين السباقات والـ Backlog لتخطيط العمل.</span>
        </div>
        {liveSprints.map(s => {
          const items = list.filter(t => t.sprintId === s.id);
          const pts = items.reduce((a, t) => a + (t.storyPoints || 0), 0);
          const doneN = items.filter(t => t.status === 'DONE').length;
          return (
            <section className={`bl-box ${s.state === 'ACTIVE' ? 'active' : ''}`} key={s.id}>
              <header className="bl-head">
                <div>
                  <b>{s.name}</b> <span className={`badge ${s.state === 'ACTIVE' ? 'IN_PROGRESS' : 'TODO'}`}>{s.state === 'ACTIVE' ? 'جارٍ' : 'مخطَّط'}</span>
                  {(s.startDate || s.endDate) && <small className="muted"> {s.startDate || '…'} ← {s.endDate || '…'}</small>}
                  {s.goal && <div className="muted small"><FIcon n="target" size={13} /> {s.goal}</div>}
                </div>
                <div className="bl-stats">
                  <span className="n">{items.length} مهمة</span><span className="n">{pts} نقطة</span><span className="n">{doneN} منجزة</span>
                  {canTeam && (
                    <>
                      {s.state === 'PLANNED' && <button type="button" className="btn sm" onClick={() => setSprintAct({ kind: 'start', sprint: s })}>بدء السباق</button>}
                      {s.state === 'ACTIVE' && <button type="button" className="btn sm ok" onClick={() => setSprintAct({ kind: 'done', sprint: s })}>إنهاء السباق</button>}
                      <button type="button" className="btn sm ghost" onClick={() => setSprintForm({ sprint: s })}>تعديل</button>
                      {s.state !== 'ACTIVE' && <button type="button" className="btn sm danger" onClick={() => ask({ title: 'حذف السباق', text: 'تعود مهامه إلى الـ Backlog.', ok: 'حذف',
                        onOk: async () => { await api('DELETE', '/api/sprints/' + s.id); toast('تم حذف السباق'); load(); } })}>حذف</button>}
                    </>
                  )}
                </div>
              </header>
              <div className="bl-list" {...dz(s.id)}>
                {items.map(t => <Row key={t.id} t={t} />)}
                {!items.length && <p className="muted small bl-empty">اسحب مهاماً من الـ Backlog إلى هنا</p>}
              </div>
            </section>
          );
        })}
        <section className="bl-box">
          <header className="bl-head">
            <div><b>Backlog</b> <small className="muted">مهام غير مجدولة</small></div>
            <div className="bl-stats"><span className="n">{backlog.length} مهمة</span><span className="n">{backlog.reduce((a, t) => a + (t.storyPoints || 0), 0)} نقطة</span></div>
          </header>
          <div className="bl-list" {...dz(null)}>
            {backlog.map(t => <Row key={t.id} t={t} />)}
            {!backlog.length && <p className="muted small bl-empty">لا توجد مهام في الـ Backlog</p>}
          </div>
          <div className="bl-quick">
            <TypeInput ctx={ctx} value={qType} onChange={setQType} className="input" placeholder="النوع (اختياري)" />
            <input className="input" maxLength={120} placeholder="+ أنشئ مهمة سريعة في الـ Backlog (Enter)" value={qTitle} onChange={e => setQTitle(e.target.value)}
              onKeyDown={async e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (!qTitle.trim()) return;
                try { await api('POST', '/api/tasks', { title: qTitle.trim(), issueType: qType, priority: 'MEDIUM' }); setQTitle(''); load(); } catch (ex) { toast(ex.message, 'err'); }
              }} />
          </div>
        </section>
      </>
    );
  }

  return (
    <AppShell active="tasks" title="المهام" sub="ما عليك وما كلّفت به فريقك" me={me}>
      <div className="jira">
      {error && <div className="notice">{error}</div>}
      {/* رأس المشروع مثل Jira: مسار + اسم اللوحة + تبويبات + شريط أدوات بصف واحد */}
      <div className="jp-head">
        <div className="jp-crumb">اللوحات</div>
        <div className="jp-title">
          <span className="jp-ico" aria-hidden="true" style={{ background: ((board && board.detail && board.detail.icon) || {}).c || '#e5484d' }}><FIcon n={((board && board.detail && board.detail.icon) || {}).k || 'layout'} size={16} /></span>
          {boards.length > 1
            ? <BoardSwitch boards={boards} board={board} spaces={spaces} onPick={id => setBoardId(id)} />
            : <h2>{board ? board.name : 'المهام'}</h2>}
          <div className="jf-wrap">
            <BoardMenu canTeam={isCfg} canManage={isCfg && !!board}
              onNew={() => { window.location.href = withBase('/boards?new=1' + (spaceId ? '&space=' + spaceId : '')); }} onSettings={() => { window.location.href = withBase('/boards?id=' + board.id); }} onDuplicate={duplicateBoard} />
          </div>
          
          {myRole === 'VIEW' && <span className="bt ro" title="صلاحيتك على هذه اللوحة: عرض فقط"><FIcon n="eye" size={13} /> عرض فقط</span>}
          <span className="grow" />
          <span className="muted small">{open} مفتوحة</span>
        </div>
        <MobileTabs label="عرض اللوحة" value={view} onPick={pickView}
          tabs={[['board', 'اللوحة'], ['backlog', 'Backlog'], ['list', 'قائمة'], ['calendar', 'التقويم'], ['goals', 'الأهداف'], ['reports', 'التقارير'], ['archive', 'الأرشيف']]} />
        <nav className="jp-tabs m-hide-sm" aria-label="أقسام اللوحة">
          <button type="button" className={view === 'board' ? 'on' : ''} onClick={() => pickView('board')}><Icon name="projects" size={15} /> اللوحة</button>
          <button type="button" className={view === 'backlog' ? 'on' : ''} onClick={() => pickView('backlog')}><Icon name="menu" size={15} /> Backlog</button>
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')}><Icon name="tasks" size={15} /> قائمة</button>
          <button type="button" className={view === 'calendar' ? 'on' : ''} onClick={() => pickView('calendar')}><Icon name="calendar" size={15} /> التقويم</button>
          <button type="button" className={view === 'goals' ? 'on' : ''} onClick={() => pickView('goals')}><Icon name="goals" size={15} /> الأهداف</button>
          <button type="button" className={view === 'reports' ? 'on' : ''} onClick={() => pickView('reports')}><Icon name="reports" size={15} /> التقارير</button>
          <button type="button" className={view === 'archive' ? 'on' : ''} onClick={() => pickView('archive')}><FIcon n="folder" size={15} /> الأرشيف</button>
        </nav>
      </div>

      {canArchive && arch && arch.tasks.length > 0 && view !== 'archive' && (
        <div className="arch-banner" role="status">
          <span className="arch-ic" aria-hidden="true"><FIcon n="folder" size={18} /></span>
          <div className="arch-tx"><b>{arch.tasks.length} مهمة منجزة منذ أكثر من {arch.days} يوماً</b><small>تنتظر موافقتك لنقلها إلى الأرشيف. تجدها لاحقاً بتبويب «الأرشيف» ويمكنك استرجاعها.</small></div>
          <button type="button" className="btn sm" onClick={() => setArchOpen(true)}>مراجعة وأرشفة</button>
        </div>
      )}
      <div className="jp-bar">
        <label className="search-field jp-search"><Icon name="search" size={15} />
          <input className="input" placeholder="بحث في اللوحة" value={q} autoComplete="off" onChange={e => setQ(e.target.value)} /></label>
        <TaskFilterBar ctx={ctx} fields={flt.fields} fieldMap={flt.fieldMap} filter={filter} setFilter={setFilter} error={flt.error}
          group={group} setGroup={setGroup} showGroup={view === 'board'} tasks={A} boardKey={board ? board.id : 0} showQuick={vs.quick} />
        <span className="grow" />
        <div className="seg jp-scope">
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>مهامي</button>
          {canTeam && <button className={scope === 'team' ? 'active' : ''} onClick={() => setScope('team')}>مهام فريقي</button>}
          {canTeam && <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>الكل</button>}
        </div>
        <ViewSettings vs={vs} upd={updVs} view={view} />
        <button className="btn jp-create" onClick={() => setForm({ task: null, preset: spaceId ? { projectId: spaceId } : null })}><Icon name="plus" /> {ctx.fl('createBtn')}</button>
      </div>
      <div id="tasksBody">
        {all && (view === 'board' ? <BoardView />
          : view === 'backlog' ? <BacklogView />
          : view === 'calendar' ? <TaskCalendar tasks={filtered(true)} ctx={ctx} onOpen={openDetail} onMove={move} onCreate={k => setForm({ task: null, preset: { dueDate: k } })} />
          : view === 'goals' ? <TaskGoals tasks={filtered(true)} onOpen={openDetail} onCreate={gid => setForm({ task: null, preset: { goalId: gid } })} />
          : view === 'reports' ? <TaskReports tasks={filtered(true)} ctx={ctx} sprints={sprints} onOpen={openDetail} />
          : view === 'archive' ? <ArchiveView pid={spaceId} onOpen={openDetail} toast={toast} onChanged={() => { load(); loadArch(); }} />
          : <ListView />)}
      </div>

      {archOpen && arch && <ArchiveReview data={arch} onClose={() => setArchOpen(false)} toast={toast}
        onDone={n => { setArchOpen(false); toast(`نُقلت ${n} مهمة إلى الأرشيف — تجدها بتبويب «الأرشيف»`); load(); loadArch(); }} onOpen={openDetail} />}
      {form && <TaskForm ctx={ctx} task={form.task} boardOptions={boards.filter(b => (b.filters || {}).projectId).map(b => ({ id: b.id, name: b.name, projectId: b.filters.projectId }))} defaultProjectId={spaceId || ''} lockBoard={!!spaceId && !form.task && !form.free} preset={form.preset} onClose={() => setForm(null)} onError={m => toast(m, 'err')} onNotice={m => { toast(m); load(); }}
        onSaved={(msg, newId) => {
          const wasNew = !form.task;
          setForm(null);
          if (wasNew && newId) {
            toast(msg, 'ok', [
              { label: 'عرض المهمة', onClick: () => setDetailId(newId) },
              { label: 'نسخ الرابط', onClick: () => { copyText(window.location.origin + '/tasks?open=' + newId); } },
            ]);
          } else toast(msg);
          load();
        }} />}
      {cm && <CardMenu cm={cm} ctx={ctx} spaces={spaces} onClose={() => setCm(null)} move={move} toast={toast} ask={ask} open={id => { setCm(null); setDetailId(id); }} reload={load} />}
      {detailId && <TaskDetail id={detailId} ctx={ctx} onClose={() => setDetailId(null)} onOpen={setDetailId} onToast={toast}
        onEdit={t => { setDetailId(null); setForm({ task: t }); }} onConfigure={board ? () => { window.location.href = withBase('/boards?id=' + board.id); } : undefined} onChanged={load} />}

      {sprintForm && <SprintForm sprint={sprintForm.sprint} onClose={() => setSprintForm(null)} onSaved={() => { setSprintForm(null); toast('تم الحفظ'); load(); }} />}
      {sprintAct && <SprintAction {...sprintAct} live={liveSprints} onClose={() => setSprintAct(null)}
        onDone={msg => { setSprintAct(null); toast(msg); load(); }} />}
      {confirmNode}
      {toastNode}
      </div>
    </AppShell>
  );
}

/* خريطة اللوحة المصغّرة: تظهر عند وجود أعمدة أكثر من عرض الشاشة */
function Minimap({ watch, wrapRef }) {
  const [hidden, setHidden] = useState(true);
  const trackRef = useRef(null);
  const viewRef = useRef(null);
  const W = 168;
  useEffect(() => {
    const wrap = wrapRef.current;
    const board = wrap && wrap.querySelector('.board');
    const track = trackRef.current, view = viewRef.current;
    if (!board || !track || !view) { setHidden(true); return undefined; }
    const rtl = () => getComputedStyle(board).direction === 'rtl';
    const maxScroll = () => Math.max(0, board.scrollWidth - board.clientWidth);
    const physLeft = () => (rtl() ? maxScroll() + board.scrollLeft : board.scrollLeft);
    const setPhysLeft = p => { const v = Math.min(maxScroll(), Math.max(0, p)); board.scrollLeft = rtl() ? v - maxScroll() : v; };
    const sync = () => {
      const sw = board.scrollWidth, cw = board.clientWidth;
      if (!sw) return;
      view.style.left = (physLeft() / sw * W).toFixed(1) + 'px';
      view.style.width = Math.max(14, cw / sw * W).toFixed(1) + 'px';
    };
    const build = () => {
      const sw = board.scrollWidth, cw = board.clientWidth;
      const hide = sw <= cw + 4;
      setHidden(hide);
      if (hide) return;
      track.querySelectorAll('.bm-col').forEach(x => x.remove());
      const br = board.getBoundingClientRect();
      [...board.querySelectorAll(':scope > .col')].forEach(c => {
        const n = c.querySelectorAll('.kcard').length;
        const b = document.createElement('i');
        b.className = 'bm-col' + (c.classList.contains('collapsed') ? ' fold' : '');
        const cr = c.getBoundingClientRect();
        const x = cr.left - br.left + physLeft();
        b.style.left = Math.max(0, x / sw * W).toFixed(1) + 'px';
        b.style.width = Math.max(3, cr.width / sw * W - 2).toFixed(1) + 'px';
        b.style.height = Math.min(100, 28 + n * 9) + '%';
        track.insertBefore(b, view);
      });
      sync();
    };
    let dragging = false;
    const move = ev => {
      const r = track.getBoundingClientRect();
      setPhysLeft(((ev.clientX - r.left) / W) * board.scrollWidth - board.clientWidth / 2);
    };
    const down = ev => { dragging = true; track.setPointerCapture(ev.pointerId); move(ev); view.classList.add('drag'); };
    const mv = ev => { if (dragging) move(ev); };
    const end = () => { dragging = false; view.classList.remove('drag'); };
    track.addEventListener('pointerdown', down); track.addEventListener('pointermove', mv);
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
    board.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(build);
    ro.observe(board);
    build();
    return () => {
      track.removeEventListener('pointerdown', down); track.removeEventListener('pointermove', mv);
      track.removeEventListener('pointerup', end); track.removeEventListener('pointercancel', end);
      board.removeEventListener('scroll', sync); ro.disconnect();
    };
  }, [wrapRef, ...watch]);   // eslint-disable-line react-hooks/exhaustive-deps
  const node = (
    <div className="board-mini" hidden={hidden}>
      <div className="bm-track" role="slider" aria-label="التنقّل بين أعمدة اللوحة" ref={trackRef} style={{ width: W }}><div className="bm-view" ref={viewRef} /></div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(node, document.body);
}

function SprintForm({ sprint: s, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [f, setF] = useState({ name: s ? s.name : 'Sprint ' + (Math.floor(Math.random() * 90) + 10), goal: (s && s.goal) || '', startDate: (s && s.startDate) || '', endDate: (s && s.endDate) || '', projectId: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (!s) api('GET', '/api/projects').then(setProjects).catch(() => {}); }, [s]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const body = { name: f.name, goal: f.goal || null, startDate: f.startDate || null, endDate: f.endDate || null };
    try {
      if (s) await api('PATCH', '/api/sprints/' + s.id, body);
      else await api('POST', '/api/sprints', { ...body, projectId: f.projectId ? +f.projectId : null });
      onSaved();
    } catch (ex) { setErr(ex.message); }
  }
  return (
    <Modal title={s ? 'تعديل السباق' : 'سباق جديد'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>اسم السباق</span><input value={f.name} required maxLength={80} onChange={set('name')} /></label>
        <label className="field"><span>هدف السباق (اختياري)</span><input value={f.goal} maxLength={255} onChange={set('goal')} /></label>
        <div className="row2">
          <label className="field"><span>البداية</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field"><span>النهاية</span><input type="date" value={f.endDate} onChange={set('endDate')} /></label>
        </div>
        {!s && <label className="field"><span>المساحة (اختياري)</span>
          <select value={f.projectId} onChange={set('projectId')}><option value="">— بدون —</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function SprintAction({ kind, sprint: s, live, onClose, onDone }) {
  const [start, setStart] = useState(s.startDate || todayStr());
  const [end, setEnd] = useState(s.endDate || addDaysStr(todayStr(), 14));
  const [moveTo, setMoveTo] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      if (kind === 'start') { await api('PATCH', '/api/sprints/' + s.id, { action: 'start', startDate: start || null, endDate: end || null }); onDone('بدأ السباق'); }
      else { await api('PATCH', '/api/sprints/' + s.id, { action: 'complete', moveTo: moveTo ? +moveTo : null }); onDone('أُنهي السباق'); }
    } catch (ex) { setErr(ex.message); }
  }
  return (
    <Modal title={(kind === 'start' ? 'بدء السباق — ' : 'إنهاء السباق — ') + s.name} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {kind === 'start' ? (
          <>
            <div className="row2">
              <label className="field"><span>البداية</span><input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
              <label className="field"><span>النهاية</span><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
            </div>
            <p className="muted small">يوجد سباق جارٍ واحد فقط لكل مساحة.</p>
          </>
        ) : (
          <>
            <p className="muted">المهام المنجزة تبقى بالسباق. أين تنقل المهام غير المنتهية؟</p>
            <label className="field"><span>نقل غير المنتهية إلى</span>
              <select value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                <option value="">Backlog</option>{live.filter(x => x.id !== s.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></label>
          </>
        )}
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">{kind === 'start' ? 'بدء' : 'إنهاء السباق'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* إعدادات العرض الشخصية (مثل View settings في Jira) */
const VS_FIELDS = [['cover', 'صورة الغلاف'], ['type', 'نوع المهمة'], ['key', 'الرقم'], ['epic', 'الملحمة'], ['priority', 'الأولوية'], ['assignee', 'المنفّذ'],
  ['points', 'نقاط القصة'], ['due', 'تاريخ التسليم'], ['labels', 'الوسوم'], ['checklist', 'قائمة التحقق'], ['comments', 'التعليقات'], ['progress', 'التقدّم'], ['days', 'أيام في العمود']];
function ViewSettings({ vs, upd, view }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const side = (() => { try { return localStorage.getItem('rb-tdside') === '1'; } catch (_) { return false; } })();
  const [sideNow, setSideNow] = useState(side);
  return (
    <div className="jf-wrap" ref={ref}>
      <button type="button" className="btn ghost jf-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="إعدادات العرض" aria-label="إعدادات العرض"><FIcon n="gear" size={16} /></button>
      {open && (
        <div className="jf-pop vs-pop" role="dialog" aria-label="إعدادات العرض">
          <div className="vs-sec">
            <b>خيارات تخصّك وحدك</b>
            <label className="switch-row"><span>فتح المهام في لوحة جانبية</span>
              <input type="checkbox" checked={sideNow} onChange={e => { setSideNow(e.target.checked); try { localStorage.setItem('rb-tdside', e.target.checked ? '1' : '0'); } catch (_) { /* تجاهل */ } }} /></label>
            <label className="switch-row"><span>إظهار الفلاتر السريعة كأزرار</span>
              <input type="checkbox" checked={vs.quick} onChange={e => upd({ quick: e.target.checked })} /></label>
            <label className="switch-row"><span>شاشة كاملة</span>
              <input type="checkbox" checked={vs.full} onChange={e => upd({ full: e.target.checked })} /></label>
            <div className="field" style={{ margin: '6px 0 0' }}><span>كثافة البطاقات</span>
              <div className="seg">
                {[['', 'حسب اللوحة'], ['comfortable', 'افتراضية'], ['compact', 'مضغوطة']].map(([k, l]) => (
                  <button type="button" key={k} className={vs.density === k ? 'active' : ''} onClick={() => upd({ density: k })}>{l}</button>
                ))}
              </div></div>
          </div>
          {view === 'board' && (
            <div className="vs-sec">
              <b>الحقول على البطاقة</b>
              <div className="pick-list cols">
                {VS_FIELDS.map(([k, l]) => (
                  <label className="check" key={k}>
                    <input type="checkbox" checked={vs.fields[k] !== false} onChange={e => upd({ fields: { ...vs.fields, [k]: e.target.checked } })} /> {l}
                  </label>
                ))}
              </div>
              <button type="button" className="jf-link" onClick={() => upd({ fields: {} })}>إعادة إعدادات اللوحة</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* أيقونات التقليص/التكبير: سهمان متلاقيان = تقليص، سهمان متعاكسان = تكبير */
const svgp = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
function FoldIcon() {
  return <svg {...svgp}><path d="M3 12h7M7 8l3 4-3 4" /><path d="M21 12h-7M17 8l-3 4 3 4" /></svg>;
}
function UnfoldIcon() {
  return <svg {...svgp}><path d="M10 12H3M6 8l-3 4 3 4" /><path d="M14 12h7M18 8l3 4-3 4" /></svg>;
}

/* قائمة «...» بجانب اسم اللوحة: لوحة جديدة / تخصيص اللوحة */
function BoardMenu({ canTeam, canManage, onNew, onSettings, onDuplicate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  if (!canTeam && !canManage) return null;
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="jp-more" aria-label="خيارات اللوحة" onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="jf-menu" style={{ insetInlineStart: 0, insetInlineEnd: 'auto' }}>
          {canManage && <button type="button" onClick={() => { setOpen(false); onSettings(); }}><FIcon n="gear" size={14} /> تخصيص اللوحة</button>}
          {canManage && <button type="button" onClick={() => { setOpen(false); onDuplicate(); }}>⧉ تكرار هذه اللوحة (بكل إعداداتها)</button>}
          {canTeam && <button type="button" onClick={() => { setOpen(false); onNew(); }}>+ لوحة جديدة</button>}
        </div>
      )}
    </span>
  );
}

/* قائمة «⋯» على بطاقة المهمة (نقل للوحة، تغيير الحالة، نسخ، علم، حذف…) */
function CardMenu({ cm, ctx, spaces, onClose, move, toast, ask, open, reload }) {
  const { t } = cm;
  const [sub, setSub] = useState('');
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: cm.x, top: cm.y });
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [onClose]);
  useEffect(() => {   // إبقاء القائمة داخل الشاشة
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let left = cm.x, top = cm.y;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, cm.y - r.height - 34);
    setPos({ left, top });
  }, [cm, sub]);
  const copy = async (txt, msg) => { const ok = await copyText(txt); toast(ok ? msg : 'انسخه يدوياً: ' + txt); onClose(); };
  const flagged = (t.labels || []).includes('معوّق');
  const Item = ({ children, onClick, danger, arrow, on }) => <button type="button" role="menuitem" className={`cm-item ${danger ? 'danger' : ''} ${on ? 'on' : ''}`} onClick={onClick}><span>{children}</span>{arrow && <FIcon n="chev" size={14} />}</button>;
  return createPortal(
    <div className="cm" ref={ref} role="menu" style={{ left: pos.left, top: pos.top }}>
      <Item arrow on={sub === 'space'} onClick={() => setSub(sub === 'space' ? '' : 'space')}>نقل المهمة إلى لوحة</Item>
      {sub === 'space' && <div className="cm-sub">
        <Item onClick={() => { onClose(); move(t.id, { projectId: null }, 'نُقلت بدون لوحة'); }}>بدون لوحة</Item>
        {spaces.map(s => <Item key={s.id} on={t.projectId === s.id} onClick={() => { onClose(); move(t.id, { projectId: s.id }, `نُقلت إلى «${s.name}»`); }}>{s.name}</Item>)}
      </div>}
      <Item arrow on={sub === 'status'} onClick={() => setSub(sub === 'status' ? '' : 'status')}>تغيير الحالة</Item>
      {sub === 'status' && <div className="cm-sub">
        {ctx.statusOpts(t.status).filter(([k]) => k !== t.status).map(([k, l]) => <Item key={k} onClick={() => { onClose(); move(t.id, { status: k }, `نُقلت إلى «${l}»`); }}>{l}</Item>)}
        {!ctx.statusOpts(t.status).filter(([k]) => k !== t.status).length && <div className="cm-empty">لا توجد انتقالات متاحة</div>}
      </div>}
      <div className="cm-sep" />
      <Item onClick={() => copy(`${window.location.origin}/tasks?open=${t.id}`, 'نُسخ رابط المهمة')}>نسخ الرابط</Item>
      <Item onClick={() => copy(t.key, 'نُسخ ' + t.key)}>نسخ الرقم</Item>
      <div className="cm-sep" />
      <Item onClick={() => open(t.id)}>ربط مهمة</Item>
      <Item onClick={() => open(t.id)}>تغيير الأم / الملحمة</Item>
      <Item onClick={() => open(t.id)}>اختيار غلاف</Item>
      <Item onClick={() => open(t.id)}>تعديل الوسوم</Item>
      <Item onClick={() => { onClose(); move(t.id, { labels: flagged ? (t.labels || []).filter(l => l !== 'معوّق') : [...(t.labels || []), 'معوّق'] }, flagged ? 'أُزيل العلم' : 'أُضيف علم «معوّق»'); }}>{flagged ? 'إزالة العلم' : 'إضافة علم (معوّق)'}</Item>
      <div className="cm-sep" />
      <Item danger onClick={() => { onClose(); ask({ title: 'حذف المهمة', text: `سيتم حذف ${t.key} وتعليقاتها نهائياً.`, ok: 'حذف', onOk: async () => { try { await api('DELETE', '/api/tasks/' + t.id); toast('تم الحذف'); reload(); } catch (e) { toast(e.message, 'err'); } } }); }}>حذف المهمة</Item>
    </div>, document.body);
}

/* مبدّل اللوحات: زر باسم اللوحة + قائمة منسدلة بنفس هوية الموقع */
function BoardSwitch({ boards, board, spaces, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, []);
  const spaceOf = b => spaces.find(s => s.id === (b.filters || {}).projectId);
  return (
    <span className="bsw" ref={ref}>
      <button type="button" className={`bsw-btn ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="bsw-name">{board ? board.name : 'المهام'}</span><FIcon n="chev" size={16} />
      </button>
      {open && (
        <div className="bsw-menu" role="listbox">
          <div className="bsw-head">اللوحات</div>
          {boards.map(b => {
            const sp = spaceOf(b);
            return (
              <button type="button" role="option" aria-selected={board && b.id === board.id} key={b.id} className={`bsw-item ${board && b.id === board.id ? 'on' : ''}`} onClick={() => { setOpen(false); onPick(b.id); }}>
                <span className="jp-ico bsw-ico" aria-hidden="true" style={{ background: ((b.detail || {}).icon || {}).c || '#e5484d' }}><FIcon n={((b.detail || {}).icon || {}).k || 'layout'} size={13} /></span>
                <span className="bsw-n">{b.name}</span>
                {sp && sp.key && <small className="bsw-k">{sp.key}</small>}
                {board && b.id === board.id && <FIcon n="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
/* ═══ الأرشيف ═══ */
const fmtD = s => { try { return new Date(s).toLocaleDateString('en-CA'); } catch (_) { return ''; } };

/* مراجعة المهام المنجزة منذ أكثر من 90 يوماً: المحدّد يُؤرشَف بموافقتك، وغير المحدّد يبقى */
function ArchiveReview({ data, onClose, onDone, toast, onOpen }) {
  const [sel, setSel] = useState(() => new Set(data.tasks.map(t => t.id)));
  const [busy, setBusy] = useState(false);
  const toggle = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = sel.size === data.tasks.length;
  async function go() {
    if (!sel.size) return;
    setBusy(true);
    try { const r = await api('POST', '/api/tasks/archive', { ids: [...sel] }); onDone(r && r.count != null ? r.count : sel.size); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  return (
    <Modal title="أرشفة المهام المنجزة" wide onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>ليس الآن</button>
          <button type="button" className="btn" disabled={busy || !sel.size} onClick={go}>أرشفة المحدّد ({sel.size})</button>
        </>
      )}>
      <p className="muted small">مهام منجزة منذ أكثر من {data.days} يوماً. الأرشفة تُخرجها من اللوحة والقوائم، وتنتقل إلى تبويب «الأرشيف» داخل هذه اللوحة، ومنه تستطيع <b>استرجاعها</b> بأي وقت. أزل التحديد عمّا تريد إبقاءه.</p>
      <label className="check arch-all"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(data.tasks.map(t => t.id)))} /> تحديد الكل</label>
      <div className="arch-list">
        {data.tasks.map(t => (
          <label className="arch-row" key={t.id}>
            <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
            <span className="arch-key" dir="ltr">{t.key}</span>
            <span className="arch-title">{t.title}</span>
            <span className="muted small arch-date">أُنجزت {fmtD(t.completedAt)}</span>
            <button type="button" className="jf-link" onClick={e => { e.preventDefault(); onOpen(t.id); }}>عرض</button>
          </label>
        ))}
      </div>
    </Modal>
  );
}

/* تبويب الأرشيف: المهام المؤرشفة لهذه اللوحة مع الاسترجاع لمسؤول اللوحة */
function ArchiveView({ pid, onOpen, toast, onChanged }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    if (!pid) { setD({ canRestore: false, tasks: [] }); return; }
    try { setD(await api('GET', '/api/tasks/archive?projectId=' + pid)); } catch (e) { toast(e.message, 'err'); setD({ canRestore: false, tasks: [] }); }
  }, [pid]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  async function restore(t) {
    try { await api('POST', '/api/tasks/unarchive', { ids: [t.id] }); toast(`أُعيدت «${t.title}» إلى اللوحة`); await load(); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  }
  if (!d) return null;
  const s = q.trim().toLowerCase();
  const list = d.tasks.filter(t => !s || t.title.toLowerCase().includes(s) || String(t.key).toLowerCase().includes(s));
  return (
    <div className="arch-view">
      <div className="arch-head">
        <div><b>الأرشيف</b><small className="muted"> — مهام منجزة منذ أكثر من 90 يوماً أُرشفت بموافقة مسؤول اللوحة</small></div>
        <label className="search-field jp-search"><Icon name="search" size={15} /><input className="input" placeholder="بحث بالأرشيف" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      {!list.length && <div className="empty-box"><span className="ico"><FIcon n="folder" size={22} /></span><p>{d.tasks.length ? 'لا نتائج للبحث.' : 'لا توجد مهام مؤرشفة بهذه اللوحة بعد.'}</p></div>}
      {list.length > 0 && (
        <div className="arch-list view">
          {list.map(t => (
            <div className="arch-row" key={t.id}>
              <span className="arch-key" dir="ltr">{t.key}</span>
              <button type="button" className="arch-title link" onClick={() => onOpen(t.id)}>{t.title}</button>
              <span className="muted small arch-date">أُنجزت {fmtD(t.completedAt)} · أُرشفت {fmtD(t.archivedAt)}</span>
              {d.canRestore && <button type="button" className="btn sm ghost" onClick={() => restore(t)}>استرجاع</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}