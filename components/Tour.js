'use client';
/* الجولات التعريفية: إضاءة العنصر + بطاقة شرح + تنقّل بين الخطوات (حتى عبر الصفحات) + قائمة جولات + دعوة أول زيارة.
   تُشغَّل من زر «؟» بالشريط العلوي أو بـ ?tour=ID. حالة الإنجاز محفوظة بالمتصفح. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TOURS, tourById } from '../lib/tours';

const DONE_KEY = 'kata-tours', SEEN_KEY = 'kata-tour-seen';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch (_) { return {}; } };
const markDone = id => { try { const d = readDone(); d[id] = 1; localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch (_) { /* تجاهل */ } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth; };

function find(step) {
  if (!step || !step.sel) return null;
  for (const s of (Array.isArray(step.sel) ? step.sel : [step.sel])) {
    let els = [...document.querySelectorAll(s)].filter(visible);
    if (step.text) els = els.filter(e => (e.textContent || '').includes(step.text));
    if (els.length) return els[Math.min(step.idx || 0, els.length - 1)];
  }
  return null;
}
const stepsOf = t => t.steps.filter(s => !s.only || (s.only === 'mobile') === (window.innerWidth <= 860));
const goTour = (id, step) => {
  const t = tourById(id); if (!t) return;
  const u = new URL(t.page, window.location.origin);
  u.searchParams.set('tour', id); if (step != null) u.searchParams.set('step', step);
  window.location.href = u.pathname + u.search;
};

