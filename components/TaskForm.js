'use client';
/* نموذج إنشاء/تعديل مهمة — ترحيل taskForm (tasks-pro.js). */
import { useEffect, useRef, useState } from 'react';
import { FIcon } from './Icon';
import { api } from '../lib/api';
import { fmtMin, parseMin, RECUR } from '../lib/tasks';
import { ROLE, STATUS } from '../lib/constants';
import { Modal } from './ui';
import { shrinkImage } from '../lib/image';
import CfInput from './CustomFields';
import TypeInput from './TypeInput';
import { FilePicker, uploadFiles } from './Files';

export async function resolveIssueKey(text) {
  const key = String(text || '').trim().toUpperCase();
  if (!key) return null;
  const r = await api('GET', `/api/tasks-search?q=${encodeURIComponent(key)}`);
  const hit = r.find(x => x.key === key);
  return hit ? hit.id : undefined;   /* undefined = غير موجود */
}

/* أعمدة اللوحة التي مُنع الإنشاء فيها لا تظهر كحالة أولية عند إنشاء مهمة */
const noCreateOf = ctx => new Set(((ctx.board && ctx.board.columns) || []).filter(c => c.noCreate).map(c => c.status));
const firstCreatable = ctx => { const bad = noCreateOf(ctx); if (!bad.has('TODO')) return 'TODO'; const ok = ctx.statusOpts('TODO').map(([k]) => k).find(k => !bad.has(k)); return ok || 'TODO'; };

