'use client';
/* حقل تاريخ بصيغة موحّدة YYYY-MM-DD بكل التطبيق (حقل type=date الأصلي يعرض MM/DD/YYYY حسب لغة المتصفح).
   يكتب المستخدم الأرقام فقط (تُنسَّق تلقائياً) أو يختار من التقويم. نفس واجهة <input>: value وonChange(e.target.value). */
import { useEffect, useRef, useState } from 'react';
import { FIcon } from './Icon';
import { fmtDate } from '../lib/util';

const OK = /^\d{4}-\d{2}-\d{2}$/;
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

export default function DateInput({ value = '', onChange, className = '', style, max, min, readOnly, disabled, required, ...rest }) {
  const [txt, setTxt] = useState(value || '');
  const nat = useRef(null);
  useEffect(() => { setTxt(value || ''); }, [value]);
  const emit = v => { if (onChange) onChange({ target: { value: v } }); };

  function typed(e) {
    const d = e.target.value.replace(/[٠-٩]/g, c => AR_DIGITS[c]).replace(/\D/g, '').slice(0, 8);
    const s = d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
    setTxt(s);
    if (!s) emit('');
    else if (OK.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime()) && (!max || s <= max) && (!min || s >= min)) emit(s);
  }
  function pick() {
    const n = nat.current;
    if (!n || disabled || readOnly) return;
    try { if (n.showPicker) n.showPicker(); else n.click(); } catch (_) { n.click(); }
  }
  return (
    <>
    <span className="date-in" style={style}>
      <input type="text" inputMode="numeric" dir="ltr" placeholder="سنة-شهر-يوم" maxLength={10} autoComplete="off"
        className={className} value={txt} onChange={typed} onBlur={() => setTxt(value || '')}
        readOnly={readOnly} disabled={disabled} required={required} {...rest} />
      <button type="button" className="date-pick" tabIndex={-1} aria-label="اختيار التاريخ" disabled={disabled || readOnly} onClick={pick}>
        <FIcon n="calendar" size={15} />
      </button>
      <input ref={nat} type="date" className="date-nat" tabIndex={-1} aria-hidden="true" value={value || ''} min={min} max={max}
        onChange={e => { setTxt(e.target.value); emit(e.target.value); }} />
    </span>
    {value ? <small className="date-ar">{fmtDate(value)}</small> : null}
    </>
  );
}