export default function TourHost({ me }) {
  const [hub, setHub] = useState(false);
  const [run, setRun] = useState(null);          // { id, steps, i }
  const [welcome, setWelcome] = useState(false);
  const [box, setBox] = useState(null);
  const [tip, setTip] = useState({ top: 0, left: 0, w: 360 });
  const [done, setDone] = useState({});
  const tipRef = useRef(null), targetRef = useRef(null), side = useRef(false), dir = useRef(1), internalEsc = useRef(false), last = useRef('');

  const start = useCallback((id, i = 0) => {
    const t = tourById(id); if (!t) return;
    setHub(false); setWelcome(false);
    setRun({ id, steps: stepsOf(t), i });
  }, []);

  const closeMenus = () => {
    internalEsc.current = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    setTimeout(() => { internalEsc.current = false; }, 50);
  };
  const leave = useCallback(() => {
    if (!run) return;
    const s = run.steps[run.i];
    if (s && s.after === 'esc') closeMenus();
    if (side.current) { document.querySelector('.side-scrim')?.click(); side.current = false; }
  }, [run]);
  const close = useCallback((finished) => {
    if (!run) return;
    const t = tourById(run.id);
    leave();
    if (t && t.cleanup === 'esc') setTimeout(closeMenus, 120);
    if (finished) { markDone(run.id); setDone(readDone()); }
    setRun(null); setBox(null); targetRef.current = null;
  }, [run, leave]);

  const move = useCallback(d => {
    if (!run) return;
    dir.current = d;
    const s = run.steps[run.i];
    if (d > 0 && s.go) {
      const url = typeof s.go === 'function' ? s.go() : s.go;
      leave();
      if (url) { const u = new URL(url, window.location.origin); u.searchParams.set('tour', run.id); u.searchParams.set('step', run.i + 1); window.location.href = u.pathname + u.search; return; }
      close(true); return;
    }
    const n = run.i + d;
    if (n >= run.steps.length) { close(true); return; }
    if (n < 0) return;
    leave();
    setRun({ ...run, i: n });
  }, [run, leave, close]);

  /* موضع الإضاءة والبطاقة */
  const place = useCallback(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(380, vw - 24);
    const th = tipRef.current ? tipRef.current.offsetHeight : 220;
    const el = targetRef.current;
    let nb = null, top, left;
    if (el && document.contains(el) && visible(el)) {
      const r = el.getBoundingClientRect(), p = 6;
      nb = { top: r.top - p, left: r.left - p, width: r.width + p * 2, height: r.height + p * 2 };
      const below = vh - (nb.top + nb.height), above = nb.top;
      if (nb.height > vh * 0.6) top = vh - th - 12;
      else if (below >= th + 16) top = nb.top + nb.height + 12;
      else if (above >= th + 16) top = nb.top - th - 12;
      else top = vh - th - 12;
      left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
    } else { top = Math.max(12, (vh - th) / 2); left = (vw - w) / 2; }
    top = Math.max(12, Math.min(vh - th - 12, top));
    const sig = JSON.stringify([nb, top, left, w]);
    if (sig === last.current) return;
    last.current = sig; setBox(nb); setTip({ top, left, w });
  }, []);

  /* الدخول لخطوة: افتح الدرج/القوائم، انتظر العنصر، مرّر إليه */
  useEffect(() => {
    if (!run) return undefined;
    let dead = false;
    const step = run.steps[run.i];
    (async () => {
      const narrow = window.innerWidth <= 860;
      const sideEl = document.getElementById('side');
      if (step.side && narrow && sideEl && !sideEl.classList.contains('open')) { document.querySelector('.menu-toggle')?.click(); side.current = true; await sleep(350); }
      else if (!step.side && side.current) { document.querySelector('.side-scrim')?.click(); side.current = false; await sleep(250); }
      for (const c of step.clicks || []) { const el = find(c); if (el) { el.click(); await sleep(380); } }
      let el = null;
      if (step.sel) { for (let k = 0; k < 14 && !dead; k++) { el = find(step); if (el) break; await sleep(150); } }
      if (dead) return;
      if (step.sel && !el && step.optional) {
        const n = run.i + dir.current;
        if (n >= run.steps.length) close(true); else if (n < 0) setRun({ ...run, i: 0 }); else setRun({ ...run, i: n });
        return;
      }
      targetRef.current = el;
      if (el) {
        const r = el.getBoundingClientRect(), vh = window.innerHeight;
        if (r.top < 70 || r.bottom > vh - 20) el.scrollIntoView({ block: r.height > vh * 0.6 ? 'start' : 'center', inline: 'nearest' });
      }
      last.current = ''; await sleep(80); place();
    })();
    return () => { dead = true; };
  }, [run && run.id, run && run.i]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* متابعة التغيّرات (تمرير/تحجيم/تحريك) */
  useEffect(() => {
    if (!run) return undefined;
    const f = () => place();
    window.addEventListener('resize', f); window.addEventListener('scroll', f, true);
    const t = setInterval(f, 250);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('scroll', f, true); clearInterval(t); };
  }, [run, place]);
  useEffect(() => { if (run) place(); }, [run && run.i, tip.w]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* لوحة المفاتيح */
  useEffect(() => {
    if (!run) return undefined;
    const h = e => {
      if (internalEsc.current) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (k === 'ArrowLeft' || k === 'Enter') { e.preventDefault(); e.stopPropagation(); move(1); }
      else if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); move(-1); }
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [run, close, move]);
  useEffect(() => {
    if (!hub) return undefined;
    const h = e => { if (e.key === 'Escape') setHub(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [hub]);

  /* فتح القائمة من الزر + بدء من الرابط + دعوة أول زيارة */
  useEffect(() => {
    setDone(readDone());
    const open = () => { setDone(readDone()); setHub(true); };
    window.addEventListener('kata-tours', open);
    window.startTour = id => start(id);
    return () => window.removeEventListener('kata-tours', open);
  }, [start]);
  useEffect(() => {
    if (!me) return undefined;
    const u = new URL(window.location.href);
    const id = u.searchParams.get('tour');
    if (id) {
      const st = u.searchParams.get('step');
      u.searchParams.delete('tour'); u.searchParams.delete('step');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      const t = tourById(id);
      if (t) { if (st == null && u.pathname !== t.page) goTour(id); else setTimeout(() => start(id, st == null ? 0 : +st), 500); }
      return undefined;
    }
    let seen = true; try { seen = !!localStorage.getItem(SEEN_KEY); } catch (_) { /* تجاهل */ }
    if (seen) return undefined;
    const t = setTimeout(() => setWelcome(true), 1500);
    return () => clearTimeout(t);
  }, [me, start]);
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* تجاهل */ } setWelcome(false); };

  const launch = id => {
    const t = tourById(id);
    if (window.location.pathname === t.page) start(id); else goTour(id);
  };

  const cur = run ? run.steps[run.i] : null;
  const total = run ? run.steps.length : 0;
  const body = cur && (Array.isArray(cur.body) ? <ul>{cur.body.map((b, i) => <li key={i}>{b}</li>)}</ul> : <p>{cur.body}</p>);
  const doneCount = TOURS.filter(t => done[t.id]).length;

  return (
    <>
      {welcome && !run && (
        <div className="tour-welcome" role="dialog" aria-label="جولة تعريفية">
          <b>👋 أهلاً بك في كاتا</b>
          <p>هل تريد جولة سريعة (دقيقتان) تعرّفك على الموقع؟ تجدها لاحقاً من زر «؟» أعلى الصفحة.</p>
          <div className="tour-btns">
            <button type="button" className="btn sm" onClick={() => { markSeen(); launch('start'); }}>ابدأ الجولة</button>
            <button type="button" className="btn ghost sm" onClick={markSeen}>لاحقاً</button>
          </div>
        </div>
      )}

      {hub && (
        <div className="tour-hubwrap" onMouseDown={e => { if (e.target === e.currentTarget) setHub(false); }}>
          <div className="tour-hub" role="dialog" aria-label="الجولات التعريفية">
            <div className="tour-hh">
              <div><h3>الجولات التعريفية</h3><small className="muted">أنجزت {doneCount} من {TOURS.length} · اختر جولة وسنشرح لك على الشاشة نفسها</small></div>
              <button type="button" className="tb-btn" aria-label="إغلاق" onClick={() => setHub(false)}>✕</button>
            </div>
            <div className="tour-list">
              {TOURS.map(t => (
                <button type="button" key={t.id} className="tour-item" onClick={() => launch(t.id)}>
                  <span className="tour-ic">{t.icon}</span>
                  <span className="tour-tx"><b>{t.title}{done[t.id] && <i className="tour-ok" title="أنجزتها">✓</i>}</b><small>{t.desc}</small></span>
                  <span className="tour-meta">{t.steps.length} خطوات · ~{t.mins} د</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {run && cur && (
        <div className="tour-layer">
          <div className="tour-block" />
          {box ? <div className="tour-hole" style={box} /> : <div className="tour-dim" />}
          <div className="tour-tip" ref={tipRef} style={{ top: tip.top, left: tip.left, width: tip.w }} role="dialog" aria-live="polite">
            <div className="tour-top">
              <span className="tour-count" dir="ltr">{run.i + 1} / {total}</span>
              <span className="tour-prog"><i style={{ width: ((run.i + 1) / total * 100) + '%' }} /></span>
              <button type="button" className="tour-x" aria-label="إنهاء الجولة" onClick={() => close(false)}>✕</button>
            </div>
            {cur.title && <h4>{cur.title}</h4>}
            {body}
            <div className="tour-nav">
              <button type="button" className="btn ghost sm" disabled={run.i === 0} onClick={() => move(-1)}>السابق</button>
              <span className="grow" />
              <button type="button" className="tour-skip" onClick={() => close(false)}>تخطّي</button>
              <button type="button" className="btn sm" onClick={() => move(1)}>{run.i === total - 1 ? 'إنهاء' : (cur.go ? 'التالي ←' : 'التالي')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
