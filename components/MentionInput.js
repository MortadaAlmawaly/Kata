'use client';
/* حقل نص (سطر أو متعدد الأسطر) تظهر فيه قائمة بأسماء الموظفين عند كتابة @ — تُفلتر أثناء الكتابة، وتُختار بالماوس أو الأسهم/Enter/Tab */
import { useMemo, useRef, useState } from 'react';
import { Avatar } from './ui';

const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const tokenAt = (val, caret) => {
  const m = /(^|\s)@([^\s@]*)$/.exec(val.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, q: m[2] } : null;
};

export default function MentionInput({ value, onChange, people = [], multiline = false, className = 'input', onKeyDown, ...rest }) {
  const ref = useRef(null);
  const [tok, setTok] = useState(null);
  const [idx, setIdx] = useState(0);
  const list = useMemo(() => {
    if (!tok) return [];
    const q = norm(tok.q);
    return people.filter(p => !q || norm(p.name).includes(q) || norm(p.title || '').includes(q)).slice(0, 8);
  }, [tok, people]);

  const pick = p => {
    const el = ref.current; if (!el || !tok) return;
    const before = value.slice(0, tok.start), after = value.slice(el.selectionStart);
    const ins = '@' + p.name + ' ';
    onChange(before + ins + after);
    setTok(null);
    requestAnimationFrame(() => { const pos = (before + ins).length; el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) { /* تجاهل */ } });
  };
  const refresh = e => { setTok(tokenAt(e.target.value, e.target.selectionStart)); setIdx(0); };
  const key = e => {
    if (tok && list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % list.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + list.length) % list.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[idx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTok(null); return; }
    }
    if (onKeyDown) onKeyDown(e);
  };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="mn-wrap">
      <Tag ref={ref} className={className} value={value} autoComplete="off"
        onChange={e => { onChange(e.target.value); refresh(e); }} onKeyDown={key} onClick={refresh} onBlur={() => setTimeout(() => setTok(null), 120)} {...rest} />
      {tok && list.length > 0 && (
        <div className="mn-menu" role="listbox" aria-label="الإشارة لزميل">
          {list.map((p, i) => (
            <button type="button" role="option" aria-selected={i === idx} key={p.id} className={`mn-item ${i === idx ? 'on' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setIdx(i)}>
              <Avatar name={p.name} size={24} />
              <span className="mn-name">{p.name}</span>
              {p.title && <small className="mn-sub">{p.title}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
