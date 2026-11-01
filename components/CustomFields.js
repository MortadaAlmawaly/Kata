'use client';
/* حقل مخصص واحد (نص/رقم/تاريخ/رابط/قائمة/شخص…) كمكوّن متحكَّم به. onChange(value) يُستدعى بالقيمة المطبَّعة. */
import { useEffect, useState } from 'react';
import { FIcon } from './Icon';

const ARR = ['multiselect', 'tags', 'users'];

export default function CfInput({ d, value, users, onChange, commitOnBlur = false, disabled = false }) {
  const [v, setV] = useState(value ?? (ARR.includes(d.type) ? [] : ''));
  useEffect(() => { setV(value ?? (ARR.includes(d.type) ? [] : '')); }, [value, d.type]);
  const push = x => onChange(x);
  switch (d.type) {
    case 'longtext':
      return <textarea className="fin cf-area" rows={3} maxLength={4000} placeholder="أضف نصاً…" disabled={disabled} value={v}
        onChange={e => setV(e.target.value)} onBlur={() => { if (commitOnBlur) push(v === '' ? null : v); }} />;
    case 'number':
      return <input className="fin" type="number" step="any" placeholder="أضف رقماً" disabled={disabled} value={v}
        onChange={e => { setV(e.target.value); if (!commitOnBlur) push(e.target.value === '' ? null : Number(e.target.value)); }}
        onBlur={() => { if (commitOnBlur) push(v === '' ? null : Number(v)); }} />;
    case 'date':
      return <input className={`fin dt ${v ? '' : 'empty'}`} type="date" disabled={disabled} value={v}
        onChange={e => { setV(e.target.value); push(e.target.value || null); }} />;
    case 'url':
      return <input className="fin" type="url" dir="ltr" placeholder="https://…" disabled={disabled} value={v}
        onChange={e => setV(e.target.value)} onBlur={() => push(v === '' ? null : v)} />;
    case 'money':
    case 'percent':
      return <span className="cf-unit"><input className="fin" type="number" step="any" min={d.type === 'percent' ? 0 : undefined} max={d.type === 'percent' ? 100 : undefined} placeholder={d.type === 'percent' ? '0 – 100' : 'المبلغ'} disabled={disabled} value={v}
        onChange={e => { setV(e.target.value); if (!commitOnBlur) push(e.target.value === '' ? null : Number(e.target.value)); }}
        onBlur={() => { if (commitOnBlur) push(v === '' ? null : Number(v)); }} />{d.type === 'percent' && <i>%</i>}</span>;
    case 'rating':
      return (
        <span className="cf-stars">
          {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} disabled={disabled} className={Number(v) >= n ? 'on' : ''} aria-label={n + ' نجوم'}
            onClick={() => { const nv = Number(v) === n ? '' : n; setV(nv); push(nv === '' ? null : nv); }}><FIcon n="star" size={20} /></button>)}
        </span>
      );
    case 'datetime':
      return <input className={`fin dt ${v ? '' : 'empty'}`} type="datetime-local" disabled={disabled} value={v}
        onChange={e => { setV(e.target.value); push(e.target.value || null); }} />;
    case 'time':
      return <input className={`fin dt ${v ? '' : 'empty'}`} type="time" disabled={disabled} value={v}
        onChange={e => { setV(e.target.value); push(e.target.value || null); }} />;
    case 'email':
    case 'phone':
      return <input className="fin" type={d.type === 'email' ? 'email' : 'tel'} dir="ltr" placeholder={d.type === 'email' ? 'name@example.com' : '+964…'} disabled={disabled} value={v}
        onChange={e => setV(e.target.value)} onBlur={() => push(v === '' ? null : v)} />;
    case 'color':
      return <span className="cf-color"><input type="color" disabled={disabled} value={v || '#2f7cf6'} onChange={e => { setV(e.target.value); push(e.target.value); }} />
        {v && <button type="button" className="tb-btn" disabled={disabled} aria-label="مسح" onClick={() => { setV(''); push(null); }}><FIcon n="x" size={14} /></button>}</span>;
    case 'radio':
      return (
        <div className="cf-radio">
          {(d.options || []).map(o => <button type="button" key={o} disabled={disabled} className={v === o ? 'on' : ''}
            onClick={() => { const nv = v === o ? '' : o; setV(nv); push(nv || null); }}>{o}</button>)}
          {!(d.options || []).length && <span className="muted small">لا خيارات</span>}
        </div>
      );
    case 'tags':
      return (
        <div className="cf-tags">
          {(Array.isArray(v) ? v : []).map(t => <span className="cf-tag" key={t}>{t}<button type="button" disabled={disabled} aria-label="إزالة" onClick={() => { const n = v.filter(x => x !== t); setV(n); push(n); }}><FIcon n="x" size={14} /></button></span>)}
          <input className="cf-taginp" maxLength={30} placeholder="أضف وسماً…" disabled={disabled}
            onKeyDown={e => {
              if (e.key !== 'Enter' && e.key !== ',') return;
              e.preventDefault();
              const t = e.currentTarget.value.trim(); if (!t) return;
              const cur = Array.isArray(v) ? v : []; if (cur.includes(t)) { e.currentTarget.value = ''; return; }
              const n = [...cur, t]; setV(n); push(n); e.currentTarget.value = '';
            }} />
        </div>
      );
    case 'users':
      return (
        <div className="cf-multi">
          {(users || []).map(u => (
            <label className="cf-opt" key={u.id}>
              <input type="checkbox" disabled={disabled} checked={(Array.isArray(v) ? v : []).includes(u.id)} onChange={e => {
                const cur = Array.isArray(v) ? v : [];
                const n = e.target.checked ? [...cur, u.id] : cur.filter(x => x !== u.id);
                setV(n); push(n);
              }} /><span>{u.name}</span>
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return <label className="cf-check"><input type="checkbox" disabled={disabled} checked={!!v} onChange={e => { setV(e.target.checked); push(e.target.checked); }} /> نعم</label>;
    case 'select':
      return (
        <select className="fsel" disabled={disabled} value={v} onChange={e => { setV(e.target.value); push(e.target.value || null); }}>
          <option value="">—</option>{(d.options || []).map(o => <option key={o}>{o}</option>)}
        </select>
      );
    case 'multiselect':
      return (
        <div className="cf-multi">
          {(d.options || []).map(o => (
            <label className="cf-opt" key={o}>
              <input type="checkbox" disabled={disabled} checked={(Array.isArray(v) ? v : []).includes(o)} onChange={e => {
                const cur = Array.isArray(v) ? v : [];
                const n = e.target.checked ? [...cur, o] : cur.filter(x => x !== o);
                setV(n); push(n);
              }} /><span>{o}</span>
            </label>
          ))}
          {!(d.options || []).length && <span className="muted small">لا خيارات</span>}
        </div>
      );
    case 'user':
      return (
        <select className="fsel" disabled={disabled} value={v === null ? '' : String(v)} onChange={e => { setV(e.target.value); push(e.target.value ? +e.target.value : null); }}>
          <option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      );
    default:
      return <input className="fin" maxLength={300} placeholder="أضف نصاً" disabled={disabled} value={v}
        onChange={e => setV(e.target.value)} onBlur={() => push(v === '' ? null : v)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />;
  }
}
