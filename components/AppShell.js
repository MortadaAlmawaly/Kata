'use client';
/* الهيكل المشترك لصفحات React المرحَّلة: قائمة جانبية + شريط علوي + بطاقة المستخدم.
   يطابق تصميم الواجهة القديمة (نفس أصناف app.css) فلا يظهر فرق بصري عند التنقّل.
   الصفحات التي لم تُرحَّل بعد تفتح الواجهة القديمة عبر /#/<id>. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { logoutWithPush } from '../lib/pushClient';
import { applyLabels, GROUPS, ICONS, PAGES, ROLE } from '../lib/constants';
import { Avatar, Icon, LangButton, LogoSet, ThemeInit, toggleTheme } from './ui';
import { Bell, ForcePassword, Palette, useBadges } from './ShellExtras';
import TourHost from './Tour';
import { FIcon } from './Icon';
import { withBase } from '@/lib/base';

export function useMe() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { const d = await api('GET', '/api/me'); applyLabels(d); setMe(d); return d; } catch (e) { if (e.message !== 'unauthorized') setError(e.message); return null; }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { me, error, reload: load };
}

const hrefOf = p => p.react || `/#/${p.id}`;

export default function AppShell({ active, title, sub, me, children }) {
  const [open, setOpen] = useState(false);
  /* الشريط العلوي شفاف أعلى الصفحة ويصير معتماً (مع تغبيش) عند التمرير حتى لا يتداخل المحتوى معه */
  useEffect(() => {
    const el = document.querySelector('.main'); const bar = document.querySelector('.topbar');
    if (!el || !bar) return undefined;
    const on = () => { if (el.scrollTop > 4) bar.setAttribute('data-scrolled', ''); else bar.removeAttribute('data-scrolled'); };
    on(); el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  });
  /* الجوال: إغلاق القائمة بـ Esc أو بالضغط خارجها (الستار الشفاف) */
  useEffect(() => {
    if (!open) return undefined;
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  const [palette, setPalette] = useState(false);
  /* لوحات المهام بالقائمة الجانبية: تنفتح بسهم جنب «المهام» وتنقلك مباشرة للوحة */
  const [boards, setBoards] = useState([]);
  const [boardsOpen, setBoardsOpen] = useState(active === 'tasks');
  const [curBoard, setCurBoard] = useState(null);
  useEffect(() => {
    try { if (localStorage.getItem('kata-nav-boards') === '1') setBoardsOpen(true); } catch (_) { /* تجاهل */ }
    setCurBoard(window.__kataBoard || null);
    const on = () => setCurBoard(window.__kataBoard || null);
    window.addEventListener('kata-board', on);
    return () => window.removeEventListener('kata-board', on);
  }, []);
  useEffect(() => {
    if (!me || !(me.perms || []).length) return;
    api('GET', '/api/boards').then(b => setBoards(Array.isArray(b) ? b : [])).catch(() => {});
  }, [me && me.user && me.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleBoards = () => setBoardsOpen(o => { const n = !o; try { localStorage.setItem('kata-nav-boards', n ? '1' : '0'); } catch (_) { /* تجاهل */ } return n; });
  const [mustChange, setMustChange] = useState(false);
  const badges = useBadges(me);
  const perms = (me && me.perms) || [];
  const labels = (me && me.org && me.org.settings && me.org.settings.labels) || {};
  const roleName = r => (labels.roles && labels.roles[r]) || ROLE[r] || r;
  const pageTitle = p => (labels.pages && labels.pages[p.id]) || p.title;
  const visible = PAGES.filter(p => (!p.perm || perms.includes(p.perm)) && (!p.platform || (me && me.platformAdmin)));

  async function logout() {
    await logoutWithPush(api);   // P1: يلغي اشتراك Push بهذا الجهاز ويبلّغ السيرفر يحذفه
    window.location.href = withBase('/login');
  }

  useEffect(() => { if (me && me.user.mustChangePassword) setMustChange(true); }, [me]);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(withBase('/sw.js')).catch(() => {});
  }, []);
  /* اختصارات: Ctrl/⌘+K أو / لفتح البحث، N مهمة جديدة */
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) { e.preventDefault(); setPalette(p => !p); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !document.querySelector('.modal')) {
        if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); setPalette(true); }
        else if (e.code === 'KeyN' || e.key.toLowerCase() === 'n') { e.preventDefault(); window.location.href = withBase('/tasks?new=1'); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const tabIds = ['dashboard', 'calendar', 'tasks', 'requests'];
  let last = null;
  return (
    <>
      <ThemeInit />
      <div className="shell">
        {open && <div className="side-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
        <aside className={`side ${open ? 'open' : ''}`} id="side">
          <div className="brand brand-logo">
            <div><LogoSet /><small>{me ? me.org.name : ''}</small></div>
          </div>
          <nav className="nav" aria-label="القائمة الرئيسية">
            {visible.map(p => {
              const head = p.group !== last && GROUPS[p.group] ? <div className="nav-title" key={'h' + p.id}>{GROUPS[p.group]}</div> : null;
              last = p.group;
              return (
                <span key={p.id} style={{ display: 'contents' }}>
                  {head}
                  {p.id === 'tasks' && boards.length > 0 ? (
                    <>
                      <div className="nav-row">
                        <a href={hrefOf(p)} className={p.id === active ? 'active' : ''} aria-current={p.id === active ? 'page' : undefined}>
                          <Icon name={p.icon} /><span>{pageTitle(p)}</span>
                        </a>
                        <button type="button" className={`nav-exp ${boardsOpen ? 'open' : ''}`} aria-expanded={boardsOpen} aria-label="اللوحات" title="اللوحات" onClick={toggleBoards}><FIcon n="chev" size={15} /></button>
                      </div>
                      {boardsOpen && (
                        <div className="nav-sub" role="list">
                          {boards.map(b => {
                            const ic = (b.detail && b.detail.icon) || {};
                            const on = active === 'tasks' && curBoard != null && String(curBoard) === String(b.id);
                            return (
                              <a key={b.id} role="listitem" href={`/tasks?board=${b.id}`} className={on ? 'on' : ''} onClick={() => setOpen(false)}>
                                <span className="jp-ico nav-bico" aria-hidden="true" style={{ background: ic.c || '#e5484d' }}><FIcon n={ic.k || 'layout'} size={11} /></span>
                                <span className="nav-bn">{b.name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <a href={hrefOf(p)} className={p.id === active ? 'active' : ''} aria-current={p.id === active ? 'page' : undefined}>
                      <Icon name={p.icon} /><span>{pageTitle(p)}</span>
                      {p.id === 'requests' && badges.inbox > 0 && <span className="count">{badges.inbox}</span>}
                    </a>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="side-tools"><button className="btn ghost sm" type="button" data-no-i18n onClick={() => { const cur = window.LANG === 'en' ? 'en' : 'ar'; if (window.setLang) window.setLang(cur === 'en' ? 'ar' : 'en'); }}>English / عربي</button><button className="btn ghost sm" type="button" onClick={toggleTheme}><Icon name="moon" size={16} /> المظهر</button></div>
          <div className="me-card">
            {me ? <Avatar name={me.user.name} /> : <span className="avatar" />}
            <div className="who-box">
              <b>{me ? me.user.name : ''}</b>
              <small>{me ? roleName(me.user.role) + (me.user.isAdmin ? ' · مسؤول' : '') : ''}</small>
            </div>
            <button type="button" className="out" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج"><Icon name="logout" /></button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="menu-toggle" type="button" aria-label="القائمة" onClick={() => setOpen(o => !o)}><Icon name="menu" size={20} /></button>
            <div className="titles"><h1>{title}</h1><p className="sub">{sub}</p></div>
            <button className="search-btn" type="button" aria-label="بحث وأوامر سريعة" onClick={() => me && setPalette(true)}>
              <Icon name="search" /><span>بحث وأوامر…</span><kbd>Ctrl K</kbd>
            </button>
            <button className="icon-btn tour-btn" type="button" aria-label="جولات تعريفية" title="جولات تعريفية" onClick={() => window.dispatchEvent(new Event('kata-tours'))}>؟</button>
            <LangButton />
            <button className="icon-btn" type="button" aria-label="تبديل المظهر" onClick={toggleTheme}><Icon name="moon" /></button>
            {me && <Bell badges={badges} />}
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
      <nav className="tabbar" aria-label="التنقل السريع">
        {tabIds.map(id => PAGES.find(p => p.id === id)).filter(Boolean).map(p => (
          <a key={p.id} href={hrefOf(p)} className={p.id === active ? 'active' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[p.icon]} /></svg>
            <span>{pageTitle(p).split(' ')[0]}</span>
            {p.id === 'requests' && badges.inbox > 0 && <i className="tb-count">{badges.inbox}</i>}
          </a>
        ))}
        <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg><span>المزيد</span>
        </button>
      </nav>
      {palette && me && <Palette me={me} onClose={() => setPalette(false)} onLogout={logout} onTheme={toggleTheme} />}
      {mustChange && me && <ForcePassword me={me} onDone={() => setMustChange(false)} />}
      {badges.toastNode}
      {me && <TourHost me={me} />}
    </>
  );
}