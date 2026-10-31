'use client';
/* تفاصيل المهمة على طريقة Jira — ترحيل taskDetail (tasks-pro.js). */
import { useCallback, useEffect, useState , useRef, Children, cloneElement } from 'react';
import { FIcon } from './Icon';
import { api } from '../lib/api';
import { fmtDT, ROLE } from '../lib/constants';
import { STATUS as STATUS_MAP, todayStr } from '../lib/util';
import { copyText } from '../lib/clipboard';
import { shrinkImage } from '../lib/image';
import { capsOf } from '../lib/spacePerms';
import MentionInput from './MentionInput';
import { cfShort, fmtMin, IT_ICON, itKind, LINK_LABEL, parseMin, PRI_ICON, TH_FIELD } from '../lib/tasks';
import { Avatar, Modal } from './ui';
import { StatusMenu } from './StatusMenu';
import CfInput from './CustomFields';
import TypeInput from './TypeInput';
import { FilesBlock, uploadFiles } from './Files';
import { resolveIssueKey } from './TaskForm';
import { useConfirm } from './hooks';

const TI = {
  TASK: <><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="#4c8dff" strokeWidth="2" /><path d="m8 12.5 3 3 5-6" fill="none" stroke="#4c8dff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>,
  BUG: <><rect x="3" y="3" width="18" height="18" rx="4" fill="#e5484d" /><circle cx="12" cy="12" r="3.4" fill="#fff" /></>,
  STORY: <><rect x="3" y="3" width="18" height="18" rx="4" fill="#2fa56b" /><path d="M8.5 6.5h7v11l-3.5-2.6-3.5 2.6z" fill="#fff" /></>,
  EPIC: <><rect x="3" y="3" width="18" height="18" rx="4" fill="#8e4ec6" /><path d="m13 5-5 8h3.5L10.5 19 16 11h-3.5z" fill="#fff" /></>,
  SUBTASK: <><rect x="3" y="3" width="18" height="18" rx="4" fill="#4aa3c7" /><path d="M8 8h4v4H8zM12 14h4v4h-4zM10 12v3h2" fill="none" stroke="#fff" strokeWidth="1.6" /></>,
  OTHER: <><rect x="3" y="3" width="18" height="18" rx="4" fill="#6b7a90" /></>,
};
export const TypeIcon = ({ k, ctx }) => !k ? null : <span className="tyi" title={(ctx && ctx.itype[k]) || k}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">{TI.TASK}</svg></span>;

