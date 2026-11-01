'use client';
/* الأهداف — ترحيل React لـ viewGoals/goalDetail/goalForm (views-pro.js، app.js). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { ROLE } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, MobileTabs, Modal } from '../../components/ui';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { useConfirm, useToast } from '../../components/hooks';
import { FIcon } from '../../components/Icon';

const GSTATUS = { ACTIVE: 'جارٍ', ACHIEVED: 'تحقق', CANCELLED: 'ملغى' };
const fmt = n => Number(n || 0).toLocaleString('en-US');
const krPct = k => (k.target > 0 ? Math.min(100, Math.round((k.current / k.target) * 100)) : 0);

function expectedPct(period) {
  const m = /^(\d{4})-(?:Q([1-4])|H([12])|FY)$/.exec(period || '');
  if (!m) return null;
  const y = +m[1];
  let s, e;
  if (m[2]) { s = new Date(y, (m[2] - 1) * 3, 1); e = new Date(y, m[2] * 3, 1); }
  else if (m[3]) { s = new Date(y, (m[3] - 1) * 6, 1); e = new Date(y, m[3] * 6, 1); }
  else { s = new Date(y, 0, 1); e = new Date(y + 1, 0, 1); }
  return Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100));
}
function goalHealth(g) {
  if (g.status === 'ACHIEVED') return { cls: 'done', text: <><FIcon n="check" size={13} /> تحقق</> };
  if (g.status === 'CANCELLED') return { cls: '', text: 'ملغى' };
  if (!g.keyResults.length) return { cls: '', text: 'بلا نتائج رئيسية' };
  const exp = expectedPct(g.period);
  if (exp == null) return { cls: '', text: 'جارٍ' };
  const gap = exp - g.progress;
  if (gap <= 10) return { cls: 'good', text: 'على المسار' };
  if (gap <= 30) return { cls: 'warn', text: 'متأخر عن الخطة' };
  return { cls: 'bad', text: 'يحتاج تدخّلاً' };
}

function Ring({ pct, size = 64, stroke = 7, color }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = color || (p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--accent)' : 'var(--warn)');
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="val" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <b style={{ fontSize: Math.max(10, Math.round(size * 0.26)) }}>{Math.round(p)}%</b>
    </span>
  );
}
const Bar = ({ p }) => <div className="bar"><i style={{ width: `${p}%` }} /></div>;

export default function GoalsPage() {
  const { me, error } = useMe();
  const [goals, setGoals] = useState(null);
  const [tab, setTab] = useState('mine');
  const [view, setView] = useState('cards');
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('');
  const [form, setForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [toast, toastNode] = useToast();

  const load = useCallback(async () => {
    try { setGoals(await api('GET', '/api/goals')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  const meId = me && me.user.id;
  const sets = useMemo(() => {
    const g = goals || [];
    return { mine: g.filter(x => x.owner.id === meId), team: g.filter(x => x.owner.id !== meId && x.editable), upper: g.filter(x => !x.editable), all: g };
  }, [goals, meId]);
  const tabs = [['mine', 'أهدافي'], ...(sets.team.length ? [['team', 'أهداف فريقي']] : []), ...(sets.upper.length ? [['upper', 'من الإدارة']] : []), ['all', 'الكل']];
  const curTab = tabs.some(t => t[0] === tab) ? tab : 'all';
  useEffect(() => {   // إن لم يكن لدي أهداف انتقل لتبويب فيه محتوى
    if (goals && tab === 'mine' && !sets.mine.length) setTab(sets.team.length ? 'team' : 'all');
  }, [goals]);   // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((goals || []).map(g => [g.id, g])), [goals]);
  const periods = [...new Set((goals || []).map(g => g.period))].sort().reverse();
  const list = sets[curTab].filter(g => {
    const s = q.trim().toLowerCase();
    return (!period || g.period === period) && (!s || g.title.toLowerCase().includes(s) || g.owner.name.toLowerCase().includes(s));
  });
  const active = list.filter(g => g.status === 'ACTIVE');
  const avg = active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0;
  const risk = active.filter(g => ['warn', 'bad'].includes(goalHealth(g).cls)).length;

  const kids = new Map();
  if (view === 'tree') {
    const ids = new Set(list.map(g => g.id));
    list.forEach(g => { const k = ids.has(g.parentId) ? g.parentId : 0; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(g); });
  }
  const node = g => {
    const h = goalHealth(g);
    return (
      <li key={g.id}>
        <div className="gnode" onClick={() => setDetailId(g.id)}>
          <Ring pct={g.progress} size={42} stroke={5} />
          <div className="grow"><b>{g.title}</b><small className="muted">{g.owner.name} · {g.period}</small></div>
          <span className={`health ${h.cls}`}>{h.text}</span>
        </div>
        {(kids.get(g.id) || []).length > 0 && <ul>{kids.get(g.id).map(node)}</ul>}
      </li>
    );
  };

  return (
    <AppShell active="goals" title="الأهداف" sub="أهداف بنتائج قابلة للقياس" me={me}>
      {error && <div className="notice">{error}</div>}
      {goals && (
        <div className="sum-strip">
          <div className="sum"><Ring pct={avg} size={54} stroke={6} /><div><b>{active.length}</b><small>أهداف جارية · متوسط التقدّم</small></div></div>
          <div className="sum"><span className="kpi-ico" style={{ background: 'color-mix(in srgb,var(--ok) 14%,transparent)', color: 'var(--ok)' }}><Icon name="goals" /></span>
            <div><b>{list.filter(g => g.status === 'ACHIEVED').length}</b><small>تحققت</small></div></div>
          <div className="sum"><span className="kpi-ico" style={{ background: 'color-mix(in srgb,var(--warn) 14%,transparent)', color: 'var(--warn)' }}><Icon name="audit" /></span>
            <div><b>{risk}</b><small>تحتاج متابعة</small></div></div>
          <div className="sum"><span className="kpi-ico"><Icon name="tasks" /></span>
            <div><b>{list.reduce((s, g) => s + g.keyResults.length, 0)}</b><small>نتيجة رئيسية</small></div></div>
        </div>
      )}
      <MobileTabs label="نوع الأهداف" value={curTab} onPick={setTab} tabs={tabs.map(([k, l]) => [k, `${l} (${sets[k].length})`])} />
      <div className="tabs-row m-hide-sm">
        {tabs.map(([k, l]) => <button key={k} className={`tab-pill ${curTab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l} <span className="n">{sets[k].length}</span></button>)}
      </div>
      <div className="toolbar">
        <label className="search-field"><Icon name="search" />
          <input className="input" placeholder="ابحث في الأهداف…" value={q} autoComplete="off" onChange={e => setQ(e.target.value)} /></label>
        {periods.length > 1 && (
          <select className="input" style={{ width: 'auto' }} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="">كل الفترات</option>{periods.map(p => <option key={p}>{p}</option>)}
          </select>
        )}
        <span className="grow" />
        <div className="seg" role="group" aria-label="طريقة العرض">
          <button className={view === 'cards' ? 'active' : ''} title="بطاقات" onClick={() => setView('cards')}><Icon name="projects" size={17} /></button>
          <button className={view === 'tree' ? 'active' : ''} title="المواءمة (شجرة)" onClick={() => setView('tree')}><Icon name="team" size={17} /></button>
        </div>
        <button className="btn" onClick={() => setForm(true)}><Icon name="plus" /> هدف جديد</button>
      </div>

      {goals && !list.length && (
        <div className="empty-box"><span className="ico"><Icon name="goals" /></span>
          <p>{goals.length ? 'لا توجد أهداف تطابق الفلتر.' : 'لا توجد أهداف بعد. ابدأ بهدف واحد بنتائج قابلة للقياس.'}</p>
          {!goals.length && <button className="btn" onClick={() => setForm(true)}>+ هدف جديد</button>}</div>
      )}
      {list.length > 0 && view === 'tree' && <ul className="gtree">{(kids.get(0) || []).map(node)}</ul>}
      {list.length > 0 && view === 'cards' && (
        <div className="goal-grid">
          {list.map(g => {
            const h = goalHealth(g), par = g.parentId ? byId.get(g.parentId) : null;
            return (
              <article className="card goal-card" key={g.id} onClick={() => setDetailId(g.id)}>
                <div className="top">
                  <Ring pct={g.progress} size={60} stroke={7} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{g.title}</h4>
                    <div className="owner"><Avatar name={g.owner.name} size={22} />{g.owner.name} · {g.period}</div>
                  </div>
                </div>
                <div><span className={`health ${h.cls}`}>{h.text}</span></div>
                {g.keyResults.length ? (
                  <div className="mini-kr">
                    {g.keyResults.slice(0, 3).map(k => (
                      <div className="r" key={k.id}><span>{k.title}</span><Bar p={krPct(k)} /><span className="pct">{krPct(k)}%</span></div>
                    ))}
                    {g.keyResults.length > 3 && <small className="muted">+{g.keyResults.length - 3} نتائج أخرى</small>}
                  </div>
                ) : <p className="muted small">لا توجد نتائج رئيسية بعد.</p>}
                {par && <div className="align"><Icon name="goals" /><span>يخدم: {par.title}</span></div>}
              </article>
            );
          })}
        </div>
      )}

      {form && <GoalForm me={me} goals={goals || []} onClose={() => setForm(false)} onError={m => toast(m, 'err')}
        onSaved={() => { setForm(false); toast('تم إنشاء الهدف'); load(); }} />}
      {detailId && <GoalDetail id={detailId} goals={goals || []} onOpen={setDetailId} onClose={() => setDetailId(null)}
        onChanged={load} onToast={toast} />}
      {toastNode}
    </AppShell>
  );
}

function GoalForm({ me, goals, onClose, onSaved, onError }) {
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  const [f, setF] = useState({ title: '', period: `${new Date().getFullYear()}-Q${q}`, ownerId: '', parentId: '' });
  const [krs, setKrs] = useState([{ t: '', v: '' }, { t: '', v: '' }, { t: '', v: '' }]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  const cascade = me.perms.includes('goals.cascade');
  useEffect(() => { if (cascade) api('GET', '/api/users').then(setUsers).catch(() => {}); }, [cascade]);
  const parents = goals.filter(g => g.status === 'ACTIVE');
  const setKr = (i, k, val) => setKrs(krs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const keyResults = krs.map(k => ({ title: k.t, target: Number(k.v) })).filter(k => k.title && k.title.trim());
    if (keyResults.find(k => !(k.target > 0))) { setErr('حدّد مستهدفاً رقمياً أكبر من صفر لكل نتيجة'); return; }
    setBusy(true);
    try {
      const gr = await api('POST', '/api/goals', {
        title: f.title, period: f.period, keyResults,
        ownerId: f.ownerId ? +f.ownerId : undefined, parentId: f.parentId ? +f.parentId : null,
      });
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('goal', gr.id, files.current.files);
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title="هدف جديد" wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>الهدف</span>
          <input value={f.title} maxLength={140} required placeholder="مثال: رفع رضا العملاء" onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>الفترة</span><input value={f.period} placeholder="2026-Q4" onChange={e => setF({ ...f, period: e.target.value })} /></label>
          {cascade && users.length > 1 && (
            <label className="field"><span>صاحب الهدف</span>
              <select value={f.ownerId} onChange={e => setF({ ...f, ownerId: e.target.value })}>
                <option value="">أنا</option>
                {users.filter(u => u.id !== me.user.id).map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>)}
              </select></label>
          )}
        </div>
        <label className="field"><span>يخدم هدفاً أعلى (اختياري)</span>
          <select value={f.parentId} onChange={e => setF({ ...f, parentId: e.target.value })}>
            <option value="">— بدون —</option>
            {parents.map(g => <option key={g.id} value={g.id}>{g.title} — {g.owner.name}</option>)}
          </select></label>
        <div className="field"><span>النتائج الرئيسية (قابلة للقياس)</span></div>
        {krs.map((k, i) => (
          <div className="row2" style={{ marginTop: 8 }} key={i}>
            <input className="input" maxLength={140} placeholder={`نتيجة رئيسية ${i + 1}`} value={k.t} onChange={e => setKr(i, 't', e.target.value)} />
            <input className="input" type="number" min="0" step="any" placeholder="المستهدف" value={k.v} onChange={e => setKr(i, 'v', e.target.value)} />
          </div>
        ))}
        <FilePicker label="مرفقات (اختياري)" inputRef={files} />
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function GoalDetail({ id, goals, onOpen, onClose, onChanged, onToast }) {
  const [tasks, setTasks] = useState([]);
  const [krForm, setKrForm] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const g = goals.find(x => x.id === id);
  useEffect(() => { api('GET', '/api/tasks?scope=all').then(setTasks).catch(() => {}); }, [id]);
  if (!g) return null;
  const byId = new Map(goals.map(x => [x.id, x]));
  const chain = [];
  { const seen = new Set([g.id]); let c = g; while (c.parentId && byId.has(c.parentId) && !seen.has(c.parentId)) { c = byId.get(c.parentId); seen.add(c.id); chain.unshift(c); } }
  const children = goals.filter(x => x.parentId === g.id);
  const linked = tasks.filter(t => t.goalId === g.id);
  const h = goalHealth(g), exp = expectedPct(g.period);
  const run = fn => async () => { try { await fn(); } catch (e) { onToast(e.message, 'err'); } };
  const saveKr = async (krId, val) => run(async () => { await api('PATCH', '/api/key-results/' + krId, { current: Math.max(0, Number(val) || 0) }); onChanged(); })();
  const setStatus = status => run(async () => { await api('PATCH', '/api/goals/' + id, { status }); if (status === 'ACHIEVED') onToast('مبروك! تحقق الهدف'); onChanged(); })();

  return (
    <Modal title={g.title} wide onClose={onClose}
      actions={(
        <>
          {g.editable && (g.status === 'ACTIVE'
            ? <button type="button" className="btn ok" onClick={() => setStatus('ACHIEVED')}>تحقق الهدف <FIcon n="check" size={14} /></button>
            : <button type="button" className="btn ghost" onClick={() => setStatus('ACTIVE')}>إعادة فتح</button>)}
          {g.editable && <button type="button" className="btn danger" onClick={() => ask({ title: 'حذف الهدف', text: 'سيتم حذف الهدف ونتائجه الرئيسية.', ok: 'حذف',
            onOk: async () => { await api('DELETE', '/api/goals/' + id); onChanged(); onClose(); } })}>حذف</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '6px 0 10px' }}>
        <Ring pct={g.progress} size={84} stroke={9} />
        <div>
          <div className="chips"><span className="badge role">{g.period}</span><span className="badge role">{GSTATUS[g.status]}</span><span className="badge role">{h.text}</span></div>
          <div className="muted small" style={{ marginTop: 6 }}>{g.owner.name} · {ROLE[g.owner.role]}{exp != null ? ` · الزمن المنقضي ${Math.round(exp)}%` : ''}</div>
        </div>
      </div>
      {g.description && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}>{g.description}</p>}
      {chain.length > 0 && (
        <>
          <h3 className="section-title">يخدم</h3>
          <div className="pills">
            {chain.map(c => <span key={c.id}><button type="button" className="pill" onClick={() => onOpen(c.id)}>{c.title}</button><span className="sep"> ‹ </span></span>)}
            <span className="pill me">{g.title}</span>
          </div>
        </>
      )}

      <h3 className="section-title">النتائج الرئيسية ({g.keyResults.length})</h3>
      {g.keyResults.map(k => {
        const step = k.target >= 100 ? Math.max(1, Math.round(k.target / 50)) : 1;
        return (
          <div className="kr-big" key={k.id}>
            <div className="head"><span>{k.title}</span><span className="pct">{krPct(k)}%</span></div>
            <Bar p={krPct(k)} />
            {g.editable ? (
              <div className="stepper">
                <button type="button" aria-label="إنقاص" onClick={() => saveKr(k.id, k.current - step)}>−</button>
                <input type="number" min="0" step="any" defaultValue={k.current} key={k.current}
                  onBlur={e => { if (Number(e.target.value) !== k.current) saveKr(k.id, e.target.value); }} />
                <button type="button" aria-label="زيادة" onClick={() => saveKr(k.id, k.current + step)}>+</button>
                <span className="of">من {fmt(k.target)} {k.unit || ''}</span>
              </div>
            ) : <div className="muted small" style={{ marginTop: 8 }}>{fmt(k.current)} من {fmt(k.target)} {k.unit || ''}</div>}
          </div>
        );
      })}
      {!g.keyResults.length && <p className="muted">لا توجد نتائج رئيسية بعد.</p>}
      {g.editable && <button type="button" className="btn ghost sm" onClick={() => setKrForm(true)}>+ نتيجة رئيسية</button>}

      {children.length > 0 && (
        <>
          <h3 className="section-title">أهداف تخدم هذا الهدف ({children.length})</h3>
          {children.map(c => (
            <div className="li-row" key={c.id} onClick={() => onOpen(c.id)}>
              <Ring pct={c.progress} size={40} stroke={5} />
              <div className="grow"><b>{c.title}</b><small className="muted">{c.owner.name}</small></div>
            </div>
          ))}
        </>
      )}

      <FilesBlock entity="goal" id={g.id} onError={m => onToast(m, 'err')} />

      <h3 className="section-title">المهام المرتبطة ({linked.length})</h3>
      {linked.map(t => (
        <div className="li-row" key={t.id}>
          <div className="grow"><b>{t.title}</b><small className="muted">{t.assignee ? t.assignee.name : ''}</small></div>
          <span className={`badge ${t.status}`}>{t.status}</span>
        </div>
      ))}
      {!linked.length && <p className="muted small">لا توجد مهام مرتبطة بهذا الهدف.</p>}

      {krForm && <KrForm goalId={id} onClose={() => setKrForm(false)} onSaved={() => { setKrForm(false); onChanged(); }} />}
      {confirmNode}
    </Modal>
  );
}

function KrForm({ goalId, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', target: '', unit: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { await api('POST', `/api/goals/${goalId}/key-results`, { title: f.title, target: Number(f.target), unit: f.unit || null }); onSaved(); } catch (ex) { setErr(ex.message); }
  }
  return (
    <Modal title="نتيجة رئيسية جديدة" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>العنوان</span><input value={f.title} maxLength={140} required onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>المستهدف</span><input type="number" min="0" step="any" value={f.target} required onChange={e => setF({ ...f, target: e.target.value })} /></label>
          <label className="field"><span>الوحدة (اختياري)</span><input value={f.unit} maxLength={16} onChange={e => setF({ ...f, unit: e.target.value })} /></label>
        </div>
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn">إضافة</button>
        </div>
      </form>
    </Modal>
  );
}
