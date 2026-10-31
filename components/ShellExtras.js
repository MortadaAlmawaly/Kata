'use client';
/* أجزاء الهيكل المشتركة: جرس الإشعارات، لوحة الأوامر (Ctrl+K)، وتغيير كلمة المرور المؤقتة. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { createVisibilityPoller } from '../lib/poll';
import { PAGES, ROLE } from '../lib/constants';
import { ago, useToast } from './hooks';
import { Icon, Modal } from './ui';

const NTYPE_ICON = { MENTION: '@', TASK: '✓', REQUEST: '⎘', EVENT: '◷', ANNOUNCEMENT: '✉', INFO: '•' };

/* روابط الإشعارات القديمة (#/tasks?open=12) تُحوَّل إلى مسارات الصفحات المرحَّلة */
export function mapLink(link) {
  if (!link) return '/dashboard';
  const m = /^#\/([a-z]+)(\?.*)?$/.exec(link);
  return m ? `/${m[1]}${m[2] || ''}` : link;
}

export function useBadges(me) {
  const [state, setState] = useState({ items: [], unread: 0, unreadMentions: 0, inbox: 0 });
  const [toast, toastNode] = useToast();
  const last = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([api('GET', '/api/notifications'), api('GET', '/api/requests/summary')]);
      const newest = n.items.filter(i => i.type === 'MENTION' && !i.read).reduce((m, i) => Math.max(m, i.id), 0);
      if (last.current !== null && newest > last.current) {
        const it = n.items.find(i => i.id === newest);
        toast(`${(it && it.actor) || 'زميل'} أشار إليك`, 'info');
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
      last.current = Math.max(last.current || 0, newest);
      setState({ items: n.items, unread: n.unread, unreadMentions: n.unreadMentions, inbox: s.inbox || 0 });
    } catch (_) { /* صامت */ }
  }, [toast]);
  useEffect(() => {
    if (!me) return undefined;
    /* P3: كل 30 ثانية بس والصفحة ظاهرة؛ توقف لما تنخفي، وتحديث فوري لما ترجع؛ وبدون طلبات متداخلة */
    const poller = createVisibilityPoller({ run: refresh, intervalMs: 30000, isHidden: () => document.visibilityState === 'hidden' });
    poller.start();
    const vis = () => poller.onVisibilityChange();
    document.addEventListener('visibilitychange', vis);
    return () => { poller.stop(); document.removeEventListener('visibilitychange', vis); };
  }, [me, refresh]);
  useEffect(() => { document.title = (state.unread ? `(${state.unread}) ` : '') + 'كاتا'; }, [state.unread]);
  return { ...state, setState, refresh, toastNode };
}

