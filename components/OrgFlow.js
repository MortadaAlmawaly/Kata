'use client';
/* الهيكل المرئي الحرّ: بطاقات تُسحب لأي مكان (للمخوّلين)، وخط الربط يخرج من الجهة (يمين/يسار/أسفل) التي أُضيف منها الموظف.
   تكبير/تصغير بزر أو Ctrl+عجلة أو القرص بإصبعين، وتحريك الخلفية بالسحب. المواضع وجهات الربط تُحفظ من الصفحة (onLayout). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './ui';
import { LEVEL_ORDER, ROLE } from '../lib/constants';

const W = 200, H = 148, GX = 36, GY = 70, SIDE_GAP = 70;
const DIR = { b: [0, 1], r: [1, 0], l: [-1, 0] };
const IN_DIR = { b: [0, -1], r: [-1, 0], l: [1, 0] };      // اتجاه دخول الخط للبطاقة الابن
const clampZ = z => Math.max(0.25, Math.min(2, z));

/* نقطة خروج الخط من بطاقة الأب حسب الجهة، ونقطة دخوله لبطاقة الابن */
const anchorOut = (p, s) => (s === 'r' ? { x: p.x + W, y: p.y + H / 2 } : s === 'l' ? { x: p.x, y: p.y + H / 2 } : { x: p.x + W / 2, y: p.y + H });
const anchorIn = (p, s) => (s === 'r' ? { x: p.x, y: p.y + H / 2 } : s === 'l' ? { x: p.x + W, y: p.y + H / 2 } : { x: p.x + W / 2, y: p.y });

function edgePath(a, s, b) {
  const d = Math.max(46, Math.hypot(b.x - a.x, b.y - a.y) * 0.4);
  const o = DIR[s], i = IN_DIR[s];
  return `M${a.x},${a.y} C${a.x + o[0] * d},${a.y + o[1] * d} ${b.x + i[0] * d},${b.y + i[1] * d} ${b.x},${b.y}`;
}

