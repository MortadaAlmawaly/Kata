'use client';
/* المشاريع — ترحيل React لـ viewProjects/projectForm/projectDetail (views-pro.js). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { ROLE } from '../../lib/constants';
import { dueInfo, PSTATUS, STATUS } from '../../lib/util';
import AppShell, { useMe } from '../../components/AppShell';
import { Avatar, Icon, MobileTabs, Modal } from '../../components/ui';
import { Ring } from '../../components/charts';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { ago, useConfirm, useToast } from '../../components/hooks';

const PSTATUS_BADGE = { PLANNING: 'TODO', ACTIVE: 'IN_PROGRESS', ON_HOLD: 'PENDING', DONE: 'DONE' };

export default function ProjectsPage() {
  const { me, error } = useMe();
  const [list, setList] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);       // { project|null }
  const [detailId, setDetailId] = useState(null);
  const [toast, toastNode] = useToast();
  const canCreate = !!(me && me.perms.includes('projects.manage'));

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/projects')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  const all = list || [];
  const s = q.trim().toLowerCase();
  const rows = all.filter(p => (!status || p.status === status) && (!s || p.name.toLowerCase().includes(s) || p.owner.name.toLowerCase().includes(s)));

  return (
    <AppShell active="projects" title="المساحات" sub="مساحات العمل وتقدّمها ومهامها" me={me}>
      {error && <div className="notice">{error}</div>}
      <MobileTabs label="حالة المساحة" value={status || '__all'} onPick={k => setStatus(k === '__all' ? '' : k)}
        tabs={[['__all', `الكل (${all.length})`], ...Object.entries(PSTATUS).map(([k, l]) => [k, `${l} (${all.filter(p => p.status === k).length})`])]} />
      <div className="tabs-row m-hide-sm">
        <button className={`tab-pill ${!status ? 'active' : ''}`} onClick={() => setStatus('')}>الكل <span className="n">{all.length}</span></button>
        {Object.entries(PSTATUS).map(([k, l]) => (
          <button key={k} className={`tab-pill ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l} <span className="n">{all.filter(p => p.status === k).length}</span></button>
        ))}
      </div>
      <div className="toolbar">
        <label className="search-field"><Icon name="search" />
          <input className="input" placeholder="ابحث في المساحات…" value={q} autoComplete="off" onChange={e => setQ(e.target.value)} /></label>
        <span className="grow" />
        {canCreate && <button className="btn" onClick={() => setForm({ project: null })}><Icon name="plus" /> مساحة جديدة</button>}
      </div>
      {list && !rows.length && (
        <div className="empty-box"><span className="ico"><Icon name="projects" /></span>
          <p>{all.length ? 'لا توجد مشاريع تطابق الفلتر.' : 'لا توجد مشاريع بعد.'}</p>
          {!all.length && canCreate && <button className="btn" onClick={() => setForm({ project: null })}>+ مساحة جديدة</button>}</div>
      )}
      {rows.length > 0 && (
        <div className="goal-grid">
          {rows.map(p => (
            <article className="card goal-card" key={p.id} onClick={() => setDetailId(p.id)}>
              <div className="top">
                <Ring pct={p.progress} size={58} stroke={7} />
                <div style={{ flex: 1, minWidth: 0 }}><h4>{p.name}</h4><div className="owner"><Avatar name={p.owner.name} size={22} />{p.owner.name}</div></div>
                <span className={`badge ${PSTATUS_BADGE[p.status] || 'IN_PROGRESS'}`}>{PSTATUS[p.status]}</span>
              </div>
              {p.description && <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
              <div className="proj-stats">
                <span>{p.done}/{p.tasks} مهمة</span>
                {p.overdue ? <span className="badge overdue">{p.overdue} متأخرة</span> : <span>بدون تأخير</span>}
                {p.endDate && <span>حتى {p.endDate}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
      {form && <ProjectForm me={me} project={form.project} onClose={() => setForm(null)} onError={m => toast(m, 'err')}
        onSaved={n => { setForm(null); toast(n ? `تم الحفظ ورُفع ${n} ملف` : 'تم الحفظ'); load(); }} />}
      {detailId && <ProjectDetail id={detailId} me={me} onClose={() => setDetailId(null)} onToast={toast}
        onEdit={p => { setDetailId(null); setForm({ project: p }); }} onChanged={load} />}
      {toastNode}
    </AppShell>
  );
}

function ProjectForm({ me, project: p, onClose, onSaved, onError }) {
  const [f, setF] = useState({ name: p ? p.name : '', key: p ? p.key || '' : '', description: p ? p.description || '' : '',
    startDate: p ? p.startDate || '' : '', endDate: p ? p.endDate || '' : '', status: p ? p.status : 'ACTIVE', ownerId: me.user.id });
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);
  useEffect(() => { if (!p) api('GET', '/api/users').then(setUsers).catch(() => {}); }, [p]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const body = { name: f.name, description: f.description || null, status: f.status, startDate: f.startDate || null, endDate: f.endDate || null,
        ...(f.key.trim() ? { key: f.key.trim().toUpperCase() } : {}) };
      let id = p && p.id;
      if (p) await api('PATCH', '/api/projects/' + id, body);
      else id = (await api('POST', '/api/projects', { ...body, ownerId: +f.ownerId })).id;
      let n = 0;
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('project', id, files.current.files);
        n = files.current.files.length - up.failed.length;
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved(n);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={p ? 'تعديل المساحة' : 'مساحة جديدة'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>الاسم</span><input value={f.name} maxLength={120} required onChange={set('name')} /></label>
        <label className="field"><span>مفتاح المساحة (بادئة أرقام المهام، مثل NKH)</span>
          <input value={f.key} maxLength={10} dir="ltr" style={{ textAlign: 'right', textTransform: 'uppercase' }} placeholder="يُقترح تلقائياً" onChange={set('key')} /></label>
        <label className="field"><span>الوصف</span><textarea value={f.description} maxLength={4000} onChange={set('description')} /></label>
        <div className="row2">
          <label className="field"><span>البداية</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field"><span>النهاية</span><input type="date" value={f.endDate} onChange={set('endDate')} /></label>
          <label className="field"><span>الحالة</span>
            <select value={f.status} onChange={set('status')}>{Object.entries(PSTATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {!p && <label className="field"><span>المالك</span>
            <select value={f.ownerId} onChange={set('ownerId')}>
              <option value={me.user.id}>أنا</option>
              {users.filter(u => u.id !== me.user.id).map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>)}
            </select></label>}
        </div>
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

function ProjectDetail({ id, me, onClose, onEdit, onChanged, onToast }) {
  const [p, setP] = useState(null);
  const [text, setText] = useState('');
  const [ask, confirmNode] = useConfirm();
  const load = useCallback(async () => {
    try { setP(await api('GET', '/api/projects/' + id)); } catch (e) { onToast(e.message, 'err'); onClose(); }
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!p) return null;
  const names = new Map([[me.user.id, me.user.name], [p.owner.id, p.owner.name]]);
  (p.mentionable || []).forEach(x => names.set(x.id, x.name));
  p.comments.forEach(c => names.set(c.user.id, c.user.name));
  const mention = body => String(body).replace(/@\[(\d+)\]/g, (_, n) => '@' + (names.get(+n) || 'مستخدم'));
  const toMe = body => new RegExp('@\\[' + me.user.id + '\\]').test(body);

  async function changeStatus(status) {
    try { await api('PATCH', '/api/projects/' + id, { status }); onToast('تم تحديث الحالة'); load(); onChanged(); } catch (e) { onToast(e.message, 'err'); }
  }
  async function send() {
    if (!text.trim()) return;
    /* تحويل @الاسم إلى @[id] للأسماء المعروفة */
    let body = text;
    [...(p.mentionable || [])].sort((a, b) => b.name.length - a.name.length).forEach(u => { body = body.split('@' + u.name).join(`@[${u.id}]`); });
    try { await api('POST', `/api/projects/${id}/comments`, { body }); setText(''); load(); } catch (e) { onToast(e.message, 'err'); }
  }
  return (
    <Modal title={p.name} wide onClose={onClose}
      actions={(
        <>
          {p.canEdit && <button type="button" className="btn ghost" onClick={() => onEdit(p)}>تعديل</button>}
          {p.canEdit && <button type="button" className="btn danger" onClick={() => ask({ title: 'حذف المساحة', text: 'المهام تبقى لكن بدون مساحة.', ok: 'حذف',
            onOk: async () => { await api('DELETE', '/api/projects/' + id); onChanged(); onClose(); } })}>حذف</button>}
          <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
        </>
      )}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '6px 0 10px' }}>
        <Ring pct={p.progress} size={78} stroke={9} />
        <div>
          <div className="chips"><span className="badge role">{PSTATUS[p.status]}</span>{p.overdue > 0 && <span className="badge overdue">{p.overdue} متأخرة</span>}</div>
          <div className="muted small" style={{ marginTop: 6 }}>{p.owner.name}{p.startDate || p.endDate ? ` · ${p.startDate || '…'} ← ${p.endDate || '…'}` : ''}</div>
        </div>
      </div>
      <div className="facts">
        <div className="fact"><small>المالك</small><b>{p.owner.name}</b></div>
        <div className="fact"><small>المهام</small><b className="big">{p.done}<span className="muted small"> / {p.tasks}</span></b></div>
        <div className="fact"><small>الحالة</small>
          {p.canEdit
            ? <select className="input" style={{ padding: '4px 8px' }} value={p.status} onChange={e => changeStatus(e.target.value)}>
              {Object.entries(PSTATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            : <b>{PSTATUS[p.status]}</b>}
        </div>
      </div>
      {p.description && <><h3 className="section-title">الوصف</h3><p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p></>}

      <h3 className="section-title">المهام ({p.tasksList.length})</h3>
      {p.tasksList.map(t => {
        const d = dueInfo(t);
        return (
          <a className="li-row" key={t.id} href={`/tasks?open=${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="grow"><b>{t.title}</b><small className="muted">{t.assignee ? t.assignee.name : ''}</small></div>
            {d && <span className={`due ${d.cls}`}>{d.text}</span>}
            <span className={`badge ${t.status}`}>{STATUS[t.status]}</span>
          </a>
        );
      })}
      {!p.tasksList.length && <p className="muted small">لا توجد مهام بهذه المساحة بعد.</p>}
      <a className="btn ghost sm" style={{ marginTop: 4 }} href={`/tasks?new=1&projectId=${id}`}>+ مهمة لهذه المساحة</a>

      <FilesBlock entity="project" id={id} onError={m => onToast(m, 'err')} />

      <h3 className="section-title">التعليقات ({p.comments.length})</h3>
      <div>
        {p.comments.length
          ? p.comments.map(c => (
            <div className={`comment ${toMe(c.body) ? 'to-me' : ''}`} key={c.id}>
              <b>{c.user.name}</b> <small>{ago(c.createdAt)}</small><div style={{ whiteSpace: 'pre-wrap' }}>{mention(c.body)}</div>
            </div>))
          : <p className="muted small">لا توجد تعليقات بعد.</p>}
      </div>
      <div className="comment-box">
        <input className="input" value={text} maxLength={1000} placeholder="اكتب تعليقاً… واكتب @ثم اسم زميل لذكره" list="dlMention"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />
        <button type="button" className="btn ghost" onClick={send}>إرسال</button>
      </div>
      <datalist id="dlMention">{(p.mentionable || []).map(u => <option key={u.id} value={`${text}@${u.name} `} label={u.name} />)}</datalist>
      {confirmNode}
    </Modal>
  );
}
