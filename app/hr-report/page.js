'use client';
/* صفحة تقرير الموارد البشرية القابلة للطباعة/الحفظ PDF (نص وشعار متجهان): شعار كاتا واسمها، اسم الشركة، الموظف، الراتب، الاستقطاعات، الحضور والإجازات والأوقات. */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ST = { PRESENT: 'حاضر', ABSENT: 'غياب', LEAVE_PAID: 'إجازة مدفوعة', LEAVE_UNPAID: 'إجازة بدون راتب', HOLIDAY: 'عطلة رسمية', OFF: 'عطلة أسبوعية', '': '' };
const money = (n, cur) => (n == null ? '—' : <bdi dir="ltr">{Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '')}</bdi>);
const tm = s => (s ? new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const hrs = m => (m == null ? '—' : (m / 60).toFixed(1));
const dm = d => { const [y, m, dd] = d.split('-').map(Number); return { label: `${dd}/${m}`, wd: WD[new Date(y, m - 1, dd).getDay()] }; };

function Brand() {
  return <div className="hr-brand"><img src="/brand/logo-ar.svg" alt="Kata" /></div>;
}

export default function HrReportPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    document.documentElement.classList.add('hr-print');
    const p = new URLSearchParams(window.location.search);
    const month = p.get('month'), ids = p.get('ids');
    api('GET', `/api/hr/report?month=${encodeURIComponent(month || '')}${ids ? '&ids=' + ids : ''}`).then(setData).catch(e => setErr(e.message));
    return () => document.documentElement.classList.remove('hr-print');
  }, []);
  useEffect(() => {
    if (!data) return;
    document.title = `كاتا — تقرير الموارد البشرية ${data.month}`;
    if (new URLSearchParams(window.location.search).get('noprint')) return undefined;   // للمعاينة بدون نافذة الطباعة
    const t = setTimeout(() => { try { window.print(); } catch (_) { /* تجاهل */ } }, 900);
    return () => clearTimeout(t);
  }, [data]);

  if (err) return <div className="hr-msg">{err}<br /><a href="/attendance">رجوع</a></div>;
  if (!data) return <div className="hr-msg">جارٍ إعداد التقرير…</div>;
  const cur = data.org.currency;
  const [y, m] = data.month.split('-').map(Number);
  const title = `${MONTHS[m - 1]} ${y}`;
  const gen = new Date(data.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const totals = data.people.reduce((a, p) => ({ salary: a.salary + (p.salary || 0), ded: a.ded + p.totalDeduction, net: a.net + (p.net || 0) }), { salary: 0, ded: 0, net: 0 });

  return (
    <div className="hr-doc" dir="rtl">
      <div className="hr-bar no-print">
        <b>تقرير الموارد البشرية — {title}</b>
        <span className="grow" />
        <span className="muted small">في نافذة الطباعة اختر الوجهة «حفظ كـ PDF»</span>
        <button type="button" className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>
        <button type="button" className="btn ghost" onClick={() => window.close()}>إغلاق</button>
      </div>

      <section className="hr-page">
        <header className="hr-head">
          <Brand />
          <div className="hr-title"><h1>تقرير الحضور والإجازات والرواتب</h1><p>{data.org.name} · {title}</p></div>
        </header>
        <div className="hr-meta"><span>الشركة: <b>{data.org.name}</b></span><span>الشهر: <b>{title}</b></span><span>أُعدّ بواسطة: <b>{data.generatedBy}</b></span><span>التاريخ: <b>{gen}</b></span><span>الموظفون: <b>{data.people.length}</b></span></div>
        <h2>ملخص الرواتب</h2>
        <table className="hr-tbl">
          <thead><tr><th>الموظف</th><th>المسمى</th><th>الراتب</th><th>أيام الغياب</th><th>إجازة بدون راتب</th><th>الاستقطاعات</th><th>الصافي</th></tr></thead>
          <tbody>
            {data.people.map(p => (
              <tr key={p.id}><td>{p.name}</td><td>{p.title || '—'}</td><td>{money(p.salary, cur)}</td><td>{p.summary.absent}</td><td>{p.summary.unpaidLeave}</td><td>{money(p.totalDeduction, cur)}</td><td><b>{money(p.net, cur)}</b></td></tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>المجموع</td><td>{money(totals.salary, cur)}</td><td colSpan={2} /><td>{money(totals.ded, cur)}</td><td><b>{money(totals.net, cur)}</b></td></tr></tfoot>
        </table>
        <p className="hr-note">أجر اليوم = الراتب الشهري ÷ {data.dayBasis}. تُخصم أيام «إجازة بدون راتب» والغياب بدون إذن (أيام الدوام فقط، بعد استبعاد العطل الأسبوعية والرسمية).</p>
      </section>

      {data.people.map(p => (
        <section className="hr-page" key={p.id}>
          <header className="hr-head"><Brand /><div className="hr-title"><h1>{p.name}</h1><p>{p.title || ''}{p.department ? ' · ' + p.department : ''} · {data.org.name} · {title}</p></div></header>
          <div className="hr-cards">
            <div><small>الراتب الشهري</small><b>{money(p.salary, cur)}</b></div>
            <div><small>أجر اليوم</small><b>{money(p.dailyRate, cur)}</b></div>
            <div><small>الاستقطاعات</small><b className="bad">{money(p.totalDeduction, cur)}</b></div>
            <div><small>الصافي</small><b className="ok">{money(p.net, cur)}</b></div>
          </div>
          <table className="hr-tbl hrsum">
            <tbody><tr>
              <th>أيام الدوام</th><td>{p.summary.workdays}</td><th>أيام الحضور</th><td>{p.summary.present}</td><th>الغياب</th><td>{p.summary.absent}</td><th>إجازة مدفوعة</th><td>{p.summary.paidLeave}</td>
            </tr><tr>
              <th>إجازة بدون راتب</th><td>{p.summary.unpaidLeave}</td><th>التأخير (د)</th><td>{p.summary.lateMin}</td><th>خروج مبكر (د)</th><td>{p.summary.earlyMin}</td><th>إضافي (د)</th><td>{p.summary.overtimeMin}</td>
            </tr></tbody>
          </table>
          <div className="hr-two">
            <div>
              <h3>الاستقطاعات</h3>
              <table className="hr-tbl">
                <thead><tr><th>البند</th><th>الأيام</th><th>المبلغ</th></tr></thead>
                <tbody>
                  {p.deductions.length ? p.deductions.map((x, i) => <tr key={i}><td>{x.label}</td><td>{x.days}</td><td>{money(x.amount, cur)}</td></tr>) : <tr><td colSpan={3}>{p.salary == null ? 'لم يُحدَّد الراتب' : 'لا توجد استقطاعات'}</td></tr>}
                </tbody>
                <tfoot><tr><td colSpan={2}>إجمالي الاستقطاعات</td><td>{money(p.totalDeduction, cur)}</td></tr></tfoot>
              </table>
            </div>
            <div>
              <h3>الإجازات المعتمدة</h3>
              <table className="hr-tbl">
                <thead><tr><th>النوع</th><th>من</th><th>إلى</th><th>الحالة</th></tr></thead>
                <tbody>
                  {p.leaves.length ? p.leaves.map((l, i) => <tr key={i}><td>{l.name}</td><td>{l.from}</td><td>{l.to}</td><td>{l.paid ? 'مدفوعة' : 'بدون راتب'}</td></tr>) : <tr><td colSpan={4}>لا توجد إجازات بهذا الشهر</td></tr>}
                </tbody>
              </table>
            </div>
          </div>          <h3>سجل الحضور اليومي</h3>
          <table className="hr-tbl days">
            <thead><tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>الحضور</th><th>الخروج</th><th>الساعات</th><th>تأخير (د)</th><th>مبكر (د)</th><th>إضافي (د)</th></tr></thead>
            <tbody>
              {p.days.map(d => { const x = dm(d.date); return (
                <tr key={d.date} className={`st-${d.status || 'NONE'}`}>
                  <td>{x.label}</td><td>{x.wd}</td><td>{ST[d.status]}{d.leave && d.status.startsWith('LEAVE') ? ` (${d.leave})` : ''}</td>
                  <td>{d.status === 'PRESENT' ? tm(d.checkIn) : ''}</td><td>{d.status === 'PRESENT' ? tm(d.checkOut) : ''}</td><td>{d.status === 'PRESENT' ? hrs(d.workedMin) : ''}</td>
                  <td>{d.lateMin || ''}</td><td>{d.earlyMin || ''}</td><td>{d.overtimeMin || ''}</td>
                </tr>); })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}