export function Bell({ badges }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  const { items, unread, unreadMentions, setState } = badges;
  const shown = tab === 'mention' ? items.filter(i => i.type === 'MENTION') : items;
  async function readAll() {
    try {
      await api('POST', '/api/notifications/read', {});
      setState(s => ({ ...s, items: s.items.map(i => ({ ...i, read: true })), unread: 0, unreadMentions: 0 }));
    } catch (_) { /* تجاهل */ }
  }
  function readOne(n) {
    api('POST', '/api/notifications/read', { ids: [n.id] }).catch(() => {});
    if (!n.read) {
      setState(s => ({
        ...s, items: s.items.map(i => (i.id === n.id ? { ...i, read: true } : i)), unread: Math.max(0, s.unread - 1),
        unreadMentions: n.type === 'MENTION' ? Math.max(0, s.unreadMentions - 1) : s.unreadMentions,
      }));
    }
    setOpen(false);
  }
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className={`icon-btn ${unreadMentions ? 'has-mention' : ''}`} type="button" aria-label="الإشعارات" onClick={e => { e.stopPropagation(); setOpen(!open); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
        {unreadMentions > 0 && <span className="at">@</span>}
      </button>
      {open && (
        <div className="dropdown" onClick={e => e.stopPropagation()}>
          <div className="dd-head">
            <div className="seg">
              <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>الكل</button>
              <button className={tab === 'mention' ? 'active' : ''} onClick={() => setTab('mention')}>الإشارات @{unreadMentions ? ` (${unreadMentions})` : ''}</button>
            </div>
            <button className="link" onClick={readAll}>قراءة الكل</button>
          </div>
          {shown.length
            ? shown.map(i => (
              <a key={i.id} className={`item ${i.read ? '' : 'unread'} ${i.type === 'MENTION' ? 'mention' : ''}`} href={mapLink(i.link)} onClick={() => readOne(i)}>
                <span className="ni">{NTYPE_ICON[i.type] || '•'}</span>
                <span className="nb">{i.text}<small>{ago(i.createdAt)}</small></span>
              </a>))
            : <div className="empty">{tab === 'mention' ? 'لا توجد إشارات إليك' : 'لا توجد إشعارات'}</div>}
        </div>
      )}
    </div>
  );
}

const ICON_OF = { task: 'tasks', project: 'projects', goal: 'goals', request: 'requests', announcement: 'announce', event: 'calendar', file: 'policy', person: 'team' };
function resultHref(r) {
  switch (r.type) {
    case 'task': return `/tasks?open=${r.id}`;
    case 'project': return '/projects';
    case 'goal': return '/goals';
    case 'person': return '/team';
    case 'request': return '/requests';
    case 'event': return `/calendar?event=${r.id}`;
    case 'announcement': return '/announcements';
    case 'file': return r.url;
    default: return '/dashboard';
  }
}

export function Palette({ me, onClose, onLogout, onTheme }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [server, setServer] = useState([]);
  const [people, setPeople] = useState([]);
  const input = useRef(null);
  const perms = me.perms || [];
  useEffect(() => { input.current && input.current.focus(); api('GET', '/api/directory').then(d => setPeople(d.filter(u => u.id !== me.user.id))).catch(() => {}); }, [me.user.id]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setServer([]); return undefined; }
    const t = setTimeout(async () => {
      try { const r = await api('GET', '/api/search?q=' + encodeURIComponent(s)); setServer(r.results || []); } catch (_) { /* صامت */ }
    }, 260);
    return () => clearTimeout(t);
  }, [q]);

  const base = [];
  PAGES.filter(p => (!p.perm || perms.includes(p.perm)) && (!p.platform || me.platformAdmin))
    .forEach(p => base.push({ g: 'انتقال', label: p.title, hint: p.sub || '', icon: p.icon, href: p.react || `/#/${p.id}` }));
  base.push({ g: 'إنشاء', label: 'مهمة جديدة', icon: 'plus', href: '/tasks?new=1' });
  base.push({ g: 'إنشاء', label: 'موعد / اجتماع جديد', icon: 'calendar', href: '/calendar?new=1' });
  base.push({ g: 'إنشاء', label: 'طلب جديد (مصروف / إجازة)', icon: 'requests', href: '/requests?new=1' });
  if (perms.includes('announcements.team') || perms.includes('announcements.company')) base.push({ g: 'إنشاء', label: 'تعميم جديد', icon: 'announce', href: '/announcements' });
  if (perms.includes('admin') || perms.includes('users.invite')) base.push({ g: 'إنشاء', label: 'دعوة موظف للانضمام', icon: 'team', href: '/settings?tab=invites' });
  base.push({ g: 'إجراءات', label: 'تبديل المظهر (فاتح / داكن)', icon: 'moon', run: onTheme });
  base.push({ g: 'إجراءات', label: 'تسجيل الخروج', icon: 'logout', run: onLogout });
  people.forEach(u => base.push({ g: 'الأشخاص', label: u.name, hint: (ROLE[u.role] || '') + (u.department ? ' · ' + u.department : ''), icon: 'team', href: '/team' }));
  const s = q.trim().toLowerCase();
  const shown = [
    ...base.filter(i => !s || (i.label + ' ' + (i.hint || '')).toLowerCase().includes(s)),
    ...server.map(x => ({ g: 'نتائج البحث', label: x.title, hint: `${x.meta || ''}${x.snippet ? ' — ' + x.snippet : ''}`, icon: ICON_OF[x.type] || 'search', href: resultHref(x) })),
  ].slice(0, 40);
  const cur = Math.min(sel, Math.max(0, shown.length - 1));
  function run(it) {
    if (!it) return;
    onClose();
    if (it.run) setTimeout(it.run, 30); else if (it.href) window.location.href = it.href;
  }
  let lastG = null;
  return (
    <div className="cmdk" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk-card" role="dialog" aria-label="بحث وأوامر">
        <input className="cmdk-input" ref={input} placeholder="اكتب للبحث: صفحة، مهمة، شخص، أو أمر…" autoComplete="off" value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(shown.length - 1, cur + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, cur - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(shown[cur]); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }} />
        <div className="cmdk-list">
          {shown.length ? shown.map((i, n) => {
            const head = i.g !== lastG ? <div className="cmdk-group">{i.g}</div> : null;
            lastG = i.g;
            return (
              <div key={n}>
                {head}
                <button type="button" className={`cmdk-item ${n === cur ? 'sel' : ''}`} onClick={() => run(i)} onMouseEnter={() => setSel(n)}>
                  <Icon name={i.icon || 'search'} /><span>{i.label}</span>{i.hint && <small>{i.hint}</small>}
                </button>
              </div>
            );
          }) : <div className="empty">لا توجد نتائج</div>}
        </div>
        <div className="cmdk-foot"><span>↑↓ تنقّل</span><span>↵ تنفيذ</span><span>Esc إغلاق</span></div>
      </div>
    </div>
  );
}

export function ForcePassword({ me, onDone }) {
  const [f, setF] = useState({ current: '', next: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { await api('POST', '/api/me/password', f); onDone(); } catch (ex) { setErr(ex.message); }
  }
  return (
    <Modal title="غيّر كلمة المرور المؤقتة" onClose={() => {}}>
      <form onSubmit={submit}>
        <p className="notice">حسابك يستخدم كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.</p>
        <label className="field"><span>المؤقتة</span><input type="password" required value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></label>
        <label className="field"><span>الجديدة ({me.org.settings.passwordMin} أحرف على الأقل)</span>
          <input type="password" required value={f.next} onChange={e => setF({ ...f, next: e.target.value })} /></label>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions"><button type="submit" className="btn">تغيير</button></div>
      </form>
    </Modal>
  );
}
