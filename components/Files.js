'use client';
/* المرفقات (PDF وصور) — ترحيل React لـ public/files.js بنفس الـ API:
   FilesBlock: قسم مرفقات كامل (معاينة، عارض، تنزيل، حذف، سحب وإفلات).
   uploadFiles: رفع ملفات لعنصر بعد حفظه. FilePicker: حقل اختيار داخل النماذج. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FIcon } from './Icon';
import { api } from '../lib/api';

export const FILE_MAX = 8 * 1024 * 1024;
export const FILE_RE = /\.(pdf|png|jpe?g|webp)$/i;
export const FILE_ACCEPT = '.pdf,image/png,image/jpeg,image/webp';
export const fmtSize = n => (n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

const readB64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('تعذر قراءة الملف'));
  r.readAsDataURL(file);
});

/* يرجع { ok, failed[], ids[] } — ids أرقام المرفقات المرفوعة بالترتيب */
export async function uploadFiles(entity, id, files) {
  const list = [...(files || [])].filter(f => f && f.size);
  const failed = [];
  const ids = [];
  let ok = 0;
  for (const f of list) {
    if (f.size > FILE_MAX) { failed.push(`${f.name} (أكبر من 8MB)`); continue; }
    if (!FILE_RE.test(f.name)) { failed.push(`${f.name} (نوع غير مدعوم)`); continue; }
    try { const r = await api('POST', '/api/attachments', { entity, id, name: f.name, data: await readB64(f) }); ok++; if (r && r.id) ids.push(r.id); }
    catch (e) { failed.push(`${f.name} (${e.message})`); }
  }
  return { ok, failed, ids };
}

export function FilePicker({ label = 'مرفقات (PDF أو صور)', inputRef }) {
  return (
    <label className="field file-field"><span>{label}</span>
      <input type="file" multiple accept={FILE_ACCEPT} ref={inputRef} />
      <small className="muted">PDF أو PNG أو JPG أو WEBP — حتى 8MB للملف</small></label>
  );
}

export function FilesBlock({ entity, id, compact = false, onError }) {
  const [data, setData] = useState(null);
  const [drag, setDrag] = useState(false);
  const [viewer, setViewer] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try { setData(await api('GET', `/api/attachments?entity=${entity}&id=${id}`)); }
    catch (_) { setData({ files: [], canUpload: false }); }
  }, [entity, id]);
  useEffect(() => { load(); }, [load]);

  async function send(files) {
    const r = await uploadFiles(entity, id, files);
    if (r.failed.length && onError) onError('تعذر رفع: ' + r.failed.join('، '));
    load();
  }
  async function remove(f) {
    if (!window.confirm('حذف هذا الملف؟')) return;
    try { await api('DELETE', '/api/attachments/' + f.id); load(); } catch (e) { if (onError) onError(e.message); }
  }

  if (!data) return null;
  const files = data.files || [];
  if (!files.length && (!data.canUpload || compact)) return null;
  return (
    <div className={`files-block ${drag ? 'drag' : ''}`}
      onDragOver={e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { setDrag(false); if (e.dataTransfer.files.length) { e.preventDefault(); send(e.dataTransfer.files); } }}>
      <div className="files-head"><b>المرفقات</b><span className="n">{files.length}</span><span style={{ flex: 1 }} />
        {data.canUpload && (
          <label className="btn ghost sm">+ إضافة ملف
            <input type="file" multiple accept={FILE_ACCEPT} hidden ref={inputRef}
              onChange={e => { const f = e.target.files; if (f && f.length) send(f).then(() => { if (inputRef.current) inputRef.current.value = ''; }); }} />
          </label>
        )}
      </div>
      {files.length && entity === 'task' ? (
        <div className="files-list">
          {files.map(f => (
            <div className="fl-row" key={f.id}>
              <button type="button" className="fl-thumb" onClick={() => setViewer(f)} aria-label="معاينة">
                {f.mime.startsWith('image/') ? <img src={f.url} alt="" loading="lazy" /> : <span className="pdf-ico">PDF</span>}</button>
              <button type="button" className="fl-name" title={f.name} onClick={() => setViewer(f)}>{f.name}</button>
              <span className="fl-size">{fmtSize(f.size)}</span>
              <span className="fl-date">{f.createdAt ? new Date(f.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span>
              <span className="fl-acts">
                {f.canDelete && <button type="button" onClick={() => remove(f)} title="حذف" aria-label="حذف"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg></button>}
                <a href={f.url + '?download=1'} download={f.name} title="تنزيل" aria-label="تنزيل"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg></a>
              </span>
            </div>
          ))}
        </div>
      ) : files.length ? (<div className="files-grid">
          {files.map(f => (
            <div className="file-card" key={f.id}>
              <div className="file-thumb" onClick={() => setViewer(f)}>
                {f.mime.startsWith('image/') ? <img src={f.url} alt="" loading="lazy" /> : <span className="pdf-ico">PDF</span>}
              </div>
              <div className="file-meta"><b title={f.name}>{f.name}</b>
                <small>{fmtSize(f.size)}{f.uploader ? ' · ' + f.uploader.name : ''}</small></div>
              <div className="file-acts">
                <a href={f.url + '?download=1'} download={f.name} title="تنزيل" aria-label="تنزيل"><FIcon n="download" /></a>
                {f.canDelete && <button type="button" onClick={() => remove(f)} title="حذف" aria-label="حذف"><FIcon n="x" size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="files-drop">اسحب الملفات هنا أو اضغط «إضافة ملف»</div>}
      {viewer && <Viewer file={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function Viewer({ file, onClose }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  const isImg = file.mime.startsWith('image/');
  return (
    <div className="lightbox" onMouseDown={e => { if (e.target === e.currentTarget || e.target.classList.contains('lb-stage')) onClose(); }}>
      <div className="lb-bar">
        <b>{file.name}</b><small>{fmtSize(file.size)}</small><span style={{ flex: 1 }} />
        <a className="btn ghost sm" href={file.url + '?download=1'} download={file.name}>تنزيل</a>
        <a className="btn ghost sm" href={file.url} target="_blank" rel="noopener noreferrer">فتح بتبويب</a>
        <button type="button" className="btn sm" onClick={onClose}>إغلاق</button>
      </div>
      <div className="lb-stage">
        {isImg ? <img src={file.url} alt={file.name} /> : <iframe src={file.url} title={file.name} />}
      </div>
    </div>
  );
}
