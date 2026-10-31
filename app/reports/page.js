'use client';
/* التقارير — ترحيل React لـ viewReports (modules.js) مع تصدير CSV. */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ROLE } from '../../lib/constants';
import { fmt, todayStr } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar } from '../../components/ui';
import { useToast } from '../../components/hooks';

export default function ReportsPage() {
  const { me, error } = useMe();
  const t0 = todayStr();
  const [range, setRange] = useState({ from: t0.slice(0, 8) + '01', to: t0 });
  const [draft, setDraft] = useState(range);
  const [r, setR] = useState(null);
  const [toast, toastNode] = useToast();

  useEffect(() => {
    if (!me) return;
    setR(null);
    api('GET', `/api/reports/performance?from=${range.from}&to=${range.to}`).then(setR).catch(e => { if (e.message !== 'unauthorized') toast(e.message, 'err'); });
  }, [me, range, toast]);

  const rows = r ? r.rows : [];
  const sum = k => rows.reduce((s, x) => s + (x[k] || 0), 0);
  const maxDone = Math.max(1, ...rows.map(x => x.tasksDone));
  const cur = (me && me.org.currency) || '';

  function apply() {
    if (draft.from && draft.to && draft.from <= draft.to) setRange(draft); else toast('الفترة غير صالحة', 'err');
  }
  function csv() {
    const head = ['الاسم', 'الدور', 'القسم', 'مهام منجزة', 'مهام مفتوحة', 'متأخرة', 'متوسط أيام الإنجاز', 'نسبة بالموعد %', 'طلبات', 'مصروف معتمد', 'أيام إجازة', 'أيام حضور'];
    const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(',')].concat(rows.map(x => [x.name, ROLE[x.role], x.department, x.tasksDone, x.tasksOpen, x.tasksOverdue,
      x.avgDaysToDone, x.onTimeRate, x.requests, x.approvedSpend, x.leaveDays, x.attendanceDays].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `performance-${r.from}_${r.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const kpi = (l, v, sub) => <div className="card kpi"><small>{l}</small><b>{v}</b><span className="sub">{sub}</span></div>;

  return (
    <AppShell active="reports" title="التقارير" sub="أداء الفريق لفترة محددة" me={me}>
      {error && <div className="notice">{error}</div>}
      <div className="toolbar">
        <label className="muted small">من <input className="input" type="date" style={{ width: 'auto' }} value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="muted small">إلى <input className="input" type="date" style={{ width: 'auto' }} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <button className="btn ghost" onClick={apply}>عرض</button>
        <span className="grow" />
        <button className="btn" onClick={csv} disabled={!r}>تصدير CSV</button>
      </div>
      {r && (
        <>
          <div className="grid kpis">
            {kpi('مهام منجزة', sum('tasksDone'), `${sum('tasksOpen')} مفتوحة`)}
            {kpi('مهام متأخرة', sum('tasksOverdue'), 'حالياً')}
            {kpi('مصروفات معتمدة', `${fmt(sum('approvedSpend'))} ${cur}`, `${sum('requests')} طلب`)}
            {kpi('أيام إجازة معتمدة', sum('leaveDays'), `${sum('attendanceDays')} يوم حضور`)}
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>المهام المنجزة حسب الشخص</h3>
            {rows.length
              ? rows.slice().sort((a, b) => b.tasksDone - a.tasksDone).map(x => (
                <div className="hbar" key={x.name}><span>{x.name}</span><div className="bar"><i style={{ width: `${Math.round(x.tasksDone / maxDone * 100)}%` }} /></div><b>{x.tasksDone}</b></div>))
              : <p className="muted">لا توجد بيانات.</p>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الاسم</th><th>القسم</th><th>منجزة</th><th>مفتوحة</th><th>متأخرة</th><th>متوسط الإنجاز (يوم)</th><th>بالموعد</th><th>طلبات</th><th>مصروف معتمد</th><th>إجازة</th><th>حضور</th></tr></thead>
              <tbody>
                {rows.map(x => (
                  <tr key={x.name}>
                    <td><span className="who"><Avatar name={x.name} size={24} />{x.name}</span> <small className="muted">{ROLE[x.role]}</small></td>
                    <td>{x.department || '—'}</td><td>{x.tasksDone}</td><td>{x.tasksOpen}</td>
                    <td>{x.tasksOverdue ? <span className="badge overdue">{x.tasksOverdue}</span> : 0}</td>
                    <td>{x.avgDaysToDone ?? '—'}</td><td>{x.onTimeRate == null ? '—' : x.onTimeRate + '%'}</td>
                    <td>{x.requests}</td><td>{fmt(x.approvedSpend)}</td><td>{x.leaveDays}</td><td>{x.attendanceDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {toastNode}
    </AppShell>
  );
}
