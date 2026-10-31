'use client';
/* قائمة الحالة (انتقالات مسموحة) + عرض سير العمل للقراءة فقط */
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';
import { FIcon } from './Icon';
import { H, W, defaultPos, edgePath } from './WorkflowEditor';

const colorOf = (ctx, k) => (((ctx.board && ctx.board.columns) || []).find(c => c.status === k) || {}).color || '#2f7cf6';

export function StatusMenu({ ctx, status, onPick }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const opts = ctx.statusOpts(status);
  const cur = opts.find(([k]) => k === status);
  const targets = opts.filter(([k]) => k !== status);
  return (
    <span className="st-wrap" ref={ref}>
      <button type="button" className={`st-btn ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>{cur ? cur[1] : status}</span><FIcon n="chev" size={14} />
      </button>
      {open && (
        <div className="st-menu" role="menu">
          <div className="st-head">الانتقال إلى</div>
          {targets.map(([k, l]) => (
            <button type="button" role="menuitem" className="st-item" key={k} onClick={() => { setOpen(false); onPick(k); }}>
              <span className="st-lab">الانتقال إلى</span>
              <FIcon n="arrow" size={16} />
              <span className="st-chip" style={{ '--sc': colorOf(ctx, k) }}>{l}</span>
            </button>
          ))}
          {!targets.length && <div className="st-empty">لا توجد انتقالات متاحة من هذه الحالة.</div>}
          <div className="st-sep" />
          <button type="button" role="menuitem" className="st-item plain" onClick={() => { setOpen(false); setView(true); }}>عرض سير العمل</button>
        </div>
      )}
      {view && <WorkflowView ctx={ctx} status={status} onClose={() => setView(false)} />}
    </span>
  );
}

function WorkflowView({ ctx, status, onClose }) {
  const b = ctx.board || {};
  const cols = (b.columns || []).map(c => ({ key: c.status, name: c.name, color: c.color }));
  const label = k => (ctx.statusOpts('') .find(([x]) => x === k) || [])[1] || k;
  const pos = (b.detail || {}).wfPos || {};
  const trs = (b.detail || {}).transitions || [];
  const P = (c, i) => pos[c.key] || defaultPos(i);
  const by = Object.fromEntries(cols.map((c, i) => [c.key, P(c, i)]));
  const width = Math.max(640, ...cols.map((c, i) => P(c, i).x + W + 30)), height = Math.max(200, ...cols.map((c, i) => P(c, i).y + H + 30));
  return (
    <Modal title="سير العمل" wide onClose={onClose}>
      <p className="muted small">{trs.length ? 'الأسهم تبيّن الانتقالات المسموحة بين الحالات.' : 'لا توجد قيود: يمكن الانتقال بين كل الحالات.'}</p>
      <div className="wf-scroll" style={{ maxHeight: 460 }}>
        <div className="wf-canvas" style={{ width, height }}>
          <svg className="wf-svg" width={width} height={height} aria-hidden="true">
            <defs><marker id="wfArrowV" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
            {trs.filter(t => by[t.from] && by[t.to]).map(t => <path key={t.from + '>' + t.to} d={edgePath(by[t.from], by[t.to]).d} className="wf-line" markerEnd="url(#wfArrowV)" />)}
          </svg>
          {cols.map((c, i) => {
            const p = P(c, i);
            return (
              <div key={c.key} className={`wf-node view ${c.key === status ? 'src' : ''}`} style={{ left: p.x, top: p.y, width: W, height: H, '--wc': c.color || '#2f7cf6', cursor: 'default' }}>
                <i className="wf-bar-c" /><b className="wf-name view">{c.name || label(c.key)}</b>
                {c.key === status && <small className="wf-sub">الحالة الحالية</small>}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}