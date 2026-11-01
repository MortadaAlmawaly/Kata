'use client';
/* محرّر سير العمل المرئي: كل حالة (عمود) بلوك قابل للسحب، والانتقالات المسموحة أسهم بحركة من الحالة إلى الحالة.
   - اسحب البلوك لتغيير مكانه، اضغط نقطة الربط ● على البلوك ثم بلوك الهدف لإضافة سهم، واضغط السهم لحذفه.
   - بلا أي سهم = كل الانتقالات مسموحة؛ بمجرد وجود أسهم يصبح تحريك المهام مقيّداً بها (للوحة فقط). */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIcon } from './Icon';

export const W = 164, H = 64, GAP_X = 70, GAP_Y = 46, PER_ROW = 4;
export const defaultPos = i => ({ x: 20 + (i % PER_ROW) * (W + GAP_X), y: 20 + Math.floor(i / PER_ROW) * (H + GAP_Y) });

export function edgePath(a, b) {
  /* من أقرب حافتين: أفقي إن تباعدا أفقياً وإلا عمودي */
  const ac = { x: a.x + W / 2, y: a.y + H / 2 }, bc = { x: b.x + W / 2, y: b.y + H / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  let p1, p2, c1, c2;
  if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
    const right = dx >= 0;
    p1 = { x: right ? a.x + W : a.x, y: ac.y }; p2 = { x: right ? b.x : b.x + W, y: bc.y };
    const k = Math.max(40, Math.abs(p2.x - p1.x) / 2);
    c1 = { x: p1.x + (right ? k : -k), y: p1.y }; c2 = { x: p2.x + (right ? -k : k), y: p2.y };
  } else {
    const down = dy >= 0;
    p1 = { x: ac.x, y: down ? a.y + H : a.y }; p2 = { x: bc.x, y: down ? b.y : b.y + H };
    const k = Math.max(30, Math.abs(p2.y - p1.y) / 2);
    c1 = { x: p1.x, y: p1.y + (down ? k : -k) }; c2 = { x: p2.x, y: p2.y + (down ? -k : k) };
  }
  return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
}

