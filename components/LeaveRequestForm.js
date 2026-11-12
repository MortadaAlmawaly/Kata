'use client';
/* نموذج طلب إجازة (يُفتح من صفحة الحضور والإجازات): نوع الإجازة + الفترة + السبب + مرفقات */
import { plural } from './hooks';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { pad } from '../lib/constants';
import { Modal } from './ui';
import { FilePicker, uploadFiles } from './Files';
import DateInput from './DateInput';

/* أول يوم عمل (أحد–خميس) بعد n أيام عمل من اليوم: للإشعار المسبق المطلوب بالسياسة */
const workDaysAhead = n => { const d = new Date(); for (let k = 0; k < n;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 5 && d.getDay() !== 6) k++; } return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export default function LeaveRequestForm({ onClose, onSaved, onError }) {
  const [bal, setBal] = useState({ types: [] });
  const [f, setF] = useState({ title: '', details: '', startDate: workDaysAhead(3), endDate: workDaysAhead(3), leaveType: '' });   // أقرب تاريخ تقبله قاعدة الإشعار المسبق
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  useEffect(() => { api('GET', '/api/leave-balance').then(setBal).catch(() => {}); }, []);
  const types = bal.types && bal.types.length ? bal.types : [{ key: 'annual', name: 'سنوية', remaining: bal.remaining }];
  const ltKey = f.leaveType || types[0].key;
  const days = f.startDate && f.endDate && f.endDate >= f.startDate ? Math.round((new Date(f.endDate) - new Date(f.startDate)) / 864e5) + 1 : 0;
  const t = types.find(x => x.key === ltKey);
  const over = t && t.remaining != null && days > t.remaining;
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!days) return;   // الرسالة الواضحة تظهر أصلاً تحت التواريخ (مرة وحدة بدل تكرارها)
    setBusy(true);
    try {
      const title = f.title.trim() || `طلب إجازة ${(t && t.name) || ''}`.trim();
      const r = await api('POST', '/api/requests', { type: 'LEAVE', title, details: f.details || null, startDate: f.startDate, endDate: f.endDate, leaveType: ltKey });
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('request', r.id, files.current.files);
        if (up.failed.length && onError) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved(r);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title="طلب إجازة" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>نوع الإجازة</span>
          <select value={ltKey} onChange={set('leaveType')}>
            {types.map(x => <option key={x.key} value={x.key}>{x.name}{x.remaining != null ? `  — المتبقي ${plural(x.remaining, 'يوم', 'يومان', 'أيام', 'يوماً')}` : ' — غير محدود'}</option>)}
          </select></label>
        <div className="row2">
          <label className="field"><span>من</span><DateInput value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field"><span>إلى</span><DateInput value={f.endDate} onChange={set('endDate')} /></label>
        </div>
        <div className="chips-row" style={{ margin: '-4px 0 8px' }}>
          <button type="button" className="btn sm ghost" onClick={() => setF({ ...f, startDate: todayStr(), endDate: todayStr() })}>اليوم</button>
          <button type="button" className="btn sm ghost" title="أقرب موعد يقبله إشعار الـ 3 أيام عمل" onClick={() => { const s = workDaysAhead(3); setF({ ...f, startDate: s, endDate: s }); }}>بعد 3 أيام عمل</button>
        </div>
        <p className="muted small">
          {days ? <>المدة: <b>{plural(days, 'يوم', 'يومان', 'أيام', 'يوماً')}</b>{over && <span style={{ color: 'var(--bad)' }}> — تتجاوز رصيدك المتبقي</span>}</> : <span style={{ color: 'var(--bad)' }}>{!f.startDate || !f.endDate ? 'اختر تاريخ البداية والنهاية' : 'تاريخ النهاية قبل تاريخ البداية'}</span>}
          {days > 0 && ltKey !== 'sick' && f.startDate < workDaysAhead(3) && <span style={{ color: 'var(--warn)', display: 'block' }}>تنبيه: سياسة الإجازات تشترط إشعاراً مسبقاً 3 أيام عمل، فأقرب تاريخ مقبول {workDaysAhead(3)} (المرضية مستثناة).</span>}
        </p>
        <label className="field"><span>العنوان (اختياري)</span><input value={f.title} maxLength={140} placeholder="مثال: إجازة عائلية" onChange={set('title')} /></label>
        <label className="field"><span>السبب / ملاحظات</span><textarea value={f.details} maxLength={4000} onChange={set('details')} /></label>
        <FilePicker label="مرفقات (تقرير طبي مثلاً)" inputRef={files} />
        <p className="notice">يصل الطلب لرئيسك المباشر ويُبلَّغ بقراره. سياسة الشركة: إشعار مسبق 3 أيام عمل على الأقل (الإجازة المرضية مستثناة).</p>
        <p className="err" role={err ? 'alert' : undefined}>{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>رجوع</button>
          <button type="submit" className="btn" disabled={busy}>تقديم الطلب</button>
        </div>
      </form>
    </Modal>
  );
}