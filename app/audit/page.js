'use client';
/* سجل التدقيق — ترحيل React لـ viewAudit (app.js). */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDT } from '../../lib/constants';
import AppShell, { useMe } from '../../components/AppShell';
import { Icon } from '../../components/ui';

export const AUDIT = {
  'user.create': 'إضافة مستخدم', 'user.update': 'تعديل مستخدم', 'user.reset-password': 'إعادة تعيين كلمة مرور',
  'password.change': 'تغيير كلمة المرور', 'task.create': 'إنشاء مهمة', 'task.update': 'تعديل مهمة', 'task.delete': 'حذف مهمة',
  'goal.create': 'إنشاء هدف', 'goal.update': 'تعديل هدف', 'goal.delete': 'حذف هدف',
  'request.create': 'تقديم طلب', 'request.approve': 'موافقة على طلب', 'request.reject': 'رفض طلب', 'request.cancel': 'إلغاء طلب',
  'org.update': 'تعديل إعدادات الشركة', 'event.create': 'إنشاء موعد', 'event.delete': 'حذف موعد',
  'project.create': 'إنشاء مساحة', 'project.update': 'تعديل مساحة', 'project.delete': 'حذف مساحة',
  'announcement.create': 'نشر تعميم', 'task.comment': 'تعليق على مهمة', 'permissions.update': 'تعديل مصفوفة الصلاحيات',
  'access.update': 'تعديل صلاحيات شخص', 'invite.create': 'إرسال دعوة', 'invite.revoke': 'إلغاء دعوة', 'org.export': 'تصدير بيانات الشركة',
  'review.create': 'بدء تقييم أداء', 'review.submit': 'إرسال تقييم أداء', 'policy.create': 'نشر سياسة', 'policy.update': 'تعديل سياسة',
  'policy.delete': 'حذف سياسة', 'webhook.create': 'إضافة Webhook', 'integration.whatsapp': 'ضبط واتساب', 'file.upload': 'رفع ملف', 'file.delete': 'حذف ملف',
};

export default function AuditPage() {
  const { me, error } = useMe();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!me) return;
    api('GET', '/api/audit').then(setRows).catch(e => { if (e.message !== 'unauthorized') setErr(e.message); });
  }, [me]);

  return (
    <AppShell active="audit" title="سجل التدقيق" sub="كل العمليات الحساسة" me={me}>
      {(error || err) && <div className="notice">{error || err}</div>}
      {rows && !rows.length && <div className="empty-box"><span className="ico"><Icon name="audit" /></span><p>لا توجد عمليات مسجّلة.</p></div>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الوقت</th><th>المنفّذ</th><th>العملية</th><th>العنصر</th><th>تفاصيل</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i}>
                  <td>{fmtDT(r.createdAt)}</td>
                  <td>{r.actor}</td>
                  <td>{AUDIT[r.action] || r.action}</td>
                  <td>{r.entity}{r.entityId ? ' #' + r.entityId : ''}</td>
                  <td className="small muted" style={{ maxWidth: 320, direction: 'ltr', textAlign: 'right' }}>{r.meta ? JSON.stringify(r.meta).slice(0, 160) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
