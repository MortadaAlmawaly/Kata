/* مخططات SVG بسيطة + حلقة التقدّم (ترحيل chartLine/chartBars/ringHTML) */
export function Ring({ pct, size = 64, stroke = 7, color }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = color || (p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--accent)' : 'var(--warn)');
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="val" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <b style={{ fontSize: Math.max(12, Math.round(size * 0.26)) }}>{Math.round(p)}%</b>
    </span>
  );
}

export const Bar = ({ p }) => <div className="bar" title={`${p}%`}><i style={{ width: `${Math.max(0, Math.min(100, p))}%` }} /></div>;

export function ChartLine({ points, series, w = 640, h = 220 }) {
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const nice = Math.ceil(max / 4) * 4 || 4;
  const x = i => pad.l + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = v => pad.t + ih - (v / nice) * ih;
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img">
        {[0, 1, 2, 3, 4].map(i => {
          const v = (nice / 4) * i;
          return (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} className="gl" />
              <text x={pad.l - 6} y={y(v) + 4} className="gt" textAnchor="end">{Math.round(v)}</text>
            </g>
          );
        })}
        {points.map((p, i) => (i % every === 0 ? <text key={i} x={x(i)} y={h - 6} className="gt" textAnchor="middle">{p}</text> : null))}
        {series.map(s => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          const area = `${d} L${x(s.values.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
          return (
            <g key={s.name}>
              {s.area && <path d={area} fill={s.color} opacity=".12" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={s.color}><title>{`${s.name} — ${points[i]}: ${v}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ marginTop: 6 }}>
        {series.map(s => <span className="fchip" key={s.name} style={{ '--c': s.color }}><i />{s.name}</span>)}
      </div>
    </>
  );
}

export function ChartBars({ items, w = 640, h = 220, color = 'var(--accent)', fmtV = v => v }) {
  const pad = { l: 12, r: 12, t: 18, b: 28 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...items.map(i => i.value));
  const bw = iw / Math.max(1, items.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img">
      <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="gl" />
      {items.map((it, i) => {
        const bh = (it.value / max) * ih, bx = pad.l + i * bw + bw * 0.18;
        return (
          <g key={i}>
            <rect x={bx} y={pad.t + ih - bh} width={bw * 0.64} height={Math.max(bh, 1)} rx="5" fill={color}><title>{`${it.label}: ${fmtV(it.value)}`}</title></rect>
            <text x={bx + bw * 0.32} y={pad.t + ih - bh - 5} className="gt" textAnchor="middle">{it.value ? fmtV(it.value) : ''}</text>
            <text x={bx + bw * 0.32} y={h - 8} className="gt" textAnchor="middle">{it.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
