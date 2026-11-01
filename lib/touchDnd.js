/* سحب وإفلات باللمس: ضغطة مطوّلة على أي عنصر draggable (بطاقة مهمة، صف Backlog…) ثم سحب بالإصبع.
   يحوّل اللمس إلى أحداث dragstart/dragover/drop التي تعالجها الصفحات أصلاً، فلا يتغير منطق النقل. الفأرة تبقى على السحب الأصلي. */
export function installTouchDnd() {
  if (typeof window === 'undefined' || window.__touchDnd) return () => {};
  window.__touchDnd = true;
  const HOLD = 260, SLOP = 9, EDGE = 52;
  let st = null, touching = false;

  const mkDt = () => {
    const d = {};
    return {
      effectAllowed: 'all', dropEffect: 'move', types: [], files: [], items: [],
      setData(k, v) { d[k] = String(v); if (!this.types.includes(k)) this.types.push(k); },
      getData(k) { return d[k] || ''; },
      clearData() { Object.keys(d).forEach(k => delete d[k]); this.types = []; },
      setDragImage() { /* غير مستخدم */ },
    };
  };
  const fire = (el, type, dt, x, y) => {
    if (!el) return;
    const e = new Event(type, { bubbles: true, cancelable: true });
    e.dataTransfer = dt; e.clientX = x; e.clientY = y;
    el.dispatchEvent(e);
  };

  /* إن أُفلتت البطاقة تحت العمود (مساحة فارغة) أو بين الأعمدة تُنسب لأقرب عمود أفقياً بدل أن تُهمل */
  const resolveTarget = el => {
    if (el && el.closest && el.closest('.col')) return el;
    const board = st.src.closest && st.src.closest('.board');
    if (!board) return el;
    const br = board.getBoundingClientRect();
    if (st.y < br.top - 10 || st.y > window.innerHeight - 64) return el;
    let best = null, bd = Infinity;
    board.querySelectorAll(':scope > .col').forEach(c => {
      const r = c.getBoundingClientRect();
      const d = st.x < r.left ? r.left - st.x : st.x > r.right ? st.x - r.right : 0;
      if (d < bd) { bd = d; best = c; }
    });
    return best || el;
  };
  const place = () => {
    const g = st.ghost;
    g.style.left = (st.x - st.dx) + 'px'; g.style.top = (st.y - st.dy) + 'px';
    const el = resolveTarget(document.elementFromPoint(st.x, st.y));
    if (el !== st.over) {
      if (st.over) fire(st.over, 'dragleave', st.dt, st.x, st.y);
      st.over = el;
      if (el) fire(el, 'dragenter', st.dt, st.x, st.y);
    }
    if (el) fire(el, 'dragover', st.dt, st.x, st.y);
  };

  /* تمرير تلقائي عند الاقتراب من حافة الشاشة (للوصول لأعمدة بعيدة) */
  const loop = () => {
    if (!st || !st.started) return;
    if (!st.tick) st.tick = setInterval(step, 30);
  };
  const step = () => {
    if (!st || !st.started) return;
    const dx = st.x < EDGE ? -14 : st.x > window.innerWidth - EDGE ? 14 : 0;
    const dy = st.y < EDGE + 56 ? -10 : st.y > window.innerHeight - EDGE - 56 ? 10 : 0;
    if (dx || dy) {
      /* نبحث عن حاوية قابلة للتمرير من العنصر تحت الإصبع، وإن لم نجد (حافة الشاشة خارج اللوحة) من البطاقة نفسها */
      const scrollFrom = start => {
        for (let n = start; n && n !== document.documentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const sx = dx && n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(cs.overflowX);
          const sy = dy && n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(cs.overflowY);
          if (sx || sy) { if (sx) n.scrollLeft += dx; if (sy) n.scrollTop += dy; return true; }
        }
        return false;
      };
      if (!scrollFrom(st.over)) scrollFrom(st.src);
      place();
    }
  };

  const begin = () => {
    if (!st) return;
    st.started = true;
    const r = st.src.getBoundingClientRect();
    const g = st.src.cloneNode(true);
    g.removeAttribute('draggable'); g.classList.add('td-ghost');
    Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: '0', zIndex: '100000', pointerEvents: 'none', opacity: '1', transform: 'scale(1.04) rotate(1.5deg)', boxShadow: '0 14px 34px rgba(0,0,0,.5)' });
    /* نحيط النسخة بعناصر فارغة (display:contents) لها نفس أصناف الأجداد، فتنطبق عليها نفس قواعد CSS وتظهر مطابقة للبطاقة الأصلية */
    let root = g;
    for (let n = st.src.parentElement, i = 0; n && n !== document.body && i < 10; n = n.parentElement, i++) {
      const w = document.createElement('div');
      w.className = typeof n.className === 'string' ? n.className : '';
      w.style.display = 'contents';
      w.appendChild(root); root = w;
    }
    document.body.appendChild(root);
    st.ghost = g; st.ghostRoot = root; st.dx = st.x0 - r.left; st.dy = st.y0 - r.top;
    fire(st.src, 'dragstart', st.dt, st.x0, st.y0);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* غير مدعوم */ }
    document.documentElement.classList.add('td-dragging');
    loop();
  };

  const swallowClick = () => {
    const h = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', h, true);
    setTimeout(() => document.removeEventListener('click', h, true), 450);
  };
  const finish = drop => {
    if (!st) return;
    clearTimeout(st.timer);
    const s = st; st = null;
    if (!s.started) return;
    clearInterval(s.tick);
    if (drop && s.over) fire(s.over, 'drop', s.dt, s.x, s.y);
    fire(s.src, 'dragend', s.dt, s.x, s.y);
    if (s.ghostRoot) s.ghostRoot.remove();
    document.documentElement.classList.remove('td-dragging');
    swallowClick();
  };

  const onStart = e => {
    touching = true;
    if (e.touches.length !== 1) { finish(false); return; }
    const t = e.touches[0];
    const src = e.target.closest && e.target.closest('[draggable="true"]');
    if (!src || e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    st = { src, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, started: false, over: null, dt: mkDt(), ghost: null };
    st.timer = setTimeout(begin, HOLD);
  };
  const onMove = e => {
    if (!st) return;
    const t = e.touches[0]; if (!t) return;
    st.x = t.clientX; st.y = t.clientY;
    if (!st.started) { if (Math.hypot(st.x - st.x0, st.y - st.y0) > SLOP) { clearTimeout(st.timer); st = null; } return; }
    e.preventDefault();
    place();
  };
  const onEnd = e => {
    touching = false;
    if (!st) return;
    if (st.started) { e.preventDefault(); finish(true); } else { clearTimeout(st.timer); st = null; }
  };
  const onCancel = () => { touching = false; finish(false); if (st) { clearTimeout(st.timer); st = null; } };
  /* منع السحب الأصلي للمتصفح وقائمة النسخ أثناء اللمس حتى لا يتعارض مع سحبنا */
  const onNativeDrag = e => { if (touching && e.isTrusted) e.preventDefault(); };
  const onCtx = e => { if (st && st.started) e.preventDefault(); };

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: false });
  document.addEventListener('touchcancel', onCancel);
  document.addEventListener('dragstart', onNativeDrag, true);
  document.addEventListener('contextmenu', onCtx, true);
  return () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onCancel);
    document.removeEventListener('dragstart', onNativeDrag, true);
    document.removeEventListener('contextmenu', onCtx, true);
    window.__touchDnd = false;
  };
}
