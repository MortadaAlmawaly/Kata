'use client';
/* التحليلات — ترحيل React لـ viewAnalytics (views-biz.js) + تصدير PDF عبر الطباعة. */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmt, todayStr } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Icon } from '../../components/ui';
import { ChartBars, ChartLine } from '../../components/charts';
import { useToast } from '../../components/hooks';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function reportHTML(d, weeks, me) {
  const cur = esc(me.org.currency);
  const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const done = d.weeks.reduce((s, w) => s + w.done, 0), created = d.weeks.reduce((s, w) => s + w.created, 0), late = d.weeks.reduce((s, w) => s + w.late, 0);
  const spend = d.spendByMonth.reduce((s, m) => s + m.total, 0);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير التحليلات</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;color:#1a1d2e;padding:24px}h1{font-size:20px}h2{font-size:15px;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d6d9e4;padding:6px 8px;text-align:right}th{background:#f1f3f9}
  .meta{color:#666;font-size:12px}.k{display:flex;gap:10px;margin:14px 0}.k div{flex:1;border:1px solid #d6d9e4;border-radius:8px;padding:10px}.k b{display:block;font-size:20px}</style></head><body>
  <h1>${esc(me.org.name)} — تقرير التحليلات</h1>
  <div class="meta">آخر ${weeks} أسبوعاً · ${d.people} شخصاً · أعدّه ${esc(me.user.name)} · ${todayStr()}</div>
  <div class="k"><div><small>مهام منجزة</small><b>${done}</b>من ${created} أُنشئت</div><div><small>بعد الموعد</small><b>${late}</b></div>
  <div><small>مصروفات معتمدة</small><b>${fmt(spend)} ${cur}</b></div></div>
  <h2>التفصيل الأسبوعي</h2>
  ${tbl(['بداية الأسبوع', 'أُنشئت', 'منجزة', 'بعد الموعد', 'نسبة الحضور', 'أيام تأخير'], d.weeks.map(w => [esc(w.start), w.created, w.done, w.late, w.attendanceRate + '%', w.lateDays ?? 0]))}
  <h2>المصروفات حسب الشهر (${cur})</h2>
  ${d.spendByMonth.length ? tbl(['الشهر', 'المبلغ'], d.spendByMonth.map(m => [esc(m.month), fmt(m.total)])) : '<p>لا توجد مصروفات معتمدة.</p>'}
  <h2>حسب القسم</h2>
  ${d.spendByDept.length ? tbl(['القسم', 'المبلغ'], d.spendByDept.map(x => [esc(x.department), fmt(x.total)])) : '<p>لا توجد بيانات.</p>'}
  <h2>أيام الإجازة هذه السنة</h2>
  ${d.leaveByType.length ? tbl(['النوع', 'الأيام'], d.leaveByType.map(x => [esc(x.name), x.days])) : '<p>لا توجد إجازات معتمدة.</p>'}
  </body></html>`;
}

export default function AnalyticsPage() {
  const { me, error } = useMe();
  const [weeks, setWeeks] = useState(12);
  const [d, setD] = useState(null);
  const [toast, toastNode] = useToast();
  useEffect(() => {
    if (!me) return;
    setD(null);
    api('GET', '/api/analytics?weeks=' + weeks).then(setD).catch(e => { if (e.message !== 'unauthorized') toast(e.message, 'err'); });
  }, [me, weeks, toast]);

  function pdf() {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open(); doc.write(reportHTML(d, weeks, me)); doc.close();
    setTimeout(() => {
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { toast('تعذّرت الطباعة من هذا المتصفح', 'err'); }
      setTimeout(() => fr.remove(), 120000);
    }, 350);
    toast('في نافذة الطباعة اختر الوجهة «حفظ بصيغة PDF»', 'info');
  }

  let body = null;
  if (d) {
    const wl = d.weeks.map(w => w.start.slice(5));
    const totalDone = d.weeks.reduce((s, w) => s + w.done, 0), totalCreated = d.weeks.reduce((s, w) => s + w.created, 0);
    const lateTotal = d.weeks.reduce((s, w) => s + w.late, 0);
    const avgAtt = d.weeks.length ? Math.round(d.weeks.reduce((s, w) => s + w.attendanceRate, 0) / d.weeks.length) : 0;
    const last4 = d.weeks.slice(-4).reduce((s, w) => s + w.done, 0), prev4 = d.weeks.slice(-8, -4).reduce((s, w) => s + w.done, 0);
    const trend = prev4 ? Math.round(((last4 - prev4) / prev4) * 100) : null;
    const maxDept = Math.max(1, ...d.spendByDept.map(x => x.total));
    body = (
      <>
        <div className="grid kpis">
          <div className="card kpi"><span className="kpi-ico"><Icon name="tasks" /></span><div><small>مهام منجزة</small><b>{totalDone}</b><span className="sub">من {totalCreated} أُنشئت</span></div></div>
          <div className={`card kpi ${trend != null && trend < 0 ? 'warn' : 'ok'}`}><span className="kpi-ico"><Icon name="reports" /></span>
            <div><small>اتجاه آخر 4 أسابيع</small><b>{trend == null ? '—' : (trend > 0 ? '+' : '') + trend + '%'}</b><span className="sub">مقارنة بالأسابيع الأربعة قبلها</span></div></div>
          <div className={`card kpi ${lateTotal ? 'warn' : 'ok'}`}><span className="kpi-ico"><Icon name="audit" /></span><div><small>أُنجزت بعد موعدها</small><b>{lateTotal}</b></div></div>
          <div className="card kpi"><span className="kpi-ico"><Icon name="attendance" /></span><div><small>متوسط الحضور</small><b>{avgAtt}%</b></div></div>
        </div>
        <div className="grid two">
          <section className="card"><h3>إنجاز المهام عبر الأسابيع</h3>
            <ChartLine points={wl} series={[
              { name: 'منجزة', values: d.weeks.map(w => w.done), color: 'var(--ok)', area: true },
              { name: 'أُنشئت', values: d.weeks.map(w => w.created), color: 'var(--accent)' },
              { name: 'بعد الموعد', values: d.weeks.map(w => w.late), color: 'var(--bad)' }]} /></section>
          <section className="card"><h3>نسبة الحضور أسبوعياً</h3>
            <ChartBars items={d.weeks.map((w, i) => ({ label: wl[i], value: w.attendanceRate }))} color="var(--teal)" fmtV={v => v + '%'} /></section>
        </div>
        <div className="grid two">
          <section className="card"><h3>مصروفات معتمدة حسب الشهر ({me.org.currency})</h3>
            <ChartBars items={d.spendByMonth.map(m => ({ label: m.month.slice(5), value: Math.round(m.total) }))} color="var(--violet)" fmtV={v => fmt(v)} /></section>
          <section className="card">
            <h3>مصروفات حسب القسم</h3>
            {d.spendByDept.length
              ? d.spendByDept.map(x => (
                <div className="hbar" key={x.department}><span>{x.department}</span><div className="bar"><i style={{ width: `${Math.round(x.total / maxDept * 100)}%` }} /></div><b style={{ fontSize: '.74rem' }}>{fmt(x.total)}</b></div>))
              : <p className="muted">لا توجد مصروفات معتمدة.</p>}
            <h3 style={{ marginTop: 18 }}>أيام الإجازة هذه السنة</h3>
            {d.leaveByType.length
              ? d.leaveByType.map(x => (
                <div className="hbar" key={x.name}><span>{x.name}</span><div className="bar"><i style={{ width: `${Math.min(100, x.days)}%` }} /></div><b>{x.days}</b></div>))
              : <p className="muted">لا توجد إجازات معتمدة.</p>}
          </section>
        </div>
      </>
    );
  }

  return (
    <AppShell active="analytics" title="التحليلات" sub="اتجاهات الإنجاز والحضور والمصروفات" me={me}>
      {error && <div className="notice">{error}</div>}
      <div className="toolbar">
        <span className="grow muted">{d ? `اتجاهات أداء نطاقك (${d.people} شخصاً).` : ''}</span>
        <select className="input" style={{ width: 'auto' }} value={weeks} onChange={e => setWeeks(+e.target.value)}>
          {[8, 12, 26].map(n => <option key={n} value={n}>آخر {n} أسبوع</option>)}
        </select>
        <button type="button" className="btn" onClick={pdf} disabled={!d}><Icon name="reports" /> تصدير PDF</button>
      </div>
      {body}
      {toastNode}
    </AppShell>
  );
}
