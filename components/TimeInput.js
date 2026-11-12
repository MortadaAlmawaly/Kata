'use client';
/* حقل وقت بنظام 24 ساعة دائماً (HH:MM) بغضّ النظر عن لغة المتصفح (حقل type=time الأصلي يعرض AM/PM بمتصفح إنكليزي).
   نفس واجهة <input>: value بصيغة HH:MM وonChange(e.target.value). */
import { useEffect, useState } from 'react';

const OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

export default function TimeInput({ value = '', onChange, className = '', style, readOnly, disabled, required, ...rest }) {
  const [txt, setTxt] = useState(value || '');
  useEffect(() => { setTxt(value || ''); }, [value]);
  const emit = v => { if (onChange) onChange({ target: { value: v } }); };

  function typed(e) {
    const d = e.target.value.replace(/[٠-٩]/g, c => AR_DIGITS[c]).replace(/\D/g, '').slice(0, 4);
    const s = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    setTxt(s);
    if (!s) emit(''); else if (OK.test(s)) emit(s);
  }
  return (
    <input type="text" inputMode="numeric" dir="ltr" placeholder="14:30" maxLength={5} autoComplete="off"
      className={className} style={{ textAlign: 'right', ...style }} value={txt} onChange={typed}
      onBlur={() => setTxt(value || '')} readOnly={readOnly} disabled={disabled} required={required} {...rest} />
  );
}