export default function OrgFlow({ roots, kidsOf, collapsed, onToggle, descCount, matches, filtering, canAddUnder, canEdit, layout, onLayout, onOpen, onAdd, pending, onPendingDone, meId }) {
  const vp = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [dragPos, setDragPos] = useState(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const pinchOn = useRef(false);
  const fitted = useRef(false);

  const sideOf = id => layout.side[id] || 'b';
  /* ألوان الأسلاك: لون عام لكل الأسلاك، ولون خاص بسلك كل شخص يغلب العام */
  const [menu, setMenu] = useState(null);                       // قائمة لون سلك: { id, x, y }
  const colorOf = id => (layout.colors || {})[id] || layout.wire || '';
  const setWireColor = (id, c) => { const colors = { ...(layout.colors || {}) }; if (c) colors[id] = c; else delete colors[id]; onLayout({ ...layout, colors }); };
  const PALETTE = ['#8b95a7', '#2f7cf6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899'];

  /* ───── مواضع البطاقات: المحفوظة، وإلا توزيع تلقائي (شجرة مرتّبة) أو موضع نسبي لمن أُضيف بعد الحفظ ───── */
  const { placed, order } = useMemo(() => {
    const P = {}, order = [];
    const walk = (u, parent) => { order.push({ u, parent }); if (!collapsed.has(u.id)) kidsOf(u.id).forEach(k => walk(k, u)); };
    roots.forEach(r => walk(r, null));
    order.forEach(({ u }) => { const s = layout.pos[u.id]; if (s) P[u.id] = { x: s.x, y: s.y }; });
    const manual = Object.keys(layout.pos).length > 0;
    const free = (pt, dir) => {
      const q = { ...pt };
      for (let n = 0; n < 40; n++) {
        if (!Object.values(P).some(o => Math.abs(o.x - q.x) < W - 8 && Math.abs(o.y - q.y) < H - 8)) break;
        if (dir === 'b') q.x += W + GX; else q.y += H + 30;
      }
      return q;
    };
    const relKids = u => {
      if (collapsed.has(u.id) || !P[u.id]) return;
      const p = P[u.id], ks = kidsOf(u.id), g = { b: [], r: [], l: [] };
      ks.forEach(k => { if (!P[k.id]) g[sideOf(k.id)].push(k); });
      g.b.forEach((k, i, a) => { P[k.id] = free({ x: p.x + (i - (a.length - 1) / 2) * (W + GX), y: p.y + H + GY }, 'b'); });
      g.r.forEach((k, i) => { P[k.id] = free({ x: p.x + W + SIDE_GAP, y: p.y + i * (H + 30) }, 'r'); });
      g.l.forEach((k, i) => { P[k.id] = free({ x: p.x - W - SIDE_GAP, y: p.y + i * (H + 30) }, 'l'); });
      ks.forEach(relKids);
    };
    if (!manual) {
      let cursor = 0;
      const tidy = (u, depth) => {
        const bk = collapsed.has(u.id) ? [] : kidsOf(u.id).filter(k => sideOf(k.id) === 'b');
        let x;
        if (bk.length) { const xs = bk.map(k => tidy(k, depth + 1)); x = (xs[0] + xs[xs.length - 1]) / 2; } else { x = cursor; cursor += W + GX; }
        P[u.id] = { x, y: depth * (H + GY) };
        return x;
      };
      roots.forEach(r => tidy(r, 0));
    } else {
      roots.forEach(r => {
        if (!P[r.id]) { const right = Object.values(P).reduce((m, o) => Math.max(m, o.x + W + GX), 0); P[r.id] = free({ x: right, y: 0 }, 'b'); }
      });
    }
    roots.forEach(relKids);
    return { placed: P, order };
  }, [roots, kidsOf, collapsed, layout]);   // eslint-disable-line react-hooks/exhaustive-deps

  const posOf = id => (dragPos && dragPos.id === id ? dragPos : placed[id]);

  /* حفظ: نثبّت كل المواضع الحالية (حتى لا تتحرك البطاقات الأخرى عند تغيّر الشجرة) ثم نطبّق التغيير */
  const commit = useCallback((posChanges, sideChanges, excludeId) => {
    const snap = {};
    Object.entries(placed).forEach(([id, p]) => { if (+id !== excludeId) snap[id] = { x: Math.round(p.x), y: Math.round(p.y) }; });
    onLayout({ ...layout, pos: { ...layout.pos, ...snap, ...posChanges }, side: { ...layout.side, ...(sideChanges || {}) } });
  }, [placed, layout, onLayout]);

  /* وضع موظف جديد أُضيف من زر «+» على الجهة المختارة (يتم على مرحلتين: الجهة ثم الموضع النهائي) */
  useEffect(() => {
    if (!pending || !canEdit) return;
    const p = placed[pending.id];
    if (!p) return;                                              // لم يصل الموظف الجديد بعد
    if (layout.side[pending.id] !== pending.side) { commit({}, { [pending.id]: pending.side }, pending.id); return; }
    if (!layout.pos[pending.id]) { commit({ [pending.id]: { x: Math.round(p.x), y: Math.round(p.y) } }); return; }
    onPendingDone();
  }, [pending, placed, layout, canEdit]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── ملاءمة وتكبير ───── */
  const fit = useCallback(() => {
    const el = vp.current; const ps = Object.values(placed);
    if (!el || !ps.length) return;
    const minX = Math.min(...ps.map(p => p.x)), minY = Math.min(...ps.map(p => p.y));
    const bw = Math.max(...ps.map(p => p.x)) + W - minX, bh = Math.max(...ps.map(p => p.y)) + H - minY;
    const vw = el.clientWidth, vh = el.clientHeight;
    const z = Math.max(0.3, Math.min(1.1, (vw * 0.9) / bw, (vh * 0.86) / bh));
    setView({ z, x: (vw - bw * z) / 2 - minX * z, y: Math.max(20, (vh - bh * z) / 2) - minY * z });
  }, [placed]);
  useEffect(() => { if (!fitted.current && Object.keys(placed).length) { fitted.current = true; const t = setTimeout(fit, 40); return () => clearTimeout(t); } return undefined; }, [placed, fit]);
  /* إعادة الملاءمة عند تغيّر حجم المنطقة (تدوير الجهاز / تغيير النافذة) ما دام المستخدم لم يحرّك المخطط بنفسه */
  const touched = useRef(false);
  const fitRef = useRef(fit); fitRef.current = fit;
  useEffect(() => {
    const el = vp.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (!touched.current) fitRef.current(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const zoomBy = d => { touched.current = true; const el = vp.current; if (!el) return; const mx = el.clientWidth / 2, my = el.clientHeight / 2; setView(v => { const z = clampZ(v.z + d * 0.1); return { z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z) }; }); };

  useEffect(() => {
    const el = vp.current; if (!el) return undefined;
    const wheel = e => {
      touched.current = true;
      e.preventDefault();
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      setView(v => { const z = clampZ(v.z * Math.exp(-e.deltaY * 0.0016)); return { z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z) }; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    /* قرص بإصبعين = تكبير/تصغير مع تحريك */
    const pts = new Map(); let pinch = null;
    const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    const dn = e => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { touched.current = true; dragRef.current = null; panRef.current = null; setDragPos(null); pinchOn.current = true; const m = mid(), v = viewRef.current; pinch = { d: m.d, z: v.z, x: v.x, y: v.y, cx: m.x, cy: m.y }; }
    };
    const mv = e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || pts.size < 2) return;
      const r = el.getBoundingClientRect(), m = mid();
      const z = clampZ(pinch.z * (m.d / pinch.d));
      const wx = (pinch.cx - r.left - pinch.x) / pinch.z, wy = (pinch.cy - r.top - pinch.y) / pinch.z;
      setView({ z, x: (m.x - r.left) - wx * z, y: (m.y - r.top) - wy * z });
    };
    const upP = e => { pts.delete(e.pointerId); if (pts.size < 2) { pinch = null; if (!pts.size) pinchOn.current = false; } };
    el.addEventListener('pointerdown', dn, true); el.addEventListener('pointermove', mv, true);
    el.addEventListener('pointerup', upP, true); el.addEventListener('pointercancel', upP, true);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', dn, true); el.removeEventListener('pointermove', mv, true);
      el.removeEventListener('pointerup', upP, true); el.removeEventListener('pointercancel', upP, true);
    };
  }, []);

  /* ───── سحب البطاقات وتحريك الخلفية ───── */
  function nodeDown(e, u) {
    setMenu(null);
    if ((e.pointerType === 'mouse' && e.button !== 0) || pinchOn.current || e.target.closest('button,a,input')) return;
    const p = placed[u.id]; if (!p) return;
    dragRef.current = { id: u.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, last: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* مؤشر غير نشط */ }
  }
  function nodeMove(e) {
    const d = dragRef.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true; touched.current = true;
    if (!canEdit) return;
    const z = viewRef.current.z;
    d.last = { id: d.id, x: Math.round(d.ox + (e.clientX - d.sx) / z), y: Math.round(d.oy + (e.clientY - d.sy) / z) };
    setDragPos(d.last);
  }
  function nodeUp(e, u) {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (d.moved) { if (canEdit && d.last) commit({ [d.id]: { x: d.last.x, y: d.last.y } }); setDragPos(null); } else onOpen(u);
  }
  function bgDown(e) {
    if (pinchOn.current || e.target.closest('.of-hit,.of-menu,.of-node,button')) return;
    setMenu(null);
    touched.current = true;
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* مؤشر غير نشط */ }
  }
  const bgMove = e => { const p = panRef.current; if (p) setView(v => ({ ...v, x: p.ox + e.clientX - p.sx, y: p.oy + e.clientY - p.sy })); };
  const bgUp = () => { panRef.current = null; };

  const autoArrange = () => onLayout({ ...layout, pos: {} });

  /* حجم اللوحة اللازم لرسم الخطوط */
  const edges = order.filter(o => o.parent && posOf(o.u.id) && posOf(o.parent.id));

  return (
    <div className="of-wrap">
      <div className="of-bar">
        <span className="muted small">{canEdit ? 'اسحب أي بطاقة لمكانها · اضغط على سلك لتغيير لونه · عجلة الماوس أو القرص بإصبعين للتكبير والتصغير' : 'اضغط على أي شخص لفتح ملفه · عجلة الماوس أو القرص بإصبعين للتكبير والتصغير · اسحب الخلفية لتحريك المخطط'}</span>
        <span className="grow" style={{ flex: 1 }} />
        {canEdit && (
          <label className="of-wirecolor" title="لون كل الأسلاك (يمكنك تلوين سلك واحد بالضغط عليه)">
            <input type="color" value={layout.wire || '#8b95a7'} onChange={e => onLayout({ ...layout, wire: e.target.value })} aria-label="لون الأسلاك" /> <span>لون الأسلاك</span>
            {(layout.wire || Object.keys(layout.colors || {}).length > 0) && <button type="button" className="btn ghost sm" onClick={() => onLayout({ ...layout, wire: '', colors: {} })} title="إرجاع كل الأسلاك للون الافتراضي">افتراضي</button>}
          </label>
        )}
        <span className="wf-zoom">
          <button type="button" className="tb-btn" onClick={() => zoomBy(-1)} aria-label="تصغير">−</button>
          <b>{Math.round(view.z * 100)}%</b>
          <button type="button" className="tb-btn" onClick={() => zoomBy(1)} aria-label="تكبير">＋</button>
          <button type="button" className="btn ghost sm" onClick={fit}>ملاءمة</button>
        </span>
        {canEdit && <button type="button" className="btn ghost sm" onClick={autoArrange} title="يعيد توزيع البطاقات تلقائياً (جهات الربط تبقى)">ترتيب تلقائي</button>}
      </div>
      <div className="of-vp" ref={vp} onPointerDown={bgDown} onPointerMove={bgMove} onPointerUp={bgUp} onPointerCancel={bgUp}>
        <div className="of-canvas" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})` }}>
          <svg className="of-svg" width="1" height="1" aria-hidden="true">
            {edges.map(({ u, parent }) => {
              const s = sideOf(u.id), a = anchorOut(posOf(parent.id), s), b = anchorIn(posOf(u.id), s);
              const col = colorOf(u.id), d = edgePath(a, s, b);
              return (
                <g key={u.id} className={`of-edge ${filtering && !(matches(u) || matches(parent)) ? 'dim' : ''} ${canEdit ? 'editable' : ''}`}
                  onClick={e => { if (!canEdit) return; const r = vp.current.getBoundingClientRect(); setMenu({ id: u.id, x: Math.min(e.clientX - r.left, r.width - 190), y: Math.min(e.clientY - r.top, r.height - 150) }); }}>
                  {canEdit && <path className="of-hit" d={d} />}
                  <path d={d} style={col ? { stroke: col } : undefined} />
                  <circle cx={b.x} cy={b.y} r="3.5" style={col ? { fill: col } : undefined} />
                </g>
              );
            })}
          </svg>
          {order.map(({ u }) => {
            const p = posOf(u.id); if (!p) return null;
            const kids = kidsOf(u.id), col = collapsed.has(u.id);
            const cls = [u.id === meId ? 'me' : '', u.active ? '' : 'off', filtering ? (matches(u) ? 'hit' : 'dim') : ''].join(' ');
            const add = canAddUnder(u);
            return (
              <div key={u.id} className={`oc-card of-node lv-${LEVEL_ORDER[u.role]} ${cls} ${dragPos && dragPos.id === u.id ? 'dragging' : ''}`}
                style={{ left: p.x, top: p.y, width: W, height: H }} role="button" tabIndex={0} data-kids={kids.length ? '1' : undefined}
                onPointerDown={e => nodeDown(e, u)} onPointerMove={nodeMove} onPointerUp={e => nodeUp(e, u)} onPointerCancel={() => { dragRef.current = null; setDragPos(null); }}
                onKeyDown={e => { if (e.key === 'Enter') onOpen(u); }}
                onMouseMove={e => {
                  const c = e.currentTarget, r = c.getBoundingClientRect();
                  c.dataset.side = (e.clientY - r.top) / r.height > 0.66 ? 'b' : e.clientX > r.left + r.width / 2 ? 'r' : 'l';
                }}>
                <Avatar name={u.name} />
                <b>{u.name}</b><span className="t">{u.title || ''}</span>
                <span className="rl"><span className="badge role">{ROLE[u.role]}</span></span>
                {add && ['l', 'r', 'b'].map(s => (
                  <button key={s} type="button" className={`oc-add oc-add-${s}`} aria-hidden={s === 'l' ? undefined : 'true'} tabIndex={s === 'l' ? undefined : -1}
                    aria-label={s === 'l' ? `إضافة موظف تحت ${u.name}` : undefined} title={`إضافة موظف تحت ${u.name}`}
                    onClick={e => { e.stopPropagation(); onAdd(u, s); }}>+</button>
                ))}
                {kids.length > 0 && <button type="button" className="oc-toggle" title={col ? 'توسيع' : 'طي'}
                  onClick={e => { e.stopPropagation(); onToggle(u.id); }}>{col ? '+' + descCount(u.id) : '−'}</button>}
              </div>
            );
          })}
        </div>
        {menu && canEdit && (
          <div className="of-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.stopPropagation()}>
            <b>لون السلك</b>
            <div className="of-sw">
              {PALETTE.map(c => <button key={c} type="button" style={{ background: c }} aria-label={c} className={colorOf(menu.id) === c ? 'on' : ''} onClick={() => { setWireColor(menu.id, c); setMenu(null); }} />)}
            </div>
            <label className="of-custom"><input type="color" value={colorOf(menu.id) || '#8b95a7'} onChange={e => setWireColor(menu.id, e.target.value)} /> لون مخصّص</label>
            <button type="button" className="btn ghost sm" onClick={() => { setWireColor(menu.id, ''); setMenu(null); }}>الافتراضي</button>
          </div>
        )}
      </div>
    </div>
  );
}
