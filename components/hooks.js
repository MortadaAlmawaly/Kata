'use client';
/* خطّافات مشتركة: إشعار منبثق (Toast) ونافذة تأكيد. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

export function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((text, kind = 'ok', actions) => {
    setMsg({ text, kind, actions });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), kind === 'err' ? 4200 : (actions && actions.length ? 7000 : 2800));
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = msg
    ? (
      <div className={`toast show${msg.kind === 'err' ? ' err-t' : msg.kind === 'info' ? ' info-t' : ''}`} role="status">
        <span>{msg.text}</span>
        {msg.actions && msg.actions.map((a, i) => (
          <button type="button" key={i} className="toast-act" onClick={() => { a.onClick(); setMsg(null); }}>{a.label}</button>
        ))}
      </div>
    )
    : null;
  return [toast, node];
}

/* confirm: const [ask, node] = useConfirm(); ask({ title, text, ok, onOk }) */
export function useConfirm() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = useCallback(opts => setSt(opts), []);
  const node = st ? (
    <Modal title={st.title} onClose={() => setSt(null)}
      actions={(
        <>
          <button type="button" className="btn ghost" onClick={() => setSt(null)}>إلغاء</button>
          <button type="button" className={`btn ${st.danger === false ? '' : 'danger'}`} disabled={busy}
            onClick={async () => { setBusy(true); try { await st.onOk(); setSt(null); } finally { setBusy(false); } }}>{st.ok || 'تأكيد'}</button>
        </>
      )}>
      <p className="muted" style={{ marginTop: 8 }}>{st.text}</p>
    </Modal>
  ) : null;
  return [ask, node];
}

/* "قبل 5 دقائق" */
export function ago(s) {
  const sec = Math.max(0, (Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 60) return 'الآن';
  if (sec < 3600) return `قبل ${Math.floor(sec / 60)} دقيقة`;
  if (sec < 86400) return `قبل ${Math.floor(sec / 3600)} ساعة`;
  return `قبل ${Math.floor(sec / 86400)} يوم`;
}
