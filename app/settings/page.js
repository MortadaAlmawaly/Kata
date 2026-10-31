'use client';
/* الإعدادات — ترحيل viewSettings (settings.js). التبويبات في tabs-basic.js وtabs-config.js. */
import { useEffect, useState } from 'react';
import AppShell, { useMe } from '../../components/AppShell';
import { useConfirm, useToast } from '../../components/hooks';
import { TabAccount, TabApprovals, TabCompany, TabIntegrations, TabNotifications, TabSecurity } from './tabs-basic';
import { SpacesHome } from '../../components/SpaceSettings';
import { TabAutomation, TabBoards, TabFields, TabInvites, TabIssueTypes, TabLabels, TabLeaves, TabPermissions } from './tabs-config';

export default function SettingsPage() {
  const { me, error, reload } = useMe();
  const [tab, setTab] = useState('account');
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();

  useEffect(() => {
    try { const t = sessionStorage.getItem('rb-settab'); if (t) setTab(t); } catch (_) { /* لا تخزين */ }
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(q);
  }, []);
  const pick = t => { setTab(t); try { sessionStorage.setItem('rb-settab', t); } catch (_) { /* تجاهل */ } };

  const perms = (me && me.perms) || [];
  const admin = perms.includes('admin');
  const tabs = [
    ['account', 'حسابي'], ['notifications', 'الإشعارات'], ['integrations', 'التكاملات'],
    ...(admin || perms.includes('boards.manage') ? [['boards', 'اللوحات']] : []),
    ...(admin ? [['company', 'الشركة'], ['labels', 'المسميات'], ['leaves', 'الإجازات'], ['approvals', 'الموافقات'], ['issuetypes', 'أنواع المهام'], ['fields', 'حقول المهام'], ['automation', 'الأتمتة'], ['permissions', 'الصلاحيات']] : []),
    ...(admin || perms.includes('users.invite') ? [['invites', 'الدعوات']] : []),
    ...(admin ? [['security', 'الأمان والبيانات']] : []),
  ];
  const cur = tabs.some(t => t[0] === tab) ? tab : 'account';
  const props = { me, reload, toast, ask };
  const Body = { account: TabAccount, notifications: TabNotifications, integrations: TabIntegrations, company: TabCompany, labels: TabLabels, leaves: TabLeaves,
    approvals: TabApprovals, fields: TabFields, issuetypes: TabIssueTypes, boards: TabBoards, spaces: SpacesHome, automation: TabAutomation, permissions: TabPermissions, invites: TabInvites, security: TabSecurity }[cur];

  return (
    <AppShell active="settings" title="الإعدادات" sub="حسابك والشركة والصلاحيات والدعوات" me={me}>
      {error && <div className="notice">{error}</div>}
      {me && (
        <>
          <div className="toolbar">
            <div className="seg wrap">
              {tabs.map(([k, l]) => <button key={k} className={k === cur ? 'active' : ''} onClick={() => pick(k)}>{l}</button>)}
            </div>
          </div>
          <div key={cur}><Body {...props} /></div>
        </>
      )}
      {confirmNode}
      {toastNode}
    </AppShell>
  );
}
