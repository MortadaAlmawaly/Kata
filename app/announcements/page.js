'use client';
/* التعاميم — ترحيل React لـ viewAnnouncements/announcementForm/announcementDetail (views-pro.js). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIcon } from '../../components/Icon';
import { api } from '../../lib/api';
import { fmtDT, ROLE } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import PageTabs, { COMPANY_TABS } from '../../components/PageTabs';
import { Avatar, Icon, Modal } from '../../components/ui';
import { FilePicker, FilesBlock, uploadFiles } from '../../components/Files';
import { ago, useConfirm, useToast } from '../../components/hooks';

const AUD = { COMPANY: 'كل الشركة', TEAM: 'الفريق', CUSTOM: 'موجّه لأشخاص' };

export default function AnnouncementsPage() {
  const { me, error } = useMe();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();
  const perms = (me && me.perms) || [];
  const canPost = perms.includes('announcements.team') || perms.includes('announcements.company');

  const load = useCallback(async () => {
    try { setList(await api('GET', '/api/announcements')); } catch (e) { if (e.message !== 'unauthorized') toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { if (me) load(); }, [me, load]);

  function remove(a) {
    ask({ title: 'حذف التعميم', text: 'سيُحذف نهائياً مع مرفقاته.', ok: 'حذف', onOk: async () => {
      try { await api('DELETE', '/api/announcements/' + a.id); toast('تم الحذف'); setDetail(null); load(); } catch (e) { toast(e.message, 'err'); }
    } });
  }

  return (
    <AppShell active="announcements" title="التعاميم" sub="أخبار الشركة والفريق" me={me}>
      <PageTabs items={COMPANY_TABS} active="announcements" />
      {error && <div className="notice">{error}</div>}
      <div className="toolbar">
        <span className="grow muted">تعاميم الشركة وتعاميم فريقك والتعاميم الموجّهة إليك.</span>
        {canPost && <button className="btn" onClick={() => setForm(true)}><Icon name="plus" /> تعميم جديد</button>}
      </div>
      {list && !list.length && <div className="empty-box"><span className="ico"><Icon name="announce" /></span><p>لا توجد تعاميم.</p></div>}
      {(list || []).map(a => (
        <article className={`card ann ${a.pinned ? 'pinned' : ''}`} key={a.id} style={{ cursor: 'pointer' }}
          onClick={e => { if (!e.target.closest('button,a,input,label,.files-block')) setDetail(a); }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h4>{a.pinned ? <FIcon n="pin" size={14} /> : null} {a.title}</h4>
            <span className="badge role">{AUD[a.audience]}{a.audience === 'CUSTOM' && a.recipientCount ? ` (${a.recipientCount})` : ''}</span>
            <span className="grow" style={{ flex: 1 }} />
            {a.canDelete && <button className="btn sm ghost" onClick={() => remove(a)}>حذف</button>}
          </div>
          <p className="muted small">{a.author.name} · {ROLE[a.author.role]} · {ago(a.createdAt)}</p>
          {a.recipients && a.recipients.length > 0 && (
            <p className="muted small">إلى: {a.recipients.slice(0, 6).map(r => r.name).join('، ')}{a.recipients.length > 6 ? ` +${a.recipients.length - 6}` : ''}</p>
          )}
          <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.body}</p>
          <FilesBlock entity="announcement" id={a.id} compact={a.author.id !== me.user.id} onError={m => toast(m, 'err')} />
        </article>
      ))}

      {form && <AnnouncementForm me={me} perms={perms} onClose={() => setForm(false)}
        onSaved={() => { setForm(false); toast('تم النشر'); load(); }} onError={m => toast(m, 'err')} />}
      {detail && (
        <Modal title={detail.title} wide onClose={() => setDetail(null)}
          actions={(
            <>
              {detail.canDelete && <button type="button" className="btn danger" onClick={() => remove(detail)}>حذف التعميم</button>}
              <button type="button" className="btn ghost" onClick={() => setDetail(null)}>إغلاق</button>
            </>
          )}>
          <div className="chips" style={{ margin: '4px 0 8px' }}>
            <span className="badge role">{detail.pinned ? <><FIcon n="pin" size={12} /> مثبّت</> : 'تعميم'}</span>
            <span className="badge role">{AUD[detail.audience]}{detail.audience === 'CUSTOM' && detail.recipientCount ? ` (${detail.recipientCount})` : ''}</span>
          </div>
          <p className="muted small">{detail.author.name} · {ROLE[detail.author.role]} · {fmtDT(detail.createdAt)}</p>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '.95rem', lineHeight: 1.9, marginTop: 10 }}>{detail.body}</p>
          {detail.recipients && detail.recipients.length > 0 && (
            <>
              <h3 className="section-title">المستلمون ({detail.recipients.length})</h3>
              <div className="pills">{detail.recipients.map(r => <span className="pill" key={r.id}><Avatar name={r.name} size={22} />{r.name}</span>)}</div>
            </>
          )}
          <FilesBlock entity="announcement" id={detail.id} compact={detail.author.id !== me.user.id} onError={m => toast(m, 'err')} />
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </AppShell>
  );
}

function AnnouncementForm({ me, perms, onClose, onSaved, onError }) {
  const teamOk = perms.includes('announcements.team'), compOk = perms.includes('announcements.company');
  const [dir, setDir] = useState([]);
  const [f, setF] = useState({ title: '', body: '', audience: teamOk ? 'TEAM' : compOk ? 'COMPANY' : 'CUSTOM', pinned: false });
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useRef(null);

  useEffect(() => {
    api('GET', '/api/directory').then(d => setDir(d.filter(u => u.id !== me.user.id))).catch(e => onError(e.message));
  }, [me.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dir.filter(u => !s || (u.name + ' ' + (u.department || '') + ' ' + ROLE[u.role]).toLowerCase().includes(s));
  }, [dir, q]);

  const toggle = id => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const ids = [...picked];
    if (f.audience === 'CUSTOM' && !ids.length) { setErr('اختر شخصاً واحداً على الأقل'); return; }
    setBusy(true);
    try {
      const r = await api('POST', '/api/announcements', {
        title: f.title, body: f.body, audience: f.audience, pinned: f.pinned, recipientIds: f.audience === 'CUSTOM' ? ids : [],
      });
      if (files.current && files.current.files.length) {
        const up = await uploadFiles('announcement', r.id, files.current.files);
        if (up.failed.length) onError('تعذر رفع: ' + up.failed.join('، '));
      }
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title="تعميم جديد" wide onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>العنوان</span><input value={f.title} maxLength={140} required onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="field"><span>النص</span>
          <textarea value={f.body} maxLength={8000} required style={{ minHeight: 130 }} onChange={e => setF({ ...f, body: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>إلى من؟</span>
            <select value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>
              {teamOk && <option value="TEAM">فريقي (كل من تحتي)</option>}
              {compOk && <option value="COMPANY">كل الشركة</option>}
              <option value="CUSTOM">أشخاص أختارهم</option>
            </select></label>
          {compOk && <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.pinned} onChange={e => setF({ ...f, pinned: e.target.checked })} /> تثبيت في الأعلى</label>}
        </div>
        {f.audience === 'CUSTOM' && (
          <div className="field"><span>المستلمون <b className="muted">({picked.size})</b></span>
            <input className="input" value={q} placeholder="ابحث بالاسم أو القسم…" autoComplete="off" style={{ marginBottom: 8 }} onChange={e => setQ(e.target.value)} />
            <div className="pick-list">
              {shown.map(u => (
                <label className="check" key={u.id}>
                  <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} /> <Avatar name={u.name} size={24} />
                  {u.name} <small className="muted">{ROLE[u.role]}{u.department ? ' · ' + u.department : ''}</small>
                </label>
              ))}
            </div>
            <div className="toolbar" style={{ margin: '8px 0 0' }}>
              <button type="button" className="btn ghost sm" onClick={() => setPicked(p => new Set([...p, ...shown.map(u => u.id)]))}>تحديد الظاهر</button>
              <button type="button" className="btn ghost sm" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
            </div>
          </div>
        )}
        <FilePicker label="مرفقات (اختياري)" inputRef={files} />
        <p className="err" role="alert">{err}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn" disabled={busy}>نشر</button>
        </div>
      </form>
    </Modal>
  );
}