/* أيقونة خطّية صغيرة لأزرار رأس النافذة */
const HI = ({ d, sw = 2 }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

export default function TaskDetail({ id, ctx, onClose, onOpen, onEdit, onChanged, onToast, onConfigure }) {
  const [t, setT] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [tab, setTab] = useState('comments');
  /* عرض العمود الجانبي: يُسحب من الفاصل أو يُطوى بزر، ويُحفظ لكل مستخدم */
  const gridRef = useRef(null);
  const [sideW, setSideW] = useState(420);
  const [sideOff, setSideOff] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    try { const w = +localStorage.getItem('kata-td-side'); if (w >= 260) setSideW(w); } catch (_) { /* تجاهل */ }
  }, []);
  const saveSide = (w, off) => { try { localStorage.setItem('kata-td-side', String(Math.round(w))); localStorage.setItem('kata-td-side-off', off ? '1' : '0'); } catch (_) { /* تجاهل */ } };
  const startSplit = e => {
    e.preventDefault();
    const g = gridRef.current; if (!g) return;
    const rect = g.getBoundingClientRect();
    setDragging(true); setSideOff(false);
    let last = sideW;
    const mv = ev => { last = Math.max(260, Math.min(Math.min(760, rect.width - 380), rect.right - ev.clientX - 7)); setSideW(last); };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); setDragging(false); saveSide(last, false); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  /* حجم صندوق الغلاف: يسحبه المستخدم من الزاوية (يُحفظ له) · نقر مزدوج على المقبض = الافتراضي */
  const coverRef = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 200, h: 130 });
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('kata-cover-size') || 'null'); if (s && s.w >= 100 && s.h >= 70) setCvSize({ w: s.w, h: s.h }); } catch (_) { /* تجاهل */ } }, []);
  const startCoverResize = e => {
    e.preventDefault(); e.stopPropagation();
    const el = coverRef.current; if (!el) return;
    const rect = el.getBoundingClientRect(), maxW = Math.max(160, Math.min(640, (el.parentElement ? el.parentElement.getBoundingClientRect().width : 640)));
    let last = cvSize;
    const mv = ev => { last = { w: Math.round(Math.max(100, Math.min(maxW, ev.clientX - rect.left))), h: Math.round(Math.max(70, Math.min(460, ev.clientY - rect.top))) }; setCvSize(last); };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); try { localStorage.setItem('kata-cover-size', JSON.stringify(last)); } catch (_) { /* تجاهل */ } };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  const resetCover = () => { const d = { w: 200, h: 130 }; setCvSize(d); try { localStorage.removeItem('kata-cover-size'); } catch (_) { /* تجاهل */ } };
  const toggleSplit = () => setSideOff(o => { saveSide(sideW, !o); return !o; });
  const resetSide = () => { setSideW(420); setSideOff(false); saveSide(420, false); };
  const [editCm, setEditCm] = useState(null);
  const [editCmText, setEditCmText] = useState('');
  const [folded, setFolded] = useState(() => new Set());
  const [side, setSide] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  useEffect(() => { try { setSide(localStorage.getItem('rb-tdside') === '1'); } catch (_) { /* لا تخزين */ } }, []);
  const toggleSide = () => setSide(s => { const n = !s; try { localStorage.setItem('rb-tdside', n ? '1' : '0'); } catch (_) { /* تجاهل */ } return n; });
  const [menu, setMenu] = useState('');
  const [cover, setCover] = useState(null);
  const [coverPick, setCoverPick] = useState(null);
  const coverInput = useRef(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [childTitle, setChildTitle] = useState('');
  const [childType, setChildType] = useState('');
  const [pins, setPins] = useState([]);
  useEffect(() => { try { setPins(JSON.parse(localStorage.getItem('rb-pinned') || '[]')); } catch (_) { setPins([]); } }, []);
  const [linkType, setLinkType] = useState('BLOCKS');
  const [linkKey, setLinkKey] = useState('');
  const [wl, setWl] = useState({ time: '', date: todayStr(), note: '' });
  const [editDesc, setEditDesc] = useState(null);
  const [labelNew, setLabelNew] = useState('');

  const fail = e => onToast(e.message, 'err');
  const reload = useCallback(async (alsoRefresh = true) => {
    try { setT(await api('GET', '/api/tasks/' + id)); if (alsoRefresh) onChanged(); } catch (e) { onToast(e.message, 'err'); }
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(false); api('GET', '/api/sprints').then(setSprints).catch(() => {}); }, [reload]);
  useEffect(() => {
    if (!t || !t.coverFileId) { setCover(null); return; }
    api('GET', `/api/attachments?entity=task&id=${id}`).then(d => {
      const f = (d.files || d).find(x => x.id === t.coverFileId);
      setCover(f ? f.url : null);
    }).catch(() => setCover(null));
  }, [t && t.coverFileId, id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // اختصار M للتعليق (مثل Jira)
    const onKey = e => {
      if (!(e.code === 'KeyM' || e.key.toLowerCase() === 'm') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      const el = document.getElementById('newComment');
      if (el) { e.preventDefault(); setTab('comments'); el.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!t) return null;

  const patch = async (body, okMsg) => {
    try { await api('PATCH', '/api/tasks/' + id, body); if (okMsg) onToast(okMsg); await reload(); } catch (e) { fail(e); await reload(false); }
  };
  const act = fn => async () => { try { await fn(); } catch (e) { fail(e); } };

  const names = new Map([[ctx.me.user.id, ctx.me.user.name], [t.assignee.id, t.assignee.name], [t.creator.id, t.creator.name]]);
  /* من يمكن الإشارة إليهم بـ @: من على هذه اللوحة (المضافون يدوياً إن وُجدوا، وإلا فريق اللوحة) + من يخصّ المهمة */
  const spPerms = ctx.space && ctx.space.perms;
  const explicitBoard = !!(spPerms && Object.keys(spPerms.users || {}).length);
  const mentionPeople = (() => {
    const m = new Map();
    (t.mentionable || []).forEach(p => m.set(p.id, p));
    (explicitBoard ? ctx.users.filter(u => (capsOf((spPerms.users || {})[u.id]) || []).includes('view')) : ctx.users).forEach(p => m.set(p.id, p));
    m.delete(ctx.me.user.id);
    return [...m.values()];
  })();
  mentionPeople.forEach(p => names.set(p.id, p.name));
  t.comments.forEach(c => names.set(c.user.id, c.user.name));
  const renderMention = body => String(body).replace(/@\[(\d+)\]/g, (_, n) => '@' + (names.get(+n) || 'مستخدم'));
  const toMe = body => new RegExp('@\\[' + ctx.me.user.id + '\\]').test(body);
  const encodeMention = body => {
    let out = body;
    [...mentionPeople].sort((a, b) => b.name.length - a.name.length).forEach(u => { out = out.split('@' + u.name).join(`@[${u.id}]`); });
    return out;
  };

  const items = t.items || [];
  const doneN = items.filter(i => i.done).length;
  const ed = t.canManage, up = t.canUpdate;
  const est = t.estimateMin, spent = t.timeSpentMin || 0;
  const pctSpent = est ? Math.min(100, Math.round(spent / est * 100)) : 0;
  const grouped = {};
  (t.links || []).forEach(l => { const k = LINK_LABEL[l.type + ':' + l.direction]; (grouped[k] = grouped[k] || []).push(l); });
  const childDone = (t.childIssues || []).filter(c => c.status === 'DONE').length;
  const statusName = k => STATUS_MAP[k] || k;
  /* تخطيط حقول هذا النوع (من الإعدادات ← أنواع المهام): يتفوّق على ترتيب اللوحة إن وُجد */
  const lay = ctx.layoutFor(t.issueType || 'NONE');
  const showSec = k => !lay || lay.description.includes(k);
  const allCf = ctx.cfFor(t);
  const pickCf = keys => keys.map(k => allCf.find(d => 'cf:' + d.key === k)).filter(Boolean);
  const cfSide = lay ? pickCf(lay.context) : ctx.cfFor(t, 'side');
  const cfMain = lay ? pickCf(lay.description) : ctx.cfFor(t, 'main');
  const core = k => ctx.show(k) && (!lay || lay.context.includes(k) || lay.description.includes(k));
  const foldToggle = k => setFolded(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const Panel = ({ k, title, children }) => (
    <section className={`td-panel ${folded.has(k) ? 'folded' : ''}`}>
      <h4 className="fold" onClick={() => foldToggle(k)}><span className="chev"><FIcon n="chev" size={14} /></span>{title}</h4>
      {children}
    </section>
  );

  /* ترتيب الحقول الأساسية حسب إعداد اللوحة */
  const orderIdx = k => { const i = (lay ? lay.context : ctx.order).indexOf(k); return i < 0 ? 999 : i; };

  const copy = async (text, msg) => { if (await copyText(text)) onToast(msg); else onToast('انسخه يدوياً: ' + text, 'info'); };

  async function uploadCover(file) {
    if (!file) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { onToast('الغلاف صورة PNG أو JPG أو WEBP', 'err'); return; }
    setCoverBusy(true);
    try {
      const r = await uploadFiles('task', id, [await shrinkImage(file)]);
      if (r.failed.length) { onToast('تعذر الرفع: ' + r.failed.join('، '), 'err'); }
      else if (r.ids[0]) { await patch({ coverFileId: r.ids[0] }, 'تم تعيين الغلاف'); }
    } catch (e) { fail(e); } finally { setCoverBusy(false); if (coverInput.current) coverInput.current.value = ''; }
  }  async function pickCover() {
    setMenu('');
    try {
      const data = await api('GET', `/api/attachments?entity=task&id=${id}`);
      const imgs = (data.files || data).filter(f => /^image\//.test(f.mime || '') || /\.(png|jpe?g|gif|webp)$/i.test(f.name || ''));
      if (!imgs.length) { onToast('لا توجد صور مرفقة بالمهمة — اختر صورة من جهازك', 'info'); if (coverInput.current) coverInput.current.click(); return; }
      setCoverPick(imgs);
    } catch (e) { fail(e); }
  }
  async function addLink() {
    const key = linkKey.trim();
    if (!key) return;
    try {
      const toId = await resolveIssueKey(key);
      if (toId === undefined) { onToast('المهمة «' + key + '» غير موجودة', 'err'); return; }
      await api('POST', `/api/tasks/${id}/links`, { toId, type: linkType });
      setLinkKey(''); await reload(false);
    } catch (e) { fail(e); }
  }

  const hasVal = d => { const v = (t.customFields || {})[d.key]; return !(v == null || v === '' || v === false || (Array.isArray(v) && !v.length)); };
  const sideFilled = cfSide.filter(hasVal), sideEmpty = cfSide.filter(d => !hasVal(d));
  const history = (t.history || []).map(h => {
    const f = h.field.startsWith('custom:') ? ((ctx.cfDefs.find(d => d.key === h.field.slice(7)) || {}).name || 'حقل') : (TH_FIELD[h.field] || h.field);
    const val = x => (x == null || x === '' ? '—' : h.field === 'status' ? statusName(x) : h.field === 'priority' ? (ctx.priority[x] || x)
      : h.field === 'issueType' ? (ctx.itype[x] || x) : h.field === 'estimateMin' ? fmtMin(+x) : String(x));
    return { h, f, from: val(h.from), to: val(h.to) };
  });

  const detailsRows = [
                { key: 'type', node: <div className="fr"><label>{ctx.fl('type')}</label><div className="fv"><TypeIcon k={t.issueType} ctx={ctx} />
                  {ed ? <TypeInput ctx={ctx} value={t.issueType} commit="blur" className="fin" onChange={v => patch({ issueType: v })} /> : <span>{t.issueType ? (ctx.itype[t.issueType] || t.issueType) : "—"}</span>}</div></div> },
                { key: 'priority', node: <div className="fr"><label>{ctx.fl('priority')}</label><div className="fv"><span className={`pri pri-${t.priority}`}><FIcon n="eq" size={14} /></span>
                  {ed ? <select className="fsel" value={t.priority} onChange={e => patch({ priority: e.target.value })}>{ctx.priorityOpts(t.priority).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    : <span>{ctx.priority[t.priority] || t.priority}</span>}</div></div> },
                { key: 'labels', node: <div className="fr top"><label>{ctx.fl('labels')}</label><div className="fv lbl-edit">
                  {(t.labels || []).length ? t.labels.map(l => <span key={l} className={`lbl ${ed ? 'rm' : ''}`} onClick={() => ed && patch({ labels: t.labels.filter(x => x !== l) })}>{l}{ed ? ' ✕' : ''}</span>) : (ed ? null : <span className="muted">—</span>)}
                  {ed && <input className="fin lbl-add" maxLength={30} placeholder="+ إضافة وسم" value={labelNew} onChange={e => setLabelNew(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = labelNew.trim(); if (v) { setLabelNew(''); patch({ labels: [...(t.labels || []), v] }); } } }} />}
                </div></div> },
                { key: 'points', node: <div className="fr"><label>{ctx.fl('points')}</label><div className="fv">
                  {ed ? <input type="number" min="0" step="0.5" className="fin pts" placeholder="—" key={t.storyPoints} defaultValue={t.storyPoints ?? ''}
                    onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t.storyPoints ?? null)) patch({ storyPoints: v }); }} />
                    : <span>{t.storyPoints ?? '—'}</span>}</div></div> },
                { key: 'sprint', node: <div className="fr"><label>{ctx.fl('sprint')}</label><div className="fv">
                  {ed ? <select className="fsel" value={t.sprintId || ''} onChange={e => patch({ sprintId: e.target.value ? +e.target.value : null })}>
                    <option value="">Backlog</option>
                    {sprints.filter(s => s.state !== 'CLOSED' || s.id === t.sprintId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    : <span>{(t.sprint && t.sprint.name) || 'Backlog'}</span>}</div></div> },
                { key: 'parent', node: <div className="fr"><label>{ctx.fl('parent')}</label><div className="fv">
                  {ed ? <input className="fin key-in" dir="ltr" placeholder="NKH-3" key={t.parent ? t.parent.key : ''} defaultValue={t.parent ? t.parent.key : ''}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    onBlur={async e => {
                      const k = e.target.value.trim();
                      if (k === (t.parent ? t.parent.key : '')) return;
                      if (!k) { patch({ parentId: null }); return; }
                      try {
                        const pid = await resolveIssueKey(k);
                        if (pid === undefined) { onToast('المهمة «' + k + '» غير موجودة', 'err'); await reload(false); return; }
                        patch({ parentId: pid });
                      } catch (ex) { fail(ex); }
                    }} />
                    : (t.parent ? <a className="link" onClick={() => onOpen(t.parent.id)}>{t.parent.key}</a> : <span className="muted">—</span>)}</div></div> },
                ...(t.project ? [{ key: 'project', node: <div className="fr"><label>{ctx.fl('project')}</label><div className="fv"><span>{t.project.name}</span></div></div> }] : []),
              ];
  const peopleRows = [
                { key: 'assignee', node: <div className="fr"><label>{ctx.fl('assignee')}</label><div className="fv"><Avatar name={t.assignee.name} size={24} />
                  {ed && ctx.users.length > 1
                    ? <select className="fsel" value={t.assignee.id} onChange={e => patch({ assigneeId: +e.target.value })}>
                      {ctx.users.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}{u.id === ctx.me.user.id ? ' (أنا)' : ''}</option>)}</select>
                    : <span>{t.assignee.name}</span>}</div>{ed && t.assignee.id !== ctx.me.user.id && <button type="button" className="jf-link" style={{ margin: '0 8px 6px' }} onClick={() => patch({ assigneeId: ctx.me.user.id })}>تعيين لي</button>}</div> },
                { key: 'reporter', node: <div className="fr"><label>{ctx.fl('reporter')}</label><div className="fv"><Avatar name={t.creator.name} size={24} /><span>{t.creator.name}</span></div></div> },
                ...((t.watchers || []).length ? [{ key: 'watchers', node: <div className="fr top"><label>{ctx.fl('watchers')}</label><div className="fv wrap">
                  {t.watchers.map(w => <span className="chip-user" key={w.id}><Avatar name={w.name} size={22} />{w.name}</span>)}</div></div> }] : []),
              ];
  const datesRows = [
                { key: 'start', node: <div className="fr"><label>{ctx.fl('start')}</label><div className="fv">
                  {ed ? <input type="date" className={`fin dt ${t.startDate ? '' : 'empty'}`} value={t.startDate || ''} onChange={e => patch({ startDate: e.target.value || null })} /> : <span>{t.startDate || '—'}</span>}</div></div> },
                { key: 'due', node: <div className="fr"><label>{ctx.fl('due')}</label><div className="fv">
                  {ed ? <input type="date" className={`fin dt ${t.dueDate ? '' : 'empty'}`} value={t.dueDate || ''} onChange={e => patch({ dueDate: e.target.value || null })} /> : <span>{t.dueDate || '—'}</span>}</div></div> },
                { key: 'created', node: <div className="fr"><label>{ctx.fl('created')}</label><div className="fv"><span className="muted">{fmtDT(t.createdAt)}</span></div></div> },
                { key: 'updated', node: <div className="fr"><label>{ctx.fl('updated')}</label><div className="fv"><span className="muted">{fmtDT(t.updatedAt)}</span></div></div> },
              ];
  /* حقول مثبّتة لكل مستخدم (Pinned fields) */
  const togglePin = k => setPins(p => { const n = p.includes(k) ? p.filter(x => x !== k) : [...p, k]; try { localStorage.setItem('rb-pinned', JSON.stringify(n)); } catch (_) { /* تجاهل */ } return n; });
  const cfNode = d => (
    <div className={`fr ${d.type === 'longtext' || d.type === 'multiselect' ? 'top' : ''}`}>
      <label>{ctx.cfLabel(d)}</label>
      <div className={`fv ${d.type === 'multiselect' ? 'wrap' : ''}`}>
        {up ? <CfInput d={d} value={(t.customFields || {})[d.key]} users={ctx.users} commitOnBlur onChange={v => patch({ customFields: { [d.key]: v } })} />
          : <span>{cfShort(ctx, d, (t.customFields || {})[d.key]) || '—'}</span>}
      </div>
    </div>
  );
  const cfRowsAll = cfSide.map(d => ({ key: 'cf:' + d.key, node: cfNode(d), isCf: true, filled: hasVal(d) }));
  const everyRow = [...detailsRows, ...peopleRows, ...datesRows, ...cfRowsAll];
  const pinnedRows0 = pins.map(k => everyRow.find(r => r.key === k)).filter(Boolean);
  const pinnedRows = pinnedRows0;
  /* الدبوس يظهر بجانب اسم الحقل نفسه (داخل الـlabel) */
  const withPin = r => {
    const pinned = pins.includes(r.key);
    const btn = <button type="button" key="pin" className="pin-btn" title={pinned ? 'إلغاء التثبيت' : 'تثبيت في أعلى اللوحة'} onClick={e => { e.stopPropagation(); togglePin(r.key); }}><FIcon n="pin" size={13} /></button>;
    const kids = Children.toArray(r.node && r.node.props && r.node.props.children);
    const lab = kids[0];
    const inLabel = lab && lab.type === 'label';
    return (
      <div key={r.key} className={`pin-wrap ${pinned ? 'pinned' : ''} ${inLabel ? 'pin-in' : ''}`}>
        {inLabel ? cloneElement(r.node, {}, cloneElement(lab, {}, lab.props.children, btn), ...kids.slice(1)) : <>{r.node}{btn}</>}
      </div>
    );
  };
  const rows = arr => arr.filter(r => (r.isCf || core(r.key)) && !pins.includes(r.key)).sort((a, b) => orderIdx(a.key) - orderIdx(b.key)).map(withPin);
  const allFeed = [
    ...t.comments.map(c => ({ k: 'c' + c.id, kind: 'comment', user: c.user.name, text: c.body, at: c.createdAt })),
    ...history.map(x => ({ k: 'h' + x.h.id, kind: 'history', user: x.h.user.name, f: x.f, from: x.from, to: x.to, at: x.h.createdAt })),
    ...(t.worklogs || []).map(w => ({ k: 'w' + w.id, kind: 'work', user: w.user.name, minutes: w.minutes, note: w.note, at: w.createdAt || w.workedOn })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const timePanel = (
  <Panel k="secTime" title={ctx.fl('secTime')}>
    <div className="tt">
      <div className="tt-bar"><i style={{ width: `${pctSpent}%` }} className={est && spent > est ? 'over' : ''} /></div>
      <div className="tt-row"><span><b>{fmtMin(spent)}</b> <small>مسجَّلة</small></span><span>{est ? <><b>{fmtMin(est)}</b> <small>تقدير</small></> : <small>بلا تقدير</small>}</span></div>
      {est > 0 && <div className="tt-left">المتبقي: <b>{fmtMin(Math.max(0, est - spent))}</b></div>}
    </div>
    {ed && core('estimate') && (
      <div className="fr"><label>{ctx.fl('estimate')}</label><div className="fv">
        <input className="fin" placeholder="مثال: 2h 30m" aria-label="التقدير" key={est || 0} defaultValue={est ? fmtMin(est) : ''}
          onBlur={e => {
            const v = parseMin(e.target.value);
            if (Number.isNaN(v)) { onToast('صيغة التقدير غير صحيحة (مثال: 2h 30m)', 'err'); return; }
            if (v !== (est || null)) patch({ estimateMin: v });
          }} /></div></div>
    )}
  </Panel>
  );
  const rowMap = new Map(everyRow.map(r => [r.key, r]));
  const layoutSections = [];
  /* حقول أساسية وضعها المستخدم في «حقول الوصف» تظهر بالعمود الرئيسي */
  const mainCoreRows = lay ? lay.description.filter(k => !k.startsWith('cf:') && !k.startsWith('sec:') && k !== 'timetracking' && k !== 'status' && rowMap.has(k)).map(k => rowMap.get(k)) : [];
  if (lay) {
    let curS = { id: 'd0', title: ctx.fl('secDetails'), keys: [] };
    lay.context.forEach(k => {
      if (k.startsWith('sec:')) { layoutSections.push(curS); curS = { id: k, title: (lay.sections || {})[k.slice(4)] || 'قسم', keys: [] }; }
      else if (k === 'timetracking') { layoutSections.push(curS); layoutSections.push({ id: 'time', time: true }); curS = { id: 'c' + layoutSections.length, title: '', keys: [] }; }
      else curS.keys.push(k);
    });
    layoutSections.push(curS);
  }
  return (
    <Modal title={t.key} wide noLock={!!side} onClose={onClose} cardClass={`td-card ${side ? 'td-peek' : ''}`}>
      <div id="tdRoot" className="td" onClick={() => { if (menu) setMenu(''); }}>
        <div className="td-head">
          <div className="td-crumbs">
            {t.project && <><span className="crumb">{t.project.name}</span><span className="sep">/</span></>}
            {t.parent && <><a className="crumb link" onClick={() => onOpen(t.parent.id)}><TypeIcon k={t.parent.issueType} ctx={ctx} /> {t.parent.key}</a><span className="sep">/</span></>}
            <span className="crumb cur"><TypeIcon k={t.issueType} ctx={ctx} /> <b dir="ltr">{t.key}</b></span>
          </div>
          <div className="td-actions">
            {up && ctx.show('startWork') && (t.timer
              ? <button type="button" className="tb-btn run" title="إيقاف المؤقّت وتسجيل الوقت"
                onClick={act(async () => { const r = await api('POST', `/api/tasks/${id}/timer`, { action: 'stop' }); if (r && r.minutes) onToast(`سُجِّل ${fmtMin(r.minutes)}`); await reload(); })}>
                <FIcon n="stop" size={13} /> {fmtMin(Math.max(1, Math.round((Date.now() - new Date(t.timer.startedAt).getTime()) / 60000)))}</button>
              : <button type="button" className="tb-btn go" title="بدء مؤقّت العمل"
                onClick={act(async () => { await api('POST', `/api/tasks/${id}/timer`, { action: 'start' }); await reload(); })}><FIcon n="play" size={13} /> {ctx.fl('startWork')}</button>)}
            {up && ctx.manualRules.length > 0 && (
              <span className="menu-wrap">
                <button type="button" className="tb-btn ic" title="أتمتة" aria-label="أتمتة" onClick={e => { e.stopPropagation(); setMenu(menu === 'auto' ? '' : 'auto'); }}><HI d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></button>
                {menu === 'auto' && (
                  <div className="menu">
                    {ctx.manualRules.map(r => (
                      <button type="button" className="menu-item" key={r.id} onClick={act(async () => {
                        setMenu('');
                        const res = await api('POST', `/api/tasks/${id}/automation/${encodeURIComponent(r.id)}`, {});
                        onToast('نُفِّذت: ' + (res.ran || []).join('، ')); await reload();
                      })}>{r.name}</button>
                    ))}
                  </div>
                )}
              </span>
            )}
            <button type="button" className={'tb-btn ic pill' + (t.watching ? ' on' : '')} title={t.watching ? 'تتابعها — اضغط لإلغاء المتابعة' : 'تابع هذه المهمة'}
              onClick={act(async () => { await api('POST', `/api/tasks/${id}/watch`, { on: !t.watching }); await reload(false); })}><HI d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /><span>{(t.watchers || []).length}</span></button>
            <button type="button" className="tb-btn ic" title="نسخ رابط المهمة" aria-label="مشاركة"
              onClick={() => copy(`${window.location.origin}/tasks?open=${id}`, 'نُسخ رابط المهمة')}><HI d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4" /></button>
            <span className="menu-wrap">
              <button type="button" className="tb-btn ic" title="المزيد" aria-label="المزيد" onClick={e => { e.stopPropagation(); setMenu(menu === 'more' ? '' : 'more'); }}><HI d="M5 12h.01 M12 12h.01 M19 12h.01" sw={3} /></button>
              {menu === 'more' && (
                <div className="menu">
                  <button type="button" className="menu-item" onClick={() => { setMenu(''); copy(t.key, 'نُسخ ' + t.key); }}>نسخ رقم المهمة</button>
                  {ed && <button type="button" className="menu-item" onClick={pickCover}>تغيير الغلاف</button>}
                  {ed && <button type="button" className="menu-item" onClick={() => { setMenu(''); onEdit(t); }}>تعديل كامل</button>}
                  {onConfigure && ctx.me.perms.includes('admin') && <button type="button" className="menu-item" onClick={() => { setMenu(''); onConfigure(); }}><FIcon n="gear" /> تخصيص اللوحة وتخطيط حقول المهمة</button>}
                  {ed && <button type="button" className="menu-item danger" onClick={() => { setMenu(''); ask({ title: 'حذف المهمة', text: `سيتم حذف ${t.key} وتعليقاتها نهائياً.`, ok: 'حذف',
                    onOk: async () => { await api('DELETE', '/api/tasks/' + id); onToast('تم الحذف'); onChanged(); onClose(); } }); }}>حذف المهمة</button>}
                </div>
              )}
            </span>
            <button type="button" className="tb-btn ic" title="عرض كلوحة جانبية / نافذة" aria-label="لوحة جانبية" onClick={toggleSide}>{side ? <HI d="M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7" /> : <HI d="M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7" />}</button>
            <button type="button" className="tb-btn ic" aria-label="إغلاق" onClick={onClose}><HI d="M18 6 6 18 M6 6l12 12" /></button>
          </div>
        </div>
        <div className="td-body">
        {!cover && ed && (
          <div className="td-cover-add">
            <button type="button" className="btn sm ghost" disabled={coverBusy} onClick={() => coverInput.current && coverInput.current.click()}><FIcon n="image" /> {coverBusy ? 'جارٍ الرفع…' : 'إضافة غلاف'}</button>
            <button type="button" className="jf-link" onClick={pickCover}>أو اختر من المرفقات</button>
          </div>
        )}
        <input type="file" ref={coverInput} accept="image/png,image/jpeg,image/webp" hidden onChange={e => uploadCover(e.target.files && e.target.files[0])} />

        <div className={`td-grid ${sideOff ? 'td-off' : ''} ${dragging ? 'td-dragging' : ''}`} ref={gridRef} style={side ? undefined : { gridTemplateColumns: `minmax(0,1fr) 14px ${sideOff ? 0 : sideW}px` }}>
          <div className="td-main">
            <div className="td-top">
              {cover && (
                <div className="td-cover" title="غلاف المهمة" ref={coverRef} style={{ '--cw': cvSize.w + 'px', '--ch': cvSize.h + 'px' }}>
                  <img src={cover} alt="غلاف المهمة" />
                  <span className="td-cover-rz" role="separator" aria-label="تغيير حجم الغلاف" title="اسحب لتكبير الغلاف أو تصغيره · نقر مزدوج للافتراضي" onPointerDown={startCoverResize} onDoubleClick={resetCover} />
                  {ed && (
                    <div className="td-cover-acts">
                      <button type="button" className="btn sm" disabled={coverBusy} onClick={() => coverInput.current && coverInput.current.click()}>رفع صورة أخرى</button>
                      <button type="button" className="btn sm ghost" onClick={pickCover}>من المرفقات</button>
                      <button type="button" className="btn sm danger" onClick={() => patch({ coverFileId: null }, 'أُزيل الغلاف')}>إزالة</button>
                    </div>
                  )}
                </div>
              )}
              <div className="td-titlebox">
                {ed
                  ? <input className="td-title" key={t.title} maxLength={120} defaultValue={t.title} aria-label="الملخّص"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.title) patch({ title: v }, 'تم الحفظ'); }} />
                  : <h2 className="td-title ro">{t.title}</h2>}
              </div>
            </div>

            {cfMain.length > 0 && (
              <section className={`td-sec keysec ${folded.has('keymain') ? 'folded' : ''}`}>
                <div className="files-head fold" onClick={() => foldToggle('keymain')}><span className="chev" aria-hidden="true"><FIcon n="chev" size={14} /></span><b>{ctx.secName('main')}</b></div>
                <div className="cf-grid">
                  {cfMain.map(d => (
                    <div className={`cf-row ${d.type === 'longtext' || d.type === 'multiselect' ? 'wide' : ''}`} key={d.key}>
                      <label>{ctx.cfLabel(d)}</label>
                      {up ? <CfInput d={d} value={(t.customFields || {})[d.key]} users={ctx.users} commitOnBlur
                        onChange={v => patch({ customFields: { [d.key]: v } })} />
                        : <div className="cf-ro">{cfShort(ctx, d, (t.customFields || {})[d.key]) || <span className="muted">—</span>}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {lay && lay.description.includes('status') && (
              <div className="td-statusbar" style={{ marginBottom: 8 }}>
                {up
                  ? <StatusMenu ctx={ctx} status={t.status} onPick={s => patch({ status: s })} />
                  : <span className={`st-lozenge st-${t.status} ro`}>{statusName(t.status)}</span>}
              </div>
            )}
            {mainCoreRows.length > 0 && (
              <section className="td-sec keysec"><div className="td-mainrows">{rows(mainCoreRows)}</div></section>
            )}

            {showSec('description') && (
            <section className="td-sec">
              <div className="files-head"><b>{ctx.fl('description')}</b>{ed && editDesc === null && <button type="button" className="btn sm td-editbtn" onClick={() => setEditDesc(t.description || '')}>✎ تعديل</button>}</div>
              {editDesc !== null ? (
                <div className="td-desc">
                  <textarea className="input" rows={6} maxLength={10000} value={editDesc} autoFocus onChange={e => setEditDesc(e.target.value)} />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button type="button" className="btn sm" onClick={async () => { await patch({ description: editDesc.trim() || null }, 'تم الحفظ'); setEditDesc(null); }}>حفظ</button>
                    <button type="button" className="btn sm ghost" onClick={() => setEditDesc(null)}>إلغاء</button>
                  </div>
                </div>
              ) : (
                <div className={`td-desc ${ed ? 'can' : ''}`} title={ed ? 'اضغط للتعديل' : undefined} onClick={() => ed && setEditDesc(t.description || '')}>
                  {t.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p> : <p className="muted small">لا يوجد وصف.</p>}
                </div>
              )}
            </section>
            )}

            {showSec('subtasks') && ((t.childIssues && t.childIssues.length > 0) || ed) && (
              <section className="td-sec">
                <div className="files-head"><b>{t.issueType === 'EPIC' ? ctx.fl('epicIssues') : ctx.fl('subtasks')}</b><span className="n">{childDone}/{(t.childIssues || []).length}</span></div>
                {(t.childIssues || []).length > 0 && <div className="bar" style={{ margin: '0 0 8px' }}><i style={{ width: `${Math.round(childDone / t.childIssues.length * 100)}%` }} /></div>}
                {(t.childIssues || []).map(c => (
                  <div className="bl-row" key={c.id} onClick={() => onOpen(c.id)}>
                    <TypeIcon k={c.issueType} ctx={ctx} /> <small className="muted key">{c.key}</small>
                    <span className="bl-title">{c.title}</span><span className="grow" />
                    <span className={`badge ${c.status}`}>{statusName(c.status)}</span>{c.assignee && <Avatar name={c.assignee.name} size={24} />}
                  </div>
                ))}
                {ed && (
                  <div className="comment-box" style={{ marginTop: 8 }}>
                    <select className="input" style={{ maxWidth: 130 }} value={childType || (t.issueType === 'EPIC' ? 'TASK' : 'SUBTASK')} onChange={e => setChildType(e.target.value)} aria-label="نوع المهمة">
                      {ctx.itypeOpts('').filter(([k]) => k !== 'EPIC').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input className="input" maxLength={120} value={childTitle} placeholder="ما الذي يجب إنجازه؟" onChange={e => setChildTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tdChildAdd').click(); } }} />
                    <button type="button" className="btn ghost" id="tdChildAdd" onClick={act(async () => {
                      if (!childTitle.trim()) return;
                      await api('POST', '/api/tasks', { title: childTitle.trim(), issueType: childType || (t.issueType === 'EPIC' ? 'TASK' : 'SUBTASK'), parentId: id, projectId: t.projectId || undefined, priority: 'MEDIUM', sprintId: t.sprintId || undefined });
                      setChildTitle(''); await reload();
                    })}>إضافة</button>
                  </div>
                )}
              </section>
            )}

            {showSec('checklist') && (
            <section className="td-sec checklist">
              <div className="files-head"><b>{ctx.fl('checklist')}</b><span className="n">{doneN}/{items.length}</span></div>
              {items.length > 0 && <div className="bar" style={{ margin: '0 0 8px' }}><i style={{ width: `${Math.round(doneN / items.length * 100)}%` }} /></div>}
              {items.map(i => (
                <div className={`ck-row ${i.done ? 'done' : ''}`} key={i.id}>
                  <label><input type="checkbox" checked={!!i.done} disabled={!up}
                    onChange={act(async () => { await api('PATCH', '/api/task-items/' + i.id, { done: !i.done }); await reload(); })} /><span>{i.text}</span></label>
                  {up && <button type="button" className="ck-del" aria-label="حذف البند" onClick={act(async () => { await api('DELETE', '/api/task-items/' + i.id); await reload(); })}>✕</button>}
                </div>
              ))}
              {up && (
                <div className="comment-box" style={{ marginTop: 8 }}>
                  <input className="input" maxLength={140} value={newItem} placeholder="أضف بنداً…" onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addItem').click(); } }} />
                  <button type="button" className="btn ghost" id="addItem" onClick={act(async () => {
                    if (!newItem.trim()) return;
                    await api('POST', `/api/tasks/${id}/items`, { text: newItem }); setNewItem(''); await reload();
                  })}>إضافة</button>
                </div>
              )}
            </section>
            )}

            {showSec('linked') && (
            <section className="td-sec">
              <div className="files-head"><b>{ctx.fl('linked')}</b></div>
              {Object.keys(grouped).length
                ? Object.entries(grouped).map(([lab, ls]) => (
                  <div className="link-group" key={lab}><small className="muted">{lab}</small>
                    {ls.map(l => (
                      <div className="bl-row" key={l.id} onClick={() => onOpen(l.task.id)}>
                        <TypeIcon k={l.task.issueType} ctx={ctx} /> <small className="muted key">{l.task.key}</small>
                        <span className="bl-title">{l.task.title}</span><span className="grow" />
                        <span className={`badge ${l.task.status}`}>{statusName(l.task.status)}</span>
                        {up && <button type="button" className="ck-del" aria-label="إزالة الرابط"
                          onClick={e => { e.stopPropagation(); act(async () => { await api('DELETE', '/api/task-links/' + l.id); await reload(false); })(); }}>✕</button>}
                      </div>
                    ))}
                  </div>))
                : <p className="muted small">لا توجد روابط.</p>}
              {up && (
                <div className="comment-box" style={{ marginTop: 8 }}>
                  <div className="seg lk-seg" role="group" aria-label="نوع الرابط">
                    {[['BLOCKS', 'تحجب'], ['RELATES', 'مرتبطة بـ'], ['DUPLICATES', 'مكرّرة لـ']].map(([k, l]) => (
                      <button type="button" key={k} className={linkType === k ? 'active' : ''} onClick={() => setLinkType(k)}>{l}</button>
                    ))}
                  </div>
                  <input className="input" dir="ltr" style={{ textAlign: 'right' }} placeholder="NKH-12" maxLength={20} value={linkKey}
                    onChange={e => setLinkKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
                  <button type="button" className="btn ghost" onClick={addLink}>ربط</button>
                </div>
              )}
            </section>
            )}

            {showSec('attachments') && <FilesBlock entity="task" id={id} onError={m => onToast(m, 'err')} />}

            {showSec('activity') && (
            <section className="td-sec">
              <div className="td-tabs" role="tablist">
                <button type="button" className={`tab-pill ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>الكل</button>
                {ctx.show('tabComments') && <button type="button" className={`tab-pill ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>{ctx.fl('tabComments')} <span className="n">{t.comments.length}</span></button>}
                {ctx.show('tabWorklog') && <button type="button" className={`tab-pill ${tab === 'worklog' ? 'active' : ''}`} onClick={() => setTab('worklog')}>{ctx.fl('tabWorklog')} <span className="n">{fmtMin(spent)}</span></button>}
                {ctx.show('tabHistory') && <button type="button" className={`tab-pill ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>{ctx.fl('tabHistory')} <span className="n">{(t.history || []).length}</span></button>}
              </div>
              <div className="td-tabbody">
              {tab === 'comments' && (
                <>
                  <div>
                    {t.comments.length
                      ? t.comments.map(c => (
                        <div className={`comment ${toMe(c.body) ? 'to-me' : ''}`} key={c.id}>
                          <b>{c.user.name}</b> <small>{fmtDT(c.createdAt)}</small>{c.editedAt && <small className="muted"> · معدَّل</small>}
                          {(c.user.id === ctx.me.user.id || ctx.me.user.isAdmin) && editCm !== c.id && (
                            <span className="cm-acts">
                              {c.user.id === ctx.me.user.id && <button type="button" className="tb-btn" title="تعديل التعليق" aria-label="تعديل التعليق" onClick={() => { setEditCm(c.id); setEditCmText(renderMention(c.body)); }}>✎</button>}
                              <button type="button" className="tb-btn" title="حذف التعليق" aria-label="حذف التعليق" onClick={() => { if (window.confirm('سيُحذف هذا التعليق نهائياً. متابعة؟')) act(async () => { await api('DELETE', `/api/tasks/${id}/comments/${c.id}`); await reload(false); })(); }}>🗑</button>
                            </span>
                          )}
                          {editCm === c.id
                            ? (
                              <div className="cm-edit">
                                <MentionInput multiline className="input" rows={2} maxLength={1000} autoFocus value={editCmText} people={mentionPeople} onChange={setEditCmText}
                                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditCm(null); } }} />
                                <div className="cm-btns">
                                  <button type="button" className="btn sm" disabled={!editCmText.trim()} onClick={act(async () => { await api('PATCH', `/api/tasks/${id}/comments/${c.id}`, { body: encodeMention(editCmText) }); setEditCm(null); await reload(false); })}>حفظ</button>
                                  <button type="button" className="btn sm ghost" onClick={() => setEditCm(null)}>إلغاء</button>
                                </div>
                              </div>
                            )
                            : <div style={{ whiteSpace: 'pre-wrap' }}>{renderMention(c.body)}</div>}
                        </div>))
                      : <p className="muted small">لا توجد تعليقات.</p>}
                  </div>
                  <div className="comment-box">
                    <MentionInput id="newComment" className="input" maxLength={1000} value={comment} placeholder="اكتب تعليقاً… واكتب @ لذكر زميل" people={mentionPeople}
                      onChange={setComment}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addComment').click(); } }} />
                    <button type="button" className="btn ghost" id="addComment" onClick={act(async () => {
                      if (!comment.trim()) return;
                      await api('POST', `/api/tasks/${id}/comments`, { body: encodeMention(comment) }); setComment(''); await reload(false);
                    })}>إرسال</button>
                    <div className="qc-chips">
                      {[['من يعمل على هذا…؟', 'من يعمل على هذا؟ '], ['تحديث للحالة…', 'تحديث للحالة: '], ['شكراً…', 'شكراً! ']].map(([l, s]) => <button type="button" key={l} className="qc-chip" onClick={() => setComment(c => c + s)}>{l}</button>)}
                      <small className="muted">نصيحة: اضغط <kbd>M</kbd> للتعليق</small>
                    </div>                    
                  </div>
                </>
              )}
              {tab === 'worklog' && (
                <>
                  {(t.worklogs || []).length
                    ? t.worklogs.map(w => (
                      <div className="wl-row" key={w.id}>
                        <div><b>{w.user.name}</b> سجّل <b dir="ltr">{fmtMin(w.minutes)}</b> <small className="muted">{w.workedOn}</small>{w.note && <div className="muted small">{w.note}</div>}</div>
                        {(w.mine || t.canManage) && <button type="button" className="ck-del" aria-label="حذف" onClick={act(async () => { await api('DELETE', '/api/task-worklogs/' + w.id); await reload(false); })}>✕</button>}
                      </div>))
                    : <p className="muted small">لا توجد ساعات مسجّلة.</p>}
                  {up && (
                    <div className="wl-form">
                      <input className="input" placeholder="الوقت: 1h 30m" maxLength={20} value={wl.time} onChange={e => setWl({ ...wl, time: e.target.value })} />
                      <input className="input" type="date" value={wl.date} onChange={e => setWl({ ...wl, date: e.target.value })} />
                      <input className="input" placeholder="ملاحظة (اختياري)" maxLength={255} value={wl.note} onChange={e => setWl({ ...wl, note: e.target.value })} />
                      <button type="button" className="btn ghost" onClick={act(async () => {
                        const mins = parseMin(wl.time);
                        if (!mins || Number.isNaN(mins)) { onToast('اكتب الوقت مثل 1h 30m', 'err'); return; }
                        await api('POST', `/api/tasks/${id}/worklog`, { minutes: mins, workedOn: wl.date || undefined, note: wl.note.trim() || null });
                        onToast('تم تسجيل الوقت'); setWl({ time: '', date: todayStr(), note: '' }); await reload(false);
                      })}>تسجيل</button>
                    </div>
                  )}
                </>
              )}
              {tab === 'all' && (
                <div className="hist">
                  {allFeed.length ? allFeed.map(x => (
                    <div className="hist-row" key={x.k}>
                      {x.kind === 'comment' && <><b>{x.user}</b> علّق: <span style={{ whiteSpace: 'pre-wrap' }}>{renderMention(x.text)}</span></>}
                      {x.kind === 'history' && <><b>{x.user}</b> غيّر <b>{x.f}</b>: {x.from} ← {x.to}</>}
                      {x.kind === 'work' && <><b>{x.user}</b> سجّل <b dir="ltr">{fmtMin(x.minutes)}</b>{x.note ? ` — ${x.note}` : ''}</>}
                      {' '}<small className="muted">{fmtDT(x.at)}</small>
                    </div>
                  )) : <p className="muted small">لا يوجد نشاط بعد.</p>}
                </div>
              )}
              {tab === 'history' && (
                <div className="hist">
                  {history.length
                    ? history.map(({ h, f, from, to }) => (
                      <div className="hist-row" key={h.id}><b>{h.user.name}</b> غيّر <b>{f}</b>: {from} ← {to} <small className="muted">{fmtDT(h.createdAt)}</small></div>))
                    : <p className="muted small">لا توجد تغييرات بعد.</p>}
                </div>
              )}
              </div>
            </section>
            )}
          </div>

          {!side && (
            <div className="td-split" role="separator" aria-orientation="vertical" aria-label="تغيير حجم اللوحة الجانبية" title="اسحب لتغيير الحجم · نقر مزدوج للاسترجاع" onPointerDown={startSplit} onDoubleClick={resetSide}>

            </div>
          )}
          <aside className="td-side">
            {core('status') && (!lay || lay.context.includes('status')) && (
              <div className="td-statusbar">
                {up
                  ? <StatusMenu ctx={ctx} status={t.status} onPick={s => patch({ status: s })} />
                  : <span className={`st-lozenge st-${t.status} ro`}>{statusName(t.status)}</span>}
              </div>
            )}

            {pinnedRows.length > 0 && (
              <Panel k="pinned" title="حقول مثبّتة">
                {pinnedRows.map(withPin)}
              </Panel>
            )}

            {lay ? layoutSections.map(s => (s.time ? <div key="time">{timePanel}</div> : (() => { const rs = rows(s.keys.map(k => rowMap.get(k)).filter(Boolean)); return rs.length ? <Panel key={s.id} k={s.id} title={s.title || ctx.fl('secDetails')}>{rs}</Panel> : null; })())) : (
            <>
            <Panel k="secDetails" title={ctx.fl('secDetails')}>
              {rows(detailsRows)}
            </Panel>

            <Panel k="secPeople" title={ctx.fl('secPeople')}>
              {rows(peopleRows)}
            </Panel>

            <Panel k="secDates" title={ctx.fl('secDates')}>
              {rows(datesRows)}
            </Panel>

            {cfSide.length > 0 && (
              <Panel k="secSide" title={ctx.secName('side')}>
                {rows(cfRowsAll.filter(r => r.filled || showEmpty))}
                {sideEmpty.length > 0 && (
                  <button type="button" className="jf-link" style={{ margin: '4px 8px 8px' }} onClick={() => setShowEmpty(s => !s)}>
                    {showEmpty ? 'إخفاء الحقول الفارغة' : <>{`حقول أخرى (${sideEmpty.length})`} <FIcon n="chev" size={13} /></>}
                  </button>
                )}
              </Panel>
            )}

            <Panel k="secTime" title={ctx.fl('secTime')}>
              <div className="tt">
                <div className="tt-bar"><i style={{ width: `${pctSpent}%` }} className={est && spent > est ? 'over' : ''} /></div>
                <div className="tt-row"><span><b>{fmtMin(spent)}</b> <small>مسجَّلة</small></span><span>{est ? <><b>{fmtMin(est)}</b> <small>تقدير</small></> : <small>بلا تقدير</small>}</span></div>
                {est > 0 && <div className="tt-left">المتبقي: <b>{fmtMin(Math.max(0, est - spent))}</b></div>}
              </div>
              {ed && core('estimate') && (
                <div className="fr"><label>{ctx.fl('estimate')}</label><div className="fv">
                  <input className="fin" placeholder="مثال: 2h 30m" aria-label="التقدير" key={est || 0} defaultValue={est ? fmtMin(est) : ''}
                    onBlur={e => {
                      const v = parseMin(e.target.value);
                      if (Number.isNaN(v)) { onToast('صيغة التقدير غير صحيحة (مثال: 2h 30m)', 'err'); return; }
                      if (v !== (est || null)) patch({ estimateMin: v });
                    }} /></div></div>
              )}
            </Panel>
            </>
            )}
          </aside>
        </div>
        </div>

        {coverPick && (
          <div className="cover-pick" onClick={e => { if (e.target === e.currentTarget) setCoverPick(null); }}>
            <div className="cp-card"><b>اختر صورة الغلاف</b>
              <div className="cp-grid">{coverPick.map(f => <button type="button" key={f.id} onClick={() => { setCoverPick(null); patch({ coverFileId: f.id }); }}><img src={f.url} alt="" /></button>)}</div>
              {t.coverFileId && <button type="button" className="btn sm ghost" onClick={() => { setCoverPick(null); patch({ coverFileId: null }); }}>إزالة الغلاف</button>}
            </div>
          </div>
        )}
      </div>
      {confirmNode}
    </Modal>
  );
}