export default function WorkflowEditor({ cols, setCols, transitions, setTransitions, positions, setPositions, statusName, onSave, dirty }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return undefined;
    const k = e => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', k);
    document.documentElement.classList.add('scroll-lock');
    return () => { document.removeEventListener('keydown', k); document.documentElement.classList.remove('scroll-lock'); };
  }, [full]);
  const [from, setFrom] = useState(null);       // بلوك المصدر أثناء الربط
  const [hoverEdge, setHoverEdge] = useState(-1);
  const drag = useRef(null);
  const vp = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const pan = useRef(null);
  const pinchOn = useRef(false);    // true أثناء القرص بإصبعين: يوقف سحب البلوكات وتحريك الخلفية

  /* معرّفات محلية ثابتة للأعمدة الجديدة */
  useEffect(() => {
    if (cols.some(c => !c._id)) setCols(cs => cs.map(c => (c._id ? c : { ...c, _id: c.status || 'n' + Math.random().toString(36).slice(2, 8) })));
  }, [cols, setCols]);

  const nodes = cols.filter(c => c._id);
  const pos = (c, i) => positions[c._id] || defaultPos(i);
  const byId = Object.fromEntries(nodes.map((c, i) => [c._id, { c, p: pos(c, i) }]));
  const edges = transitions.filter(t => byId[t.from] && byId[t.to]);
  const width = Math.max(720, ...nodes.map((c, i) => pos(c, i).x + W + 30));
  const height = Math.max(240, ...nodes.map((c, i) => pos(c, i).y + H + 30));

  function down(e, c, i) {
    if (pinchOn.current || e.target.closest('input,button,.wf-dot')) return;
    const p = pos(c, i);
    drag.current = { id: c._id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const z = viewRef.current.z;
    const x = Math.max(-4000, Math.min(4000, Math.round(d.ox + (e.clientX - d.sx) / z))), y = Math.max(-4000, Math.min(4000, Math.round(d.oy + (e.clientY - d.sy) / z)));
    setPositions(ps => ({ ...ps, [d.id]: { x, y } }));
  }
  const up = () => { drag.current = null; };

  /* ملاءمة المخطط وتوسيطه داخل منطقة العرض */
  function fit() {
    const el = vp.current; if (!el || !nodes.length) return;
    const ps = nodes.map((c, i) => pos(c, i));
    const minX = Math.min(...ps.map(p => p.x)), minY = Math.min(...ps.map(p => p.y));
    const bw = Math.max(...ps.map(p => p.x)) + W - minX, bh = Math.max(...ps.map(p => p.y)) + H - minY;
    const vw = el.clientWidth, vh = el.clientHeight;
    const z = Math.max(0.3, Math.min(1.25, (vw * 0.88) / bw, (vh * 0.8) / bh));
    setView({ z, x: (vw - bw * z) / 2 - minX * z, y: (vh - bh * z) / 2 - minY * z });
  }
  useEffect(() => { const t = setTimeout(fit, 40); return () => clearTimeout(t); }, [full]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* عجلة الماوس = تكبير/تصغير حول المؤشر (في ملء الشاشة، أو مع Ctrl بالوضع المضمّن) */
  useEffect(() => {
    const el = vp.current; if (!el) return undefined;
    const wheel = e => {
      if (!full && !e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      setView(v => {
        const z = Math.max(0.25, Math.min(2, v.z * Math.exp(-e.deltaY * 0.0016)));
        return { z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z) };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [full]);
  /* لمس: إصبعان = تكبير/تصغير (قرص) مع تحريك المخطط بحركة منتصف الإصبعين */
  useEffect(() => {
    const el = vp.current; if (!el) return undefined;
    const pts = new Map(); let pinch = null;
    const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    const dn = e => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        drag.current = null; pan.current = null; pinchOn.current = true;
        const m = mid(), v = viewRef.current;
        pinch = { d: m.d, z: v.z, x: v.x, y: v.y, cx: m.x, cy: m.y };
      }
    };
    const mv = e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || pts.size < 2) return;
      const r = el.getBoundingClientRect(), m = mid();
      const z = Math.max(0.25, Math.min(2, pinch.z * (m.d / pinch.d)));
      const wx = (pinch.cx - r.left - pinch.x) / pinch.z, wy = (pinch.cy - r.top - pinch.y) / pinch.z;
      setView({ z, x: (m.x - r.left) - wx * z, y: (m.y - r.top) - wy * z });
    };
    const upP = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { pinch = null; if (!pts.size) pinchOn.current = false; }
    };
    el.addEventListener('pointerdown', dn, true);
    el.addEventListener('pointermove', mv, true);
    el.addEventListener('pointerup', upP, true);
    el.addEventListener('pointercancel', upP, true);
    return () => { el.removeEventListener('pointerdown', dn, true); el.removeEventListener('pointermove', mv, true); el.removeEventListener('pointerup', upP, true); el.removeEventListener('pointercancel', upP, true); };
  }, [full]);
  const zoomBy = d => { const el = vp.current; if (!el) return; const mx = el.clientWidth / 2, my = el.clientHeight / 2; setView(v => { const cur = Math.round(v.z * 100); const nxt = d > 0 ? (Math.floor(cur / 5) + 1) * 5 : (Math.ceil(cur / 5) - 1) * 5; const z = Math.max(0.25, Math.min(2, nxt / 100)); return { z, x: mx - (mx - v.x) * (z / v.z), y: my - (my - v.y) * (z / v.z) }; }); };
  function panDown(e) {
    if (pinchOn.current || e.target.closest('.wf-node,.wf-edge,button')) return;
    pan.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function panMove(e) { const p = pan.current; if (p) setView(v => ({ ...v, x: p.ox + e.clientX - p.sx, y: p.oy + e.clientY - p.sy })); }
  const panUp = () => { pan.current = null; };

  function link(id) {
    if (!from) { setFrom(id); return; }
    if (from === id) { setFrom(null); return; }
    if (!transitions.some(t => t.from === from && t.to === id)) setTransitions(ts => [...ts, { from, to: id }]);
    setFrom(null);
  }
  const unlink = i => setTransitions(ts => ts.filter(t => !(t.from === edges[i].from && t.to === edges[i].to)));
  const setCol = (id, patch) => setCols(cs => cs.map(c => (c._id === id ? { ...c, ...patch } : c)));
  const preset = kind => {
    const ids = nodes.map(c => c._id);
    if (kind === 'chain') setTransitions(ids.slice(1).map((id, i) => ({ from: ids[i], to: id })));
    else if (kind === 'free') setTransitions([]);
    else if (kind === 'both') setTransitions(ids.slice(1).flatMap((id, i) => [{ from: ids[i], to: id }, { from: id, to: ids[i] }]));
  };

  const node = (
    <div className={`wf ${full ? 'wf-full' : ''}`}>
      <div className="wf-bar">
        <span className="muted small">{from ? 'اختر بلوك الهدف لإكمال السهم… (اضغط نفس البلوك للإلغاء)' : 'اسحب البلوكات، واضغط ● ثم بلوك الهدف لرسم انتقال. اضغط السهم لحذفه.'}</span>
        <span className="grow" />
        <button type="button" className="btn ghost sm" onClick={() => preset('chain')}>تسلسل أمامي</button>
        <button type="button" className="btn ghost sm" onClick={() => preset('both')}>أمامي وخلفي</button>
        <button type="button" className="btn ghost sm" onClick={() => preset('free')}>حرّ (بلا قيود)</button>
        <span className="wf-zoom"><button type="button" className="tb-btn" onClick={() => zoomBy(-1)} aria-label="تصغير">−</button><b>{Math.round(view.z * 100)}%</b><button type="button" className="tb-btn" onClick={() => zoomBy(1)} aria-label="تكبير">＋</button><button type="button" className="btn ghost sm" onClick={fit}>ملاءمة</button></span>
        <button type="button" className="btn ghost sm" onClick={() => setFull(f => !f)} title={full ? 'تصغير (Esc)' : 'ملء الشاشة'}>{full ? <><FIcon n="x" size={13} /> تصغير</> : <><FIcon n="maximize" size={13} /> ملء الشاشة</>}</button>
        {full && <button type="button" className="btn sm" onClick={onSave}>{dirty ? 'حفظ التغييرات' : 'حفظ'}</button>}
      </div>
      <div className="wf-vp" ref={vp} onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp} onPointerCancel={panUp}
        style={{ backgroundPosition: `px ${view.y}px`, backgroundSize: `px ${18 * view.z}px` }}>
        <div className="wf-canvas" style={{ width, height, transform: `translate(${view.x}px,${view.y}px) scale(${view.z})` }} onClick={e => { if (e.target === e.currentTarget) setFrom(null); }}>
          <svg className="wf-svg" width={width} height={height} aria-hidden="true">
            <defs>
              <marker id="wfArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
            </defs>
            {edges.map((t, i) => {
              const g = edgePath(byId[t.from].p, byId[t.to].p);
              return (
                <g key={t.from + '>' + t.to} className={`wf-edge ${hoverEdge === i ? 'hov' : ''}`} onMouseEnter={() => setHoverEdge(i)} onMouseLeave={() => setHoverEdge(-1)} onClick={() => unlink(i)}>
                  <path d={g.d} className="wf-hit" />
                  <path d={g.d} className="wf-line" markerEnd="url(#wfArrow)" />
                  {hoverEdge === i && <text x={g.mid.x} y={g.mid.y} className="wf-x" textAnchor="middle" dominantBaseline="middle">×</text>}
                </g>
              );
            })}
          </svg>
          {nodes.map((c, i) => {
            const p = pos(c, i);
            return (
              <div key={c._id} className={`wf-node ${from === c._id ? 'src' : ''} ${from && from !== c._id ? 'target' : ''}`} style={{ left: p.x, top: p.y, width: W, height: H, '--wc': c.color || '#2f7cf6' }}
                onPointerDown={e => down(e, c, i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onClick={e => { if (from && from !== c._id && !e.target.closest('input')) link(c._id); }}>
                <i className="wf-bar-c" />
                <input className="wf-name" maxLength={40} value={c.newName !== undefined ? c.newName : (c.name || '')} placeholder={c.newName !== undefined ? 'اسم الحالة' : statusName(c.status)}
                  onChange={e => setCol(c._id, c.newName !== undefined ? { newName: e.target.value } : { name: e.target.value || undefined })} aria-label="اسم الحالة" />
                <small className="wf-sub">{c.newName !== undefined ? 'حالة جديدة' : statusName(c.status)}</small>
                <input type="color" className="wf-color" value={c.color || '#2f7cf6'} onChange={e => setCol(c._id, { color: e.target.value })} title="لون الحالة" />
                <button type="button" className="wf-dot" title="رسم انتقال من هذه الحالة" aria-label="رسم انتقال" onClick={() => link(c._id)}><FIcon n="plus" size={11} /></button>
              </div>
            );
          })}
        </div>
      </div>
      {transitions.length === 0 && <p className="muted small" style={{ marginTop: 6 }}>لا توجد أسهم: كل الانتقالات مسموحة.</p>}
    </div>
  );
  return full && typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
