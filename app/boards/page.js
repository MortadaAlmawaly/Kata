'use client';
/* تخصيص اللوحة: صفحة كاملة بأقسام جانبية (عام · الأعمدة وسير العمل · شكل البطاقة · الوصول · الحقول · تخطيط المهمة · العناوين · المسميات).
   /boards?id=N لتعديل لوحة · /boards?new=1[&space=ID] لوحة جديدة · /boards?dup=ID نسخة من لوحة (&blank=1 بلا اسم). */
import { useEffect, useState } from 'react';
import AppShell, { useMe } from '../../components/AppShell';
import BoardForm from '../../components/BoardForm';
import { useToast } from '../../components/hooks';
import { api } from '../../lib/api';
import { withBase } from '@/lib/base';

export default function BoardPage() {
  const { me, error, reload } = useMe();
  const [toast, toastNode] = useToast();
  const [boards, setBoards] = useState(null);
  const [q, setQ] = useState(null);
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search))); }, []);
  const load = async () => { try { setBoards(await api('GET', '/api/boards')); } catch (e) { toast(e.message, 'err'); } };
  useEffect(() => { if (me) load(); }, [me]);   // eslint-disable-line react-hooks/exhaustive-deps

  let body = null;
  if (me && boards && q) {
    const board = q.id ? boards.find(b => String(b.id) === q.id) : null;
    const dup = q.dup ? boards.find(b => String(b.id) === q.dup) : null;
    const spaceId = q.space ? +q.space : null;
    const preset = dup ? { ...dup, name: q.blank ? '' : dup.name + ' (نسخة)' } : (spaceId ? { filters: { projectId: spaceId, issueTypes: [] } } : null);
    const sp = board ? (board.filters || {}).projectId : (preset && (preset.filters || {}).projectId);
    const listBack = '/settings?tab=boards';
    const back = board ? '/tasks?board=' + board.id : listBack;
    if (q.id && !board) body = <div className="notice">اللوحة غير موجودة أو لا تملك صلاحية تخصيصها. <a href="/tasks">رجوع للمهام</a></div>;
    else {
      body = (
        <>
          <div className="bp-head">
            <div><small className="muted">تخصيص اللوحة</small><h2>{board ? board.name : 'لوحة جديدة'}</h2></div>
            <a className="btn ghost" style={{ marginInlineStart: 'auto', padding: '10px 28px', fontSize: '1rem', fontWeight: 700 }} href={back}>رجوع</a>
          </div>
          <BoardForm key={board ? board.id : 'new'} asPage me={me} board={board} preset={board ? null : preset} boards={boards} reloadMe={reload}
            onClose={() => { window.location.href = withBase(back); }} onError={m => toast(m, 'err')}
            onSaved={id => { if (board) { toast('تم الحفظ'); load(); } else { window.location.href = withBase('/boards?id=' + id); } }}
            onDeleted={() => { window.location.href = withBase(listBack); }} />
        </>
      );
    }
  }
  return (
    <AppShell active="tasks" title="تخصيص اللوحة" sub="الأعمدة وسير العمل وشكل المهام والحقول والوصول" me={me}>
      {error && <div className="notice">{error}</div>}
      {body}
      {toastNode}
    </AppShell>
  );
}