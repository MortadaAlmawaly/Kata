'use client';
/* الهيكل والفريق — ترحيل React لـ viewTeam/personProfile/userForm/accessModal. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OrgFlow from '../../components/OrgFlow';
import PermPicker from '../../components/PermPicker';
import { api } from '../../lib/api';
import { LEVEL_ORDER, ROLE } from '../../lib/constants';
import { dueInfo, STATUS, todayStr } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, Modal } from '../../components/ui';
import { Ring } from '../../components/charts';
import { ago, useConfirm, useToast } from '../../components/hooks';

const LV = LEVEL_ORDER;

export default function TeamPage() {
  const { me, error } = useMe();
  const [users, setUsers] = useState(null);
  const [view, setView] = useState('chart');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [profileId, setProfileId] = useState(null);
  const [form, setForm] = useState(null);       // { user|null, managerId? }
  const [secret, setSecret] = useState(null);
  const [toast, toastNode] = useToast();
  /* تخطيط الهيكل المرئي (مواضع البطاقات وجهة ربط كل شخص) — يُحفظ بالشركة */
  const [layout, setLayout] = useState({ pos: {}, side: {}, colors: {}, wire: '' });
  const [pending, setPending] = useState(null);     // موظف أُضيف للتو من زر «+» بجهة معيّنة وينتظر وضعه
  const saveTimer = useRef(null);
  const onLayout = next => {
    setLayout(next);
    if (!manage) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api('PUT', '/api/org/layout', next).catch(e => toast(e.message, 'err')), 600);
  };
  useEffect(() => { if (me) api('GET', '/api/org/layout').then(l => setLayout({ pos: l.pos || {}, side: l.side || {}, colors: l.colors || {}, wire: l.wire || '' })).catch(() => {}); }, [me]);

  useEffect(() => { try { const v = localStorage.getItem('rb-teamview'); if (['chart', 'cards', 'list'].includes(v)) setView(v); } catch (_) { /* لا تخزين */ } }, []);
  const pickView = v => { setView(v); try { localStorage.setItem('rb-teamview', v); } catch (_) { /* تجاهل */ } };

  const load = useCallback(async () => {
    try { setUsers(await api('GET', '/api/users')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  const perms = (me && me.perms) || [];
  const isAdmin = perms.includes('admin');
  const manage = isAdmin || perms.includes('users.manage');
  const invite = isAdmin || perms.includes('users.invite');
  const myLevel = me ? (isAdmin ? 5 : me.level) : 1;

  const U = users || [];
  const byId = useMemo(() => new Map(U.map(u => [u.id, u])), [U]);
  const byMgr = useMemo(() => {
    const m = new Map();
    const ids = new Set(U.map(u => u.id));
    U.forEach(u => { const k = ids.has(u.managerId) ? u.managerId : 0; if (!m.has(k)) m.set(k, []); m.get(k).push(u); });
    m.forEach(a => a.sort((x, y) => LV[y.role] - LV[x.role] || x.name.localeCompare(y.name, 'ar')));
    return m;
  }, [U]);
  const kidsOf = useCallback(id => byMgr.get(id) || [], [byMgr]);
  const descCount = id => (byMgr.get(id) || []).reduce((s, k) => s + 1 + descCount(k.id), 0);
  const depts = [...new Set(U.map(u => u.department).filter(Boolean))].sort();
  const roles = Object.keys(LV).sort((a, b) => LV[b] - LV[a]).filter(r => U.some(u => u.role === r));
  const filtering = !!(q.trim() || role || dept);
  const matches = u => {
    const s = q.trim().toLowerCase();
    return (!role || u.role === role) && (!dept || u.department === dept) && (!s || [u.name, u.title, u.department, u.email].some(x => (x || '').toLowerCase().includes(s)));
  };
  const canAddUnder = p => manage && p.active && LV[p.role] >= 2 && (isAdmin || p.inScope);
  const toggle = id => setCollapsed(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const list = U.filter(matches);
  let body = null;
  if (users) {
    if (view === 'chart') {
      const roots = byMgr.get(0) || [];
      body = roots.length ? (
        <OrgFlow roots={roots} kidsOf={kidsOf} collapsed={collapsed} onToggle={toggle} descCount={descCount} matches={matches} filtering={filtering}
          canAddUnder={canAddUnder} canEdit={manage} layout={layout} onLayout={onLayout} onOpen={u => setProfileId(u.id)} meId={me.user.id}
          onAdd={(u, side) => setForm({ user: null, managerId: u.id, side })} pending={pending} onPendingDone={() => setPending(null)} />
      ) : <div className="empty-box"><span className="ico"><Icon name="team" /></span><p>لا يوجد أشخاص لعرضهم.</p></div>;
    } else if (!list.length) {
      body = <div className="empty-box"><span className="ico"><Icon name="team" /></span><p>لا يوجد من يطابق البحث.</p></div>;
    } else if (view === 'cards') {
      const groups = new Map();
      list.forEach(u => { const k = u.department || 'بدون قسم'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); });
      body = [...groups.entries()].map(([d, arr]) => (
        <div key={d}>
          <div className="dept-title">{d} <span className="n">{arr.length}</span></div>
          <div className="people-grid">
            {arr.sort((a, b) => LV[b.role] - LV[a.role]).map(u => (
              <article className={`pcard lv-${LV[u.role]} ${u.active ? '' : 'off'}`} key={u.id} onClick={() => setProfileId(u.id)}>
                <Avatar name={u.name} /><b>{u.name}</b>
                <span className="muted small">{u.title || ''}</span>
                <span className="badge role">{ROLE[u.role]}</span>
                <span className="muted small" style={{ marginTop: 4 }}>{(byMgr.get(u.id) || []).length ? (byMgr.get(u.id) || []).length + ' يتبعونه' : ' '}</span>
              </article>
            ))}
          </div>
        </div>
      ));
    } else {
      body = (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>الدور</th><th>القسم</th><th>الرئيس المباشر</th><th>آخر دخول</th><th>الحالة</th></tr></thead>
            <tbody>
              {list.slice().sort((a, b) => LV[b.role] - LV[a.role] || a.name.localeCompare(b.name, 'ar')).map(u => {
                const m = byId.get(u.managerId);
                return (
                  <tr key={u.id} className="click" onClick={() => setProfileId(u.id)}>
                    <td><span className="who"><Avatar name={u.name} size={28} /><span>{u.name}<br /><small className="muted">{u.title || ''}</small></span></span></td>
                    <td><span className="badge role">{ROLE[u.role]}</span></td><td>{u.department || '—'}</td>
                    <td>{m ? m.name : <span className="muted">—</span>}</td>
                    <td>{u.lastLoginAt ? ago(u.lastLoginAt) : <span className="muted">—</span>}</td>
                    <td>{u.active ? <span className="badge DONE">فعّال</span> : <span className="badge REJECTED">معطّل</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <AppShell active="team" title="الهيكل والفريق" sub="الهرم الوظيفي ومن تحتك" me={me}>
      {error && <div className="notice">{error}</div>}
      {users && (
        <div className="org-stats">
          <button className={`tab-pill ${!role ? 'active' : ''}`} onClick={() => setRole('')}>الكل <span className="n">{U.length}</span></button>
          {roles.map(r => <button key={r} className={`tab-pill ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{ROLE[r]} <span className="n">{U.filter(u => u.role === r).length}</span></button>)}
        </div>
      )}
      <div className="toolbar">
        <label className="search-field"><Icon name="search" />
          <input className="input" placeholder="ابحث بالاسم أو المسمى أو القسم…" value={q} autoComplete="off" onChange={e => setQ(e.target.value)} /></label>
        {depts.length > 0 && (
          <select className="input" style={{ width: 'auto' }} value={dept} onChange={e => setDept(e.target.value)}>
            <option value="">كل الأقسام</option>{depts.map(d => <option key={d}>{d}</option>)}
          </select>
        )}
        <span className="grow" />
        <span className="muted small">{U.filter(u => u.active).length} فعّال</span>
        <div className="seg" role="group" aria-label="طريقة العرض">
          <button className={view === 'chart' ? 'active' : ''} title="هيكل مرئي" onClick={() => pickView('chart')}><Icon name="team" size={17} /></button>
          <button className={view === 'cards' ? 'active' : ''} title="بطاقات" onClick={() => pickView('cards')}><Icon name="projects" size={17} /></button>
          <button className={view === 'list' ? 'active' : ''} title="قائمة" onClick={() => pickView('list')}><Icon name="menu" size={17} /></button>
        </div>
        {invite && <a className="btn ghost" href="/settings?tab=invites">دعوة بالرابط</a>}
        {manage && <button className="btn" onClick={() => setForm({ user: null })}><Icon name="plus" /> إضافة مستخدم</button>}
      </div>
      {body}

      {profileId && byId.get(profileId) && (
        <Profile u={byId.get(profileId)} me={me} byId={byId} reports={(byMgr.get(profileId) || []).filter(x => x.active)}
          canAdd={canAddUnder(byId.get(profileId))} isAdmin={isAdmin}
          onOpen={setProfileId} onClose={() => setProfileId(null)} onToast={toast}
          onEdit={u => { setProfileId(null); setForm({ user: u }); }}
          onAdd={u => { setProfileId(null); setForm({ user: null, managerId: u.id }); }}
          onSecret={s => { setProfileId(null); setSecret(s); }} />
      )}
      {form && <UserForm me={me} users={U} user={form.user} presetMgr={form.managerId ? byId.get(form.managerId) : null} myLevel={myLevel} isAdmin={isAdmin}
        onClose={() => setForm(null)}
        onSaved={r => { const f = form; setForm(null); load(); if (f && f.side && f.managerId && r && r.id) setPending({ id: r.id, managerId: f.managerId, side: f.side }); if (r && r.tempPassword) setSecret({ title: 'تم إنشاء الحساب — كلمة المرور المؤقتة', value: r.tempPassword }); else toast('تم التحديث'); }} />}
      {secret && (
        <Modal title={secret.title} onClose={() => setSecret(null)} actions={<button className="btn" onClick={() => setSecret(null)}>تم</button>}>
          <p className="notice">انسخها الآن وسلّمها للمستخدم — لن تظهر مرة ثانية، وسيُطلب منه تغييرها عند أول دخول.</p>
          <div className="secret">{secret.value}</div>
        </Modal>
      )}
      {toastNode}
    </AppShell>
  );
}

function Profile({ u, me, byId, reports, canAdd, isAdmin, onOpen, onClose, onEdit, onAdd, onSecret, onToast }) {
  const [tasks, setTasks] = useState([]);
  const [goals, setGoals] = useState([]);
  const [access, setAccess] = useState(null);
  const [ask, confirmNode] = useConfirm();
  useEffect(() => {
    if (!u.inScope) return;
    Promise.all([api('GET', '/api/tasks?scope=all'), api('GET', '/api/goals')]).then(([t, g]) => {
      setTasks(t.filter(x => x.assignee && x.assignee.id === u.id));
      setGoals(g.filter(x => x.owner.id === u.id));
    }).catch(() => {});
  }, [u.id, u.inScope]);

  const chain = [];
  { const seen = new Set([u.id]); let c = u; while (c && c.managerId && !seen.has(c.managerId)) { seen.add(c.managerId); c = byId.get(c.managerId); if (c) chain.unshift(c); } }
  const open = tasks.filter(t => t.status !== 'DONE');
  const overdue = open.filter(t => t.dueDate && t.dueDate < todayStr());
  const gAvg = goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : null;

  async function openAccess() {
    try { const d = await api('GET', '/api/admin/permissions'); setAccess({ d, u: d.users.find(x => x.id === u.id) }); } catch (e) { onToast(e.message, 'err'); }
  }
  return (
    <Modal title={u.name} wide onClose={onClose}
      actions={(
        <>
          {canAdd && <button type="button" className="btn" onClick={() => onAdd(u)}>+ إضافة موظف تحته</button>}
          {u.canManage && <button type="button" className="btn ghost" onClick={() => onEdit(u)}>تعديل</button>}
          {u.canManage && <button type="button" className="btn ghost" onClick={() => ask({ title: 'إعادة تعيين كلمة المرور',
            text: 'سيتم إنهاء جلسات المستخدم وإنشاء كلمة مرور مؤقتة جديدة.', ok: 'متابعة', danger: false,
            onOk: async () => { const r = await api('POST', `/api/users/${u.id}/reset-password`, {}); onSecret({ title: 'كلمة المرور المؤقتة', value: r.tempPassword }); } })}>كلمة مرور</button>}
          {u.canManage && isAdmin && <button type="button" className="btn ghost" onClick={openAccess}>الصلاحيات</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '6px 0 10px' }}>
        <Avatar name={u.name} size={56} />
        <div>
          <div className="chips"><span className="badge role">{ROLE[u.role]}</span>{!u.active && <span className="badge role">معطّل</span>}{u.id === me.user.id && <span className="badge role">أنت</span>}</div>
          <h3 style={{ margin: '4px 0' }}>{u.name}</h3>
          <div className="muted small">{u.title || ROLE[u.role]}{u.department ? ' · ' + u.department : ''}</div>
        </div>
      </div>
      <div className="facts">
        {u.email && <div className="fact" style={{ gridColumn: '1 / -1' }}><small>البريد</small><b dir="ltr" style={{ display: 'block', textAlign: 'right', overflowWrap: 'anywhere' }}><a href={`mailto:${u.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{u.email}</a></b></div>}
        <div className="fact"><small>الفريق المباشر</small><b className="big">{reports.length}</b></div>
        {u.lastLoginAt && <div className="fact"><small>آخر دخول</small><b>{ago(u.lastLoginAt)}</b></div>}
        <div className="fact"><small>المستوى</small><b>{LV[u.role]} من 5</b></div>
        {u.leaveEntitlement != null && <div className="fact"><small>رصيد الإجازة السنوي</small><b className="big">{u.leaveEntitlement}<span className="muted small"> يوم</span></b></div>}
      </div>
      {chain.length > 0 && (
        <>
          <h3 className="section-title">خط الإبلاغ</h3>
          <div className="pills">
            {chain.map(c => <span key={c.id}><button type="button" className="pill" onClick={() => onOpen(c.id)}><Avatar name={c.name} size={20} />{c.name}</button><span className="sep"> ‹ </span></span>)}
            <span className="pill me"><Avatar name={u.name} size={20} />{u.name}</span>
          </div>
        </>
      )}
      {u.inScope && (
        <>
          <h3 className="section-title">أداؤه</h3>
          <div className="facts">
            <div className="fact"><small>مهام مفتوحة</small><b className="big">{open.length}</b></div>
            <div className="fact"><small>متأخرة</small><b className="big" style={{ color: overdue.length ? 'var(--bad)' : 'var(--ok)' }}>{overdue.length}</b></div>
            <div className="fact"><small>منجزة</small><b className="big">{tasks.length - open.length}</b></div>
            <div className="fact"><small>تقدّم الأهداف</small><b className="big">{gAvg == null ? '—' : gAvg + '%'}</b></div>
          </div>
          {open.length > 0 && (
            <>
              <h3 className="section-title">مهامه المفتوحة</h3>
              {open.slice(0, 5).map(t => {
                const d = dueInfo(t);
                return (
                  <a className="li-row" key={t.id} href={`/tasks?open=${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="grow"><b>{t.title}</b></div>
                    {d && <span className={`due ${d.cls}`}>{d.text}</span>}<span className={`badge ${t.status}`}>{STATUS[t.status]}</span>
                  </a>
                );
              })}
            </>
          )}
          {goals.length > 0 && (
            <>
              <h3 className="section-title">أهدافه</h3>
              {goals.slice(0, 4).map(g => (
                <a className="li-row" key={g.id} href="/goals" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Ring pct={g.progress} size={40} stroke={5} />
                  <div className="grow"><b>{g.title}</b><small className="muted">{g.period}</small></div>
                </a>
              ))}
            </>
          )}
        </>
      )}
      {reports.length > 0 && (
        <>
          <h3 className="section-title">يتبعه مباشرة ({reports.length})</h3>
          <div className="pills">{reports.map(r => <button type="button" className="pill" key={r.id} onClick={() => onOpen(r.id)}><Avatar name={r.name} size={20} />{r.name}</button>)}</div>
        </>
      )}
      {access && <AccessModal d={access.d} u={access.u} onClose={() => setAccess(null)} onToast={onToast} />}
      {confirmNode}
    </Modal>
  );
}

function AccessModal({ d, u, onClose, onToast }) {
  const [extra, setExtra] = useState(() => new Set(u.extraPerms));
  const [denied, setDenied] = useState(() => new Set(u.deniedPerms || []));
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { await api('PUT', `/api/admin/users/${u.id}/access`, { extraPerms: [...extra], deniedPerms: [...denied] }); onToast('تم الحفظ'); onClose(); } catch (ex) { setErr(ex.message); }
  }
  return (
    <Modal title={'صلاحيات ' + u.name} onClose={onClose}>
      <form onSubmit={submit}>
        <PermPicker catalog={d.catalog} extra={extra} denied={denied} setExtra={setExtra} setDenied={setDenied} />
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function UserForm({ me, users, user: u, presetMgr, myLevel, isAdmin, onClose, onSaved }) {
  const roles = Object.keys(LV).filter(r => r !== 'CEO' && LV[r] < myLevel && (!presetMgr || LV[r] < LV[presetMgr.role]));
  const defLeave = u && u.leaveEntitlement != null ? u.leaveEntitlement : ((me.org.settings && me.org.settings.leaveDefault) ?? 30);
  const [f, setF] = useState({
    name: u ? u.name : '', email: '', title: u ? u.title || '' : '', department: u ? u.department || '' : '',
    role: u && roles.includes(u.role) ? u.role : roles[0] || 'EMPLOYEE', managerId: u ? u.managerId : presetMgr ? presetMgr.id : '',
    leave: defLeave, shiftStart: u ? u.shiftStart || '' : '', shiftEnd: u ? u.shiftEnd || '' : '', active: u ? u.active : true,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const depts = [...new Set(users.map(x => x.department).filter(Boolean))].sort();
  const titles = [...new Set(users.map(x => x.title).filter(Boolean))].sort();
  const mgrs = users.filter(x => x.active && (isAdmin || x.inScope) && LV[x.role] > LV[f.role] && x.id !== (u && u.id));
  const mgrId = mgrs.some(x => x.id === Number(f.managerId)) ? Number(f.managerId) : (mgrs[0] ? mgrs[0].id : '');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!mgrId) { setErr('اختر الرئيس المباشر'); return; }
    const leaveEntitlement = Math.max(0, Math.min(365, Math.round(Number(f.leave))));
    setBusy(true);
    try {
      if (u) {
        await api('PATCH', '/api/users/' + u.id, { name: f.name, title: f.title || null, department: f.department || null, role: f.role,
          managerId: mgrId, active: f.active, leaveEntitlement, shiftStart: f.shiftStart || null, shiftEnd: f.shiftEnd || null });
        onSaved(null);
      } else {
        onSaved(await api('POST', '/api/users', { name: f.name, email: f.email, title: f.title || undefined, department: f.department || undefined,
          role: f.role, managerId: mgrId, leaveEntitlement, shiftStart: f.shiftStart || undefined, shiftEnd: f.shiftEnd || undefined }));
      }
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={u ? 'تعديل مستخدم' : presetMgr ? `إضافة موظف تحت ${presetMgr.name}` : 'إضافة مستخدم'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>الاسم</span><input value={f.name} maxLength={60} required onChange={set('name')} /></label>
        {!u && <label className="field"><span>البريد الإلكتروني</span><input type="email" value={f.email} maxLength={191} required style={{ direction: 'ltr', textAlign: 'right' }} onChange={set('email')} /></label>}
        <div className="row2">
          <label className="field"><span>المسمى الوظيفي (اكتب أي مسمى)</span><input list="dlTitles" value={f.title} maxLength={80} placeholder="مثال: مسؤول مبيعات" onChange={set('title')} /></label>
          <label className="field"><span>القسم (اكتب أي اسم)</span><input list="dlDepts" value={f.department} maxLength={60} placeholder="مثال: المبيعات" onChange={set('department')} /></label>
        </div>
        <datalist id="dlTitles">{titles.map(t => <option key={t} value={t} />)}</datalist>
        <datalist id="dlDepts">{depts.map(t => <option key={t} value={t} />)}</datalist>
        <div className="row2">
          <label className="field"><span>الدور</span><select value={f.role} onChange={set('role')}>{roles.map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
          <label className="field"><span>الرئيس المباشر</span>
            <select value={mgrId} onChange={set('managerId')}>
              {mgrs.length ? mgrs.map(x => <option key={x.id} value={x.id}>{x.name} — {ROLE[x.role]}</option>) : <option value="">لا يوجد رئيس مناسب</option>}
            </select></label>
        </div>
        <div className="row2">
          <label className="field"><span>رصيد الإجازة السنوي (أيام)</span><input type="number" min="0" max="365" step="1" value={f.leave} onChange={set('leave')} /></label>
          <span />
          <label className="field"><span>بداية الدوام (فارغ = دوام الشركة)</span><input type="time" value={f.shiftStart} onChange={set('shiftStart')} /></label>
          <label className="field"><span>نهاية الدوام</span><input type="time" value={f.shiftEnd} onChange={set('shiftEnd')} /></label>
        </div>
        {u && <label className="field"><span>الحالة</span>
          <select value={String(f.active)} onChange={e => setF({ ...f, active: e.target.value === 'true' })}>
            <option value="true">فعّال</option><option value="false">معطّل</option></select></label>}
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