export default function TaskForm({ ctx, task: ex, preset, onClose, onSaved, onError, onNotice, boardOptions = [], defaultProjectId = '', lockBoard = false }) {
  const t = ex || preset || {};
  const [ref, setRef] = useState(null);
  const [f, setF] = useState({
    issueType: t.issueType == null ? '' : t.issueType, priority: t.priority || 'MEDIUM', title: t.title || '', description: t.description || '',
    assigneeId: t.assignee ? t.assignee.id : ctx.me.user.id, labels: (t.labels || []).join('، '),
    storyPoints: t.storyPoints ?? '', estimate: t.estimateMin ? fmtMin(t.estimateMin) : '',
    startDate: t.startDate || '', dueDate: t.dueDate || '', projectId: (lockBoard && defaultProjectId) || t.projectId || defaultProjectId || (boardOptions[0] ? boardOptions[0].projectId : ''), sprintId: t.sprintId || '',
    parentKey: t.parent ? t.parent.key : '', goalId: t.goalId || '', recurrence: t.recurrence || '', items: '',
    status: firstCreatable(ctx), linkType: 'BLOCKS', linkKey: '', flagged: (t.labels || []).includes('معوّق'),
  });
  const [cf, setCf] = useState(() => ({ ...(t.customFields || {}) }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);          // «كل الحقول» (النموذج الكامل)
  const [another, setAnother] = useState(false);   // «إنشاء مهمة أخرى»
  const files = useRef(null);
  const [cover, setCover] = useState(null);          // ملف صورة الغلاف
  const [coverUrl, setCoverUrl] = useState('');
  const pickCover = e => {
    const f = e.target.files && e.target.files[0];
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    if (!f) { setCover(null); setCoverUrl(''); return; }
    if (!/\.(png|jpe?g|webp)$/i.test(f.name)) { setErr('الغلاف صورة PNG أو JPG أو WEBP'); e.target.value = ''; return; }
    if (f.size > 8 * 1024 * 1024) { setErr('حجم الغلاف أكبر من 8MB'); e.target.value = ''; return; }
    setErr(''); setCover(f); setCoverUrl(URL.createObjectURL(f));
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });

  /* لوحات تصل متأخرة (الفتح من لوحة المتابعة قبل اكتمال التحميل): اختر اللوحة الحالية تلقائياً */
  useEffect(() => {
    if (ex || f.projectId || !boardOptions.length) return;
    setF(x => (x.projectId ? x : { ...x, projectId: defaultProjectId || boardOptions[0].projectId }));
  }, [boardOptions.length, defaultProjectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    Promise.all([
      api('GET', '/api/goals'), api('GET', '/api/projects'), api('GET', '/api/sprints'),
      api('GET', '/api/task-labels').catch(() => []), api('GET', '/api/tasks-search?q=&type=EPIC').catch(() => []),
    ]).then(([goals, projects, sprints, labels, epics]) => { if (alive) setRef({ goals: goals.filter(g => g.editable && g.status === 'ACTIVE'), projects, sprints, labels, epics }); })
      .catch(e => onError(e.message));
    return () => { alive = false; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const est = parseMin(f.estimate);
      if (Number.isNaN(est)) throw new Error('صيغة التقدير غير صحيحة (مثال: 2h 30m)');
      let parentId = null;
      if (f.parentKey.trim()) {
        parentId = await resolveIssueKey(f.parentKey);
        if (parentId === undefined) throw new Error('المهمة الأم «' + f.parentKey + '» غير موجودة');
      }
      const body = {
        title: f.title, description: f.description || null, priority: f.priority, issueType: f.issueType,
        labels: [...new Set([...f.labels.split(/[,،]/).map(x => x.trim()).filter(Boolean).filter(x => x !== 'معوّق'), ...(f.flagged ? ['معوّق'] : [])])],
        storyPoints: f.storyPoints === '' ? null : Number(f.storyPoints), estimateMin: est,
        startDate: f.startDate || null, dueDate: f.dueDate || null,
        goalId: f.goalId ? +f.goalId : null, projectId: f.projectId ? +f.projectId : null,
        sprintId: f.sprintId ? +f.sprintId : null, parentId, recurrence: f.recurrence || null,
      };
      const customFields = {};
      ctx.cfFor({ issueType: f.issueType }).forEach(d => {
        const v = cf[d.key];
        if (v !== undefined && (ex || (v !== null && v !== false && !(Array.isArray(v) && !v.length)))) customFields[d.key] = v;
      });
      if (Object.keys(customFields).length) body.customFields = customFields;
      if (body.recurrence && !body.dueDate) throw new Error('المهمة المتكررة تحتاج تاريخ تسليم');
      if (f.assigneeId) body.assigneeId = +f.assigneeId;
      setBusy(true);
      let id = ex && ex.id, key = ex && ex.key;
      if (ex) await api('PATCH', '/api/tasks/' + id, body);
      else {
        const items = f.items.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 40);
        if (items.length) body.items = items;
        const r = await api('POST', '/api/tasks', body);
        id = r.id; key = r.key;
        if (f.status && f.status !== 'TODO') await api('PATCH', '/api/tasks/' + id, { status: f.status });
        if (f.linkKey.trim()) {
          const toId = await resolveIssueKey(f.linkKey);
          if (toId === undefined) onError('تعذّر الربط: المهمة «' + f.linkKey + '» غير موجودة');
          else await api('POST', '/api/tasks/' + id + '/links', { toId, type: f.linkType });
        }
      }
      let n = 0;
      if (cover) {
        const cu = await uploadFiles('task', id, [await shrinkImage(cover)]);
        if (cu.ids[0]) await api('PATCH', '/api/tasks/' + id, { coverFileId: cu.ids[0] });
        else if (cu.failed.length) onError('تعذر رفع الغلاف: ' + cu.failed.join('، '));
      }
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('task', id, files.current.files);
        n = files.current.files.length - up.failed.length;
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      if (!ex && another) { (onNotice || onError)('أُنشئت ' + key); setF(x => ({ ...x, title: '', description: '', items: '' })); setCover(null); setCoverUrl(''); setBusy(false); if (files.current) files.current.value = ''; return; }
      onSaved(ex ? (n ? `تم الحفظ ورُفع ${n} ملف` : 'تم الحفظ') : `أُنشئت ${key}`, id);
    } catch (ex2) { setErr(ex2.message); setBusy(false); }
  }

  const cfs = ctx.cfFor({ issueType: f.issueType });
  const R = ref || { goals: [], projects: [], sprints: [], labels: [], epics: [] };
  return (
    <Modal title={ex ? `تعديل ${ex.key}` : 'إنشاء مهمة'} wide onClose={onClose}>
      <form onSubmit={submit} noValidate className={ex || more ? '' : 'qc-compact'}>
        {boardOptions.length > 0 && !lockBoard && (
          <label className="field"><span>اللوحة</span>
            <select value={f.projectId} onChange={set('projectId')} aria-label="اللوحة">
              {boardOptions.map(b => <option key={b.id} value={b.projectId}>{b.name}</option>)}
              {f.projectId && !boardOptions.some(b => String(b.projectId) === String(f.projectId)) && <option value={f.projectId}>لوحة أخرى</option>}
            </select>
            <small className="muted">المهمة تظهر في اللوحة المختارة فقط</small></label>
        )}
        <div className="row2">
          <label className="field"><span>النوع</span>
            <TypeInput ctx={ctx} value={f.issueType} onChange={v => setF(x => ({ ...x, issueType: v }))} /></label>
          <label className="field"><span>الأولوية</span>
            <select value={f.priority} onChange={set('priority')}>{ctx.priorityOpts(f.priority).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {!ex && (
            <label className="field"><span>الحالة</span>
              <select value={f.status} onChange={set('status')}>{ctx.statusOpts(f.status).filter(([k]) => ex || !noCreateOf(ctx).has(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <small className="muted">الحالة الأولية عند الإنشاء</small></label>
          )}
        </div>
        <label className="field"><span>الملخّص</span><input value={f.title} maxLength={120} required onChange={set('title')} /></label>
        <label className="field"><span>الوصف</span><textarea rows={5} value={f.description} maxLength={10000} onChange={set('description')} /></label>
        <div className="row2">
          {ctx.users.length > 1 && (
            <label className="field"><span>المنفّذ</span>
              <select value={f.assigneeId} onChange={set('assigneeId')}>
                {ctx.users.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}{u.id === ctx.me.user.id ? ' (أنا)' : ''}</option>)}
              </select>
              {String(f.assigneeId) !== String(ctx.me.user.id) && (
                <button type="button" className="jf-link" style={{ alignSelf: 'flex-start' }} onClick={() => setF({ ...f, assigneeId: ctx.me.user.id })}>تعيين لي</button>
              )}</label>
          )}
          <label className="field"><span>الوسوم (افصل بفاصلة)</span><input list="dlLabels" value={f.labels} maxLength={300} placeholder="واجهة، عاجل" onChange={set('labels')} /></label>
          <datalist id="dlLabels">{R.labels.map(l => <option key={l} value={l} />)}</datalist>
          <label className="field qc-extra"><span>نقاط القصة</span><input type="number" min="0" max="1000" step="0.5" value={f.storyPoints} placeholder="مثال: 5" onChange={set('storyPoints')} /></label>
          <label className="field qc-extra"><span>التقدير (مثال: 2h 30m أو 1d)</span><input value={f.estimate} placeholder="2h 30m" onChange={set('estimate')} /></label>
          <label className="field qc-extra"><span>تاريخ البدء</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field"><span>تاريخ التسليم</span><input type="date" value={f.dueDate} onChange={set('dueDate')} /></label>
          {!boardOptions.length && !lockBoard && <label className="field qc-extra"><span>المساحة</span>
            <select value={f.projectId} onChange={set('projectId')}>
              <option value="">— بدون —</option>
              {R.projects.filter(p => p.status !== 'DONE' || p.id === t.projectId).map(p => <option key={p.id} value={p.id}>{p.key ? p.key + ' — ' : ''}{p.name}</option>)}
            </select></label>}
          <label className="field qc-extra"><span>السباق</span>
            <select value={f.sprintId} onChange={set('sprintId')}>
              <option value="">Backlog</option>
              {R.sprints.filter(s => s.state !== 'CLOSED').map(s => <option key={s.id} value={s.id}>{s.name}{s.state === 'ACTIVE' ? ' (جارٍ)' : ''}</option>)}
            </select></label>
          <label className="field qc-extra"><span>الأم / الملحمة (اكتب الرقم مثل NKH-3)</span>
            <input list="dlEpics" value={f.parentKey} placeholder="NKH-3" dir="ltr" style={{ textAlign: 'right' }} onChange={set('parentKey')} /></label>
          <datalist id="dlEpics">{R.epics.map(e => <option key={e.key} value={e.key}>{e.title}</option>)}</datalist>
          <label className="field qc-extra"><span>مرتبطة بهدف</span>
            <select value={f.goalId} onChange={set('goalId')}>
              <option value="">— بدون —</option>{R.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select></label>
          <label className="field qc-extra"><span>التكرار</span>
            <select value={f.recurrence} onChange={set('recurrence')}>{Object.entries(RECUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        {cfs.length > 0 && (
          <div className="qc-extra">
            <h3 className="section-title" style={{ marginTop: 14 }}>{ctx.secName('main')} / {ctx.secName('side')}</h3>
            <div className="cf-grid">
              {cfs.map(d => (
                <div className={`cf-row ${d.type === 'longtext' || d.type === 'multiselect' ? 'wide' : ''}`} key={d.key}>
                  <label>{ctx.cfLabel(d)}</label>
                  <CfInput d={d} value={cf[d.key]} users={ctx.users} onChange={v => setCf(c => ({ ...c, [d.key]: v }))} />
                </div>
              ))}
            </div>
          </div>
        )}
        {!ex && (
          <div className="field qc-extra"><span>مهام مرتبطة</span>
            <div className="row2">
              <select value={f.linkType} onChange={set('linkType')}><option value="BLOCKS">تحجب</option><option value="RELATES">مرتبطة بـ</option><option value="DUPLICATES">مكرّرة لـ</option></select>
              <input dir="ltr" style={{ textAlign: 'right' }} placeholder="رقم المهمة مثل NKH-12" value={f.linkKey} maxLength={20} onChange={set('linkKey')} />
            </div></div>
        )}
        <label className="check qc-extra" title="يُعلَّم بوسم «معوّق» ليظهر بوضوح على اللوحة"><input type="checkbox" checked={f.flagged} onChange={e => setF({ ...f, flagged: e.target.checked })} /> معوّق (Impediment) — يلزم الانتباه له</label>
        <p className="muted small qc-extra" style={{ marginTop: 6 }}>المهمة المتكررة تتولّد نسختها التالية تلقائياً عند إنجاز الحالية (تحتاج تاريخ تسليم).</p>
        {!ex && (
          <label className="field qc-extra"><span>بنود فرعية (قائمة تحقق) — بند بكل سطر</span>
            <textarea rows={3} value={f.items} maxLength={3000} placeholder={'جمع المتطلبات\nكتابة المسودة\nمراجعة المدير'} onChange={set('items')} /></label>
        )}
        <div className="field"><span>غلاف المهمة (اختياري)</span>
          <div className="cover-field">
            {coverUrl ? <img src={coverUrl} alt="" className="cover-thumb" /> : <span className="cover-thumb ph"><FIcon n="image" size={22} /></span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickCover} />
            {cover && <button type="button" className="btn ghost sm" onClick={() => { setCover(null); if (coverUrl) URL.revokeObjectURL(coverUrl); setCoverUrl(''); }}>إزالة</button>}
          </div>
          <small className="muted">صورة تظهر أعلى بطاقة المهمة على اللوحة (PNG / JPG / WEBP حتى 8MB)</small></div>
        <FilePicker label="مرفقات (اختياري)" inputRef={files} />
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          {!ex && <button type="button" className="btn ghost" onClick={() => setMore(m => !m)}>{more ? 'حقول أقل' : 'كل الحقول'}</button>}
          {!ex && <label className="check" style={{ marginInlineEnd: 'auto' }}><input type="checkbox" checked={another} onChange={e => setAnother(e.target.checked)} /> إنشاء مهمة أخرى</label>}
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>{ex ? 'حفظ' : 'إنشاء'}</button>
        </div>
      </form>
    </Modal>
  );
}
