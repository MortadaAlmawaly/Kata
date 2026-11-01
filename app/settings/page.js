'use client';
/* الإعدادات — ترحيل viewSettings (settings.js). التبويبات في tabs-basic.js وtabs-config.js. */
import { useEffect, useState } from 'react';
import AppShell, { useMe } from '../../components/AppShell';
import { useConfirm, useToast } from '../../components/hooks';
import { TabAccount, TabApprovals, TabCompany, TabIntegrations, TabNotifications, TabSecurity } from './tabs-basic';
import { SpacesHome } from '../../components/SpaceSettings';
import { TabAutomation, TabBoards, TabFields, TabInvites, TabIssueTypes, TabLabels, TabLeaves, TabPermissions } from './tabs-config';

/* «تخصيص المهام»: يجمع أنواع المهام وحقولها في صفحة واحدة بدل تبويبين منفصلين */
const TASKCFG = [['types', 'أنواع المهام', TabIssueTypes], ['fields', 'حقول المهام', TabFields]];
function TabTaskConfig(props) {
  const [sub, setSub] = useState('types');
  useEffect(() => { try { const s = sessionStorage.getItem('rb-settask'); if (s && TASKCFG.some(x => x[0] === s)) setSub(s); } catch (_) { /* لا تخزين */ } }, []);
  const pickSub = s => { setSub(s); try { sessionStorage.setItem('rb-settask', s); } catch (_) { /* تجاهل */ } };
  const Cur = (TASKCFG.find(x => x[0] === sub) || TASKCFG[0])[2];
  return (
    <>
      <div className="seg" role="group" aria-label="تخصيص المهام" style={{ marginBottom: 14 }}>
        {TASKCFG.map(([k, l]) => <button key={k} type="button" className={k === sub ? 'active' : ''} onClick={() => pickSub(k)}>{l}</button>)}
      </div>
      <Cur {...props} />
    </>
  );
}

/* روابط قديمة (?tab=issuetypes أو ?tab=fields) تُحوَّل للقسم الجديد */
const LEGACY_TAB = { issuetypes: 'types', fields: 'fields' };

export default function SettingsPage() {
  const { me, error, reload } = useMe();
  const [tab, setTab] = useState('account');
  const [toast, toastNode] = useToast();
  const [ask, confirmNode] = useConfirm();

  useEffect(() => {
    const land = t => { if (LEGACY_TAB[t]) { try { sessionStorage.setItem('rb-settask', LEGACY_TAB[t]); } catch (_) { /* تجاهل */ } return 'taskcfg'; } return t; };
    try { const t = sessionStorage.getItem('rb-settab'); if (t) setTab(land(t)); } catch (_) { /* لا تخزين */ }
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(land(q));
  }, []);
  const pick = t => { setTab(t); try { sessionStorage.setItem('rb-settab', t); } catch (_) { /* تجاهل */ } };

  const perms = (me && me.perms) || [];
  const admin = perms.includes('admin');
  const tabs = [
    ['account', 'حسابي'], ['notifications', 'الإشعارات'], ['integrations', 'التكاملات'],
    ...(admin || perms.includes('boards.manage') ? [['boards', 'اللوحات']] : []),
    ...(admin ? [['company', 'الشركة'], ['labels', 'المسميات'], ['leaves', 'الإجازات'], ['approvals', 'الموافقات'], ['taskcfg', 'تخصيص المهام'], ['automation', 'الأتمتة'], ['permissions', 'الصلاحيات']] : []),
    ...(admin || perms.includes('users.invite') ? [['invites', 'الدعوات']] : []),
    ...(admin ? [['security', 'الأمان والبيانات']] : []),
  ];
  const cur = tabs.some(t => t[0] === tab) ? tab : 'account';
  /* تجميع الأقسام الخمسة عشر في أربع مجموعات واضحة */
  const GROUPS = [
    ['حسابي', ['account', 'notifications', 'integrations']],
    ['العمل والمهام', ['boards', 'taskcfg', 'automation']],
    ['الشركة والفريق', ['company', 'labels', 'leaves', 'approvals', 'invites', 'permissions']],
    ['الأمان', ['security']],
  ].map(([name, keys]) => [name, tabs.filter(t => keys.includes(t[0]))]).filter(g => g[1].length);

  const props = { me, reload, toast, ask };
  const Body = { account: TabAccount, notifications: TabNotifications, integrations: TabIntegrations, company: TabCompany, labels: TabLabels, leaves: TabLeaves,
    approvals: TabApprovals, taskcfg: TabTaskConfig, boards: TabBoards, spaces: SpacesHome, automation: TabAutomation, permissions: TabPermissions, invites: TabInvites, security: TabSecurity }[cur];

  return (
    <AppShell active="settings" title="الإعدادات" sub="حسابك والشركة والصلاحيات والدعوات" me={me}>
      {error && <div className="notice">{error}</div>}
      {me && (
        <>
          <div className="toolbar">
            <select className="input set-pick" aria-label="قسم الإعدادات" value={cur} onChange={e => pick(e.target.value)}>
              {GROUPS.map(([name, items]) => <optgroup key={name} label={name}>{items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
            </select>
            <div className="set-groups set-seg">
              {GROUPS.map(([name, items]) => (
                <div className="set-group" key={name}>
                  <small className="muted">{name}</small>
                  <div className="seg wrap">
                    {items.map(([k, l]) => <button key={k} className={k === cur ? 'active' : ''} onClick={() => pick(k)}>{l}</button>)}
                  </div>
                </div>
              ))}
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
