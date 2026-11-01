'use client';
/* منتقي صلاحيات فردي ثلاثي الحالة لكل صلاحية: افتراضي حسب الدور / مسموح / ممنوع. */
export default function PermPicker({ catalog, extra, denied, setExtra, setDenied }) {
  const groups = {};
  Object.entries(catalog).forEach(([k, c]) => { (groups[c.group || 'أخرى'] = groups[c.group || 'أخرى'] || []).push([k, c]); });
  const stateOf = k => (denied.has(k) ? 'deny' : extra.has(k) ? 'allow' : 'def');
  function set(k, v) {
    const e = new Set(extra), n = new Set(denied);
    e.delete(k); n.delete(k);
    if (v === 'allow') e.add(k); if (v === 'deny') n.add(k);
    setExtra(e); setDenied(n);
  }
  return (
    <div className="perm-picker">
      {Object.entries(groups).map(([g, list]) => (
        <div key={g}>
          <h4 className="perm-group">{g}</h4>
          {list.map(([k, c]) => (
            <div className="perm-row" key={k}>
              <div><b>{c.label}</b>{c.hint && <small className="muted">{c.hint}</small>}</div>
              <div className="seg-g" role="group" aria-label={c.label}>
                {[['def', 'افتراضي'], ['allow', 'مسموح'], ['deny', 'ممنوع']].map(([v, l]) => (
                  <button type="button" key={v} className={`seg-b ${stateOf(k) === v ? 'on ' + v : ''}`} onClick={() => set(k, v)}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}