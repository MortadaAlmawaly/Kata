'use client';
/* حقل «النوع»: نص حرّ تكتبه بنفسك مع اقتراحات من الأنواع المعروفة (تُعرض بأسمائها). اتركه فارغاً = بدون نوع. */
import { useEffect, useId, useState } from 'react';

export default function TypeInput({ ctx, value, onChange, commit = 'change', className = 'input', placeholder = 'اكتب النوع أو اختر…' }) {
  const id = useId();
  const labelOf = v => (v ? (ctx.itype[v] || v) : '');
  const [text, setText] = useState(labelOf(value));
  useEffect(() => { setText(labelOf(value)); }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* ما يُكتب يطابق اسماً معروفاً → نخزّن مفتاحه، وإلا النص كما هو */
  const toValue = s => {
    const t = s.trim();
    if (!t) return '';
    const hit = Object.entries(ctx.itype).find(([, l]) => l.toLowerCase() === t.toLowerCase());
    return hit ? hit[0] : t.slice(0, 40);
  };
  const fire = s => { const v = toValue(s); if (v !== (value || '')) onChange(v); };
  const suggestions = [...new Set([...ctx.itypeOpts(value).map(([, l]) => l), ...(ctx.customTypes || [])])];
  return (
    <>
      <input className={className} list={id} value={text} maxLength={40} placeholder={placeholder}
        onChange={e => { setText(e.target.value); if (commit === 'change') fire(e.target.value); }}
        onBlur={() => { if (commit === 'blur') fire(text); }}
        onKeyDown={e => { if (e.key === 'Enter' && commit === 'blur') { e.preventDefault(); e.currentTarget.blur(); } }} />
      <datalist id={id}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
    </>
  );
}