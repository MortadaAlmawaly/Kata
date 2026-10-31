'use client';
/* تصدير تقرير الحضور والإجازات والرواتب (للمدير التنفيذي وموظف الموارد البشرية): اختيار الشهر والموظفين وتعديل الرواتب ثم فتح صفحة الطباعة (PDF) */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { pad } from '../lib/constants';
import { ROLE } from '../lib/constants';
import { Avatar } from './ui';

const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

export default function HrExport({ toast, currency }) {
  const [people, setPeople] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [month, setMonth] = useState(nowMonth());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api('GET', '/api/hr/people').then(p => { setPeople(p); setSel(new Set(p.map(x => x.id))); }).catch(e => toast(e.message, 'err'));
  }, [toast]);
  if (!people) return null;
  const toggle = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const saveSalary = async (p, v) => {
    const salary = v === '' ? null : Number(v);
    if (salary !== null && (Number.isNaN(salary) || salary < 0)) { toast('راتب غير صالح', 'err'); return; }
    if (salary === p.salary) return;
    try { await api('PUT', '/api/hr/salary/' + p.id, { salary }); setPeople(ps => ps.map(x => (x.id === p.id ? { ...x, salary } : x))); toast('تم حفظ الراتب'); } catch (e) { toast(e.message, 'err'); }
  };
  const exportPdf = () => {
    if (!sel.size) { toast('اختر موظفاً واحداً على الأقل', 'err'); return; }
    window.open(`/hr-report?month=${month}&ids=${[...sel].join(',')}`, '_blank');
  };
  return (
    <section className="card hr-card">
      <div className="toolbar" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>تقرير الموارد البشرية (PDF)</h3><span className="grow" />
        <button type="button" className="btn ghost sm" onClick={() => setOpen(o => !o)}>{open ? 'إخفاء' : 'إعداد التقرير'}</button>
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>سجل الحضور والإجازات والأوقات مع الراتب والاستقطاعات حسب الإجازات والغياب. يظهر للمدير التنفيذي ولموظف الموارد البشرية فقط.</p>
      {open && (
        <>
          <div className="toolbar" style={{ margin: '12px 0 8px' }}>
            <label className="field" style={{ margin: 0 }}><span>الشهر</span><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
            <span className="grow" />
            <button type="button" className="btn ghost sm" onClick={() => setSel(new Set(people.map(p => p.id)))}>تحديد الكل</button>
            <button type="button" className="btn ghost sm" onClick={() => setSel(new Set())}>إلغاء التحديد</button>
            <button type="button" className="btn" onClick={exportPdf}>تصدير PDF ({sel.size})</button>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th /><th>الموظف</th><th>الدور</th><th>الراتب الشهري {currency ? `(${currency})` : ''}</th></tr></thead>
            <tbody>
              {people.map(p => (
                <tr key={p.id}>
                  <td><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={'تحديد ' + p.name} /></td>
                  <td><span className="who"><Avatar name={p.name} size={24} />{p.name}</span> <small className="muted">{p.title || ''}</small></td>
                  <td>{ROLE[p.role] || p.role}</td>
                  <td><input className="input hr-sal" type="number" min="0" step="any" defaultValue={p.salary == null ? '' : p.salary} placeholder="غير محدد" onBlur={e => saveSalary(p, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted small">أجر اليوم = الراتب ÷ 30. تُخصم أيام «إجازة بدون راتب» والغياب بدون إذن (أيام الدوام فقط وبعد استبعاد العطل الرسمية). سيفتح التقرير بنافذة جديدة: اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
        </>
      )}
    </section>
  );
}