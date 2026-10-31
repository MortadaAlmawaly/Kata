/* خادم وهمي داخل المتصفح للمعاينة فقط — يحاكي قواعد الصلاحيات الحقيقية بدون Node أو قاعدة بيانات.
   البيانات بالذاكرة وتتصفّر عند إعادة التحميل. */
(function () {
  window.__PREVIEW__ = true;
  const LEVEL = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3, GM: 4, CEO: 5 };
  const CATALOG = {
    'tasks.create': { min: 1, group: 'المهام', label: 'إنشاء مهام', hint: '' },
    'tasks.assign': { min: 1, group: 'المهام', label: 'إسناد المهام لغيري (ضمن نطاقي)', hint: 'بدونها يُسند لنفسه فقط' },
    'tasks.edit': { min: 1, group: 'المهام', label: 'تعديل تفاصيل المهام', hint: 'العنوان والوصف والحقول والتواريخ…' },
    'tasks.move': { min: 1, group: 'المهام', label: 'نقل المهام / تغيير الحالة', hint: '' },
    'tasks.delete': { min: 1, group: 'المهام', label: 'حذف المهام', hint: '' },
    'tasks.comment': { min: 1, group: 'المهام', label: 'التعليق على المهام', hint: '' },
    'tasks.worklog': { min: 1, group: 'المهام', label: 'تسجيل ساعات العمل', hint: '' },
    'tasks.attach': { min: 1, group: 'المهام', label: 'رفع مرفقات للمهام', hint: '' },
    'hr.export': { min: 5, group: 'الفريق', label: 'تصدير سجل الحضور والإجازات والرواتب (الموارد البشرية)', hint: 'للمدير التنفيذي ومن يمنحه الأدمن (موظف الموارد البشرية)' },
    'team.view': { min: 2, group: 'الفريق', label: 'عرض أداء الفريق', hint: 'لوحة أداء من تحتي بلوحة المتابعة والمهام' },
    'reports.view': { min: 2, group: 'الفريق', label: 'التقارير وتصديرها', hint: 'تقارير الأداء لمن تحتي مع تصدير CSV' },
    'attendance.team': { min: 2, group: 'الفريق', label: 'حالة حضور الفريق', hint: 'من حضر ومن بإجازة اليوم' },
    'goals.cascade': { min: 2, group: 'العمل', label: 'وضع أهداف لمن تحتي', hint: 'تكليف الفريق بأهداف ونتائج رئيسية' },
    'projects.manage': { min: 2, group: 'العمل', label: 'إنشاء وإدارة المشاريع', hint: '' },
    'requests.approve': { min: 2, group: 'العمل', label: 'الموافقة على الطلبات', hint: 'ضمن حدّ المبلغ ثم تصعد للأعلى' },
    'announcements.team': { min: 2, group: 'التواصل', label: 'نشر تعاميم للفريق', hint: '' },
    'announcements.company': { min: 4, group: 'التواصل', label: 'تعميم على الشركة وتثبيته', hint: '' },
    'events.company': { min: 4, group: 'التواصل', label: 'فعاليات وعطل الشركة', hint: 'تظهر بتقويم كل الموظفين' },
    'policies.manage': { min: 4, group: 'التواصل', label: 'إدارة سياسات الشركة', hint: 'نشر السياسات والمستندات وطلب الإقرار' },
    'users.manage': { min: 3, group: 'الإدارة', label: 'إدارة المستخدمين تحتي', hint: 'إضافة وتعديل وتعطيل وإعادة كلمة المرور' },
    'users.invite': { min: 3, group: 'الإدارة', label: 'إرسال دعوات انضمام', hint: 'ضمن نطاقه وبدور أقل من دوره' },
    'org.view': { min: 4, group: 'الإدارة', label: 'نظرة الشركة الكاملة', hint: 'أرقام كل المنظمة بلوحة المتابعة' },
    'audit.view': { min: 4, group: 'الإدارة', label: 'سجل التدقيق', hint: '' },
  };
  const MIN = Object.fromEntries(Object.entries(CATALOG).map(([k, c]) => [k, c.min]));
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const now = () => new Date().toISOString();

  const org = { id: 1, name: 'شركة النخبة (معاينة)', currency: 'IQD', approvalLimits: { MANAGER: 500000, DIRECTOR: 5000000, GM: 50000000 } };
  const U = (id, name, role, title, managerId) => ({ id, name, role, title, managerId, active: true, email: `user${id}@demo.test`, mustChangePassword: false, lastLoginAt: now(), leaveEntitlement: 30 });
  const users = [
    U(1, 'سارة الجبوري', 'CEO', 'المدير التنفيذي', null),
    U(2, 'علي الحسيني', 'GM', 'مدير العمليات', 1),
    U(3, 'نور الساعدي', 'DIRECTOR', 'مدير إدارة المبيعات', 2),
    U(4, 'حسن الكعبي', 'MANAGER', 'مدير قسم الجنوب', 3),
    U(5, 'زينب التميمي', 'EMPLOYEE', 'مسؤولة مبيعات', 4),
    U(6, 'مصطفى العبيدي', 'EMPLOYEE', 'مسؤول حسابات', 4),
    U(7, 'رنا الشمري', 'DIRECTOR', 'مدير إدارة التسويق', 2),
    U(8, 'كرار الموسوي', 'MANAGER', 'مدير قسم المحتوى', 7),
    U(9, 'دعاء الفتلاوي', 'EMPLOYEE', 'مصممة', 8),
  ];
  const DEPT = { 1: 'الإدارة العليا', 2: 'العمليات', 3: 'المبيعات', 4: 'المبيعات', 5: 'المبيعات', 6: 'المالية', 7: 'التسويق', 8: 'التسويق', 9: 'التسويق' };
  users.forEach(u => { u.department = DEPT[u.id]; });
  const byId = id => users.find(u => u.id === id);
  const kids = id => users.filter(u => u.managerId === id);
  function desc(id) { const out = new Set(); const st = [id]; while (st.length) for (const k of kids(st.pop())) { out.add(k.id); st.push(k.id); } return out; }
  function anc(id) { const out = []; let c = byId(id); while (c && c.managerId) { c = byId(c.managerId); if (c) out.push(c); } return out; }
  const scopeOf = u => (u.role === 'CEO' ? new Set(users.map(x => x.id)) : new Set([u.id, ...desc(u.id)]));
  const person = id => { const u = byId(id); return u ? { id: u.id, name: u.name, role: u.role } : null; };

  let seq = 100;
  const tasks = [
    { id: 1, title: 'متابعة عملاء الربع الرابع', description: 'الاتصال بالعملاء الحاليين وتحديد فرص التجديد.', status: 'IN_PROGRESS', priority: 'HIGH', progress: 40, dueDate: day(3), assigneeId: 5, creatorId: 4, goalId: null, comments: [{ id: 1, userId: 4, body: 'ابدأ بالعملاء الكبار أولاً.', createdAt: now() }] },
    { id: 2, title: 'تحديث قائمة الأسعار', description: null, status: 'TODO', priority: 'MEDIUM', progress: 0, dueDate: day(-2), assigneeId: 5, creatorId: 4, goalId: null, comments: [] },
    { id: 3, title: 'مطابقة كشوفات الشهر', description: null, status: 'REVIEW', priority: 'URGENT', progress: 90, dueDate: day(1), assigneeId: 6, creatorId: 4, goalId: null, comments: [] },
    { id: 4, title: 'أرشفة فواتير الربع الثالث', description: null, status: 'DONE', priority: 'LOW', progress: 100, dueDate: null, assigneeId: 6, creatorId: 4, goalId: null, comments: [], completedAt: now() },
    { id: 5, title: 'خطة مبيعات فريق الجنوب', description: 'خطة الربع القادم بأهداف شهرية.', status: 'IN_PROGRESS', priority: 'HIGH', progress: 25, dueDate: day(7), assigneeId: 4, creatorId: 3, goalId: 2, comments: [] },
    { id: 6, title: 'مراجعة هدف المبيعات السنوي', description: null, status: 'TODO', priority: 'MEDIUM', progress: 0, dueDate: day(10), assigneeId: 3, creatorId: 2, goalId: null, comments: [] },
    { id: 7, title: 'تصميم حملة نهاية السنة', description: null, status: 'IN_PROGRESS', priority: 'HIGH', progress: 60, dueDate: day(5), assigneeId: 9, creatorId: 8, goalId: null, comments: [] },
    { id: 8, title: 'جدول المحتوى الشهري', description: null, status: 'TODO', priority: 'MEDIUM', progress: 0, dueDate: day(-1), assigneeId: 8, creatorId: 7, goalId: null, comments: [] },
  ];
  /* ── المهام على طريقة Jira: أنواع/أرقام/سباقات (بيانات تجريبية) ── */
  const sprints = [
    { id: 1, name: 'Sprint 12', goal: 'إغلاق عقود الربع الرابع', state: 'ACTIVE', projectId: null, startDate: day(-4), endDate: day(10), closedAt: null },
    { id: 2, name: 'Sprint 13', goal: null, state: 'PLANNED', projectId: null, startDate: null, endDate: null, closedAt: null },
  ];
  const worklogs = [], links = [], watchers = [], history = [];
  Object.assign(tasks[0], { issueType: 'STORY', labels: ['عملاء', 'مبيعات'], storyPoints: 5, sprintId: 1, estimateMin: 960 });
  Object.assign(tasks[1], { issueType: 'BUG', labels: ['أسعار'], storyPoints: 2, sprintId: 1, parentId: 5 });
  Object.assign(tasks[2], { issueType: 'TASK', labels: ['مالية'], storyPoints: 3, sprintId: 1 });
  Object.assign(tasks[4], { issueType: 'EPIC', labels: ['خطة'], storyPoints: null, sprintId: null });
  Object.assign(tasks[5], { issueType: 'TASK', storyPoints: 1, sprintId: 2 });
  tasks[0].coverUrl = tasks[6].coverUrl = 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22%3E%3Crect width=%22400%22 height=%22200%22 fill=%22%234f46e5%22/%3E%3Ccircle cx=%22200%22 cy=%22100%22 r=%2256%22 fill=%22%23fff%22 opacity=%22.85%22/%3E%3C/svg%3E';
  Object.assign(tasks[6], { issueType: 'STORY', labels: ['تسويق'], storyPoints: 8, sprintId: 1, parentId: 5 });
  const wlSeed = () => { if (!worklogs.length) worklogs.push({ id: 9001, taskId: 1, userId: 5, minutes: 150, note: 'اتصالات العملاء', workedOn: day(-1), createdAt: now() }); };
  wlSeed();
  const goals = [
    { id: 1, ownerId: 1, parentId: null, title: 'نمو الإيرادات 20% هذه السنة', description: null, period: '2026-FY', status: 'ACTIVE', keyResults: [{ id: 1, title: 'إجمالي الإيرادات', target: 120000, current: 78000, unit: 'مليون' }] },
    { id: 2, ownerId: 3, parentId: 1, title: 'رفع مبيعات المنطقة الجنوبية', description: null, period: '2026-Q4', status: 'ACTIVE', keyResults: [{ id: 2, title: 'عقود جديدة', target: 30, current: 12, unit: null }, { id: 3, title: 'معدل الاحتفاظ بالعملاء', target: 90, current: 82, unit: '%' }] },
    { id: 3, ownerId: 5, parentId: 2, title: 'إغلاق 8 عقود جديدة', description: null, period: '2026-Q4', status: 'ACTIVE', keyResults: [{ id: 4, title: 'عقود مغلقة', target: 8, current: 3, unit: null }] },
    { id: 4, ownerId: 7, parentId: 1, title: 'مضاعفة التفاعل على القنوات', description: null, period: '2026-Q4', status: 'ACTIVE', keyResults: [{ id: 5, title: 'متابعون جدد', target: 5000, current: 1800, unit: null }] },
  ];
  const requests = [
    { id: 1, requesterId: 5, type: 'EXPENSE', title: 'ضيافة اجتماع عميل', details: 'غداء عمل مع وفد شركة الرافدين.', amount: 150000, startDate: null, endDate: null, status: 'PENDING', currentApproverId: 4, createdAt: now(), steps: [] },
    { id: 2, requesterId: 4, type: 'PURCHASE', title: 'شراء 4 أجهزة لابتوب للفريق', details: null, amount: 6000000, startDate: null, endDate: null, status: 'PENDING', currentApproverId: 3, createdAt: now(), steps: [] },
    { id: 3, requesterId: 6, type: 'LEAVE', title: 'إجازة اعتيادية', details: null, amount: null, startDate: day(10), endDate: day(14), status: 'APPROVED', currentApproverId: null, createdAt: now(), decidedAt: now(), steps: [{ approverId: 4, decision: 'APPROVED', note: null, createdAt: now() }] },
  ];
  const audit = [
    { id: 3, actor: 'نور الساعدي', action: 'goal.create', entity: 'goal', entityId: 2, meta: { ownerId: 3 }, createdAt: now() },
    { id: 2, actor: 'حسن الكعبي', action: 'task.create', entity: 'task', entityId: 1, meta: { assigneeId: 5 }, createdAt: now() },
    { id: 1, actor: 'علي الحسيني', action: 'user.create', entity: 'user', entityId: 3, meta: { role: 'DIRECTOR' }, createdAt: now() },
  ];
  function cycleNow() { const d = new Date(); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); }
  const at = (off, hm) => { const d = new Date(); d.setDate(d.getDate() + off); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const att = (ids, resp) => ids.map((id, i) => ({ userId: id, response: resp ? resp[i] : 'PENDING' }));
  const events = [
    { id: 1, type: 'MEETING', title: 'اجتماع مراجعة المبيعات', description: '1) أرقام الأسبوع\n2) العقود المتعثرة\n3) خطة الأسبوع القادم', location: 'قاعة الاجتماعات 2', startAt: at(1, '10:00'), endAt: at(1, '11:00'), allDay: false, companyWide: false, creatorId: 3, attendees: att([3, 4, 5, 6], ['ACCEPTED', 'PENDING', 'PENDING', 'ACCEPTED']) },
    { id: 2, type: 'MEETING', title: 'اجتماع الفريق الأسبوعي', description: null, location: 'Google Meet', startAt: at(0, '13:00'), endAt: at(0, '14:00'), allDay: false, companyWide: false, recurrence: 'WEEKLY', recurUntil: null, creatorId: 4, attendees: att([4, 5, 6], ['ACCEPTED', 'ACCEPTED', 'PENDING']) },
    { id: 3, type: 'APPOINTMENT', title: 'موعد مع عميل — شركة الرافدين', description: 'عرض العقد الجديد.', location: 'مقر العميل', startAt: at(3, '11:30'), endAt: at(3, '12:30'), allDay: false, companyWide: false, creatorId: 5, attendees: att([5, 4], ['ACCEPTED', 'PENDING']) },
    { id: 4, type: 'EVENT', title: 'يوم الشركة السنوي', description: 'فعالية للموظفين وعائلاتهم.', location: 'نادي الصيد', startAt: at(9, '00:00'), endAt: at(9, '23:59'), allDay: true, companyWide: true, creatorId: 1, attendees: att([1], ['ACCEPTED']) },
    { id: 5, type: 'HOLIDAY', title: 'عطلة رسمية', description: null, location: null, startAt: at(14, '00:00'), endAt: at(14, '23:59'), allDay: true, companyWide: true, creatorId: 1, attendees: att([1], ['ACCEPTED']) },
    { id: 6, type: 'MEETING', title: 'مراجعة الميزانية الفصلية', description: null, location: 'قاعة الإدارة', startAt: at(2, '09:00'), endAt: at(2, '10:30'), allDay: false, companyWide: false, creatorId: 2, attendees: att([2, 3, 7, 1], ['ACCEPTED', 'ACCEPTED', 'PENDING', 'ACCEPTED']) },
  ];
  const projects = [
    { id: 1, name: 'إطلاق خدمة الاشتراكات', description: 'نقل العقود الشهرية إلى اشتراكات سنوية.', status: 'ACTIVE', ownerId: 3, startDate: day(-30), endDate: day(45) },
    { id: 2, name: 'حملة نهاية السنة', description: null, status: 'ACTIVE', ownerId: 7, startDate: day(-10), endDate: day(30) },
    { id: 3, name: 'أتمتة المطابقة المالية', description: null, status: 'PLANNING', ownerId: 2, startDate: null, endDate: null },
    { id: 4, name: 'المهام العامة', description: null, status: 'ACTIVE', ownerId: 1, startDate: null, endDate: null, key: 'TSK' },
  ];
  /* لكل مساحة بادئة وخلفية خاصة بها */
  Object.assign(projects[0], { key: 'SUB', background: 'linear-gradient(135deg,#1E3C72,#2A5298)', settings: { fields: [], perms: { users: {}, roles: {} } } });
  Object.assign(projects[1], { key: 'CMP', background: 'linear-gradient(135deg,#232526,#414345)', settings: { fields: [], perms: { users: {}, roles: {} } } });
  Object.assign(projects[2], { key: 'FIN', background: 'linear-gradient(135deg,#134E5E,#2d3a40)', settings: { fields: [], perms: { users: {}, roles: {} } } });
  Object.assign(projects[3], { background: 'linear-gradient(135deg,#2b2c2f,#3d3f45)', settings: { fields: [], perms: { users: {}, roles: {} } } });
  tasks.forEach(t => { t.projectId = ({ 1: 1, 2: 1, 5: 1, 7: 2 })[t.id] || 4; });
  const announcements = [
    { id: 1, title: 'مواعيد الدوام خلال الشهر القادم', body: 'سيكون الدوام من 8:30 إلى 3:30 ابتداءً من الأسبوع القادم.\nيرجى الالتزام بتسجيل الحضور يومياً.', audience: 'COMPANY', pinned: true, authorId: 1, createdAt: now() },
    { id: 2, title: 'نتائج مبيعات الربع الثالث', body: 'تجاوز فريق الجنوب المستهدف بنسبة 8%، شكراً لجهود الجميع.', audience: 'TEAM', pinned: false, authorId: 3, createdAt: now() },
  ];
  const attendance = [];
  [-4, -3, -2, -1].forEach(o => [4, 5, 6].forEach(uid => attendance.push({ userId: uid, date: day(o), checkIn: at(o, '08:' + (30 + uid)), checkOut: at(o, '15:3' + (uid % 5)) })));
  attendance.push({ userId: 5, date: day(0), checkIn: at(0, '08:41'), checkOut: null });
  attendance.push({ userId: 5, date: day(-5), checkIn: at(-5, '09:12'), checkOut: at(-5, '15:30') });
  attendance.push({ userId: 6, date: day(-6), checkIn: at(-6, '08:25'), checkOut: at(-6, '17:05') });
  /* بيانات تجريبية لتقرير الموارد البشرية: حضور متنوّع بالأيام الماضية + إجازة بدون راتب + رواتب */
  [4, 5, 6, 8, 9].forEach(uid => { for (let o = -20; o <= -7; o++) { const dt = new Date(); dt.setDate(dt.getDate() + o); const wd = dt.getDay(); if (wd === 5 || wd === 6) continue; if (uid === 5 && (o === -11 || o === -12 || o === -14)) continue; if (uid === 6 && o === -9) continue; if (attendance.some(a => a.userId === uid && a.date === day(o))) continue; attendance.push({ userId: uid, date: day(o), checkIn: at(o, '08:' + String(30 + ((uid * 7 + o * 3 + 90) % 25)).padStart(2, '0')), checkOut: at(o, '15:' + String(30 + ((uid + o + 90) % 40)).padStart(2, '0')) }); } });
  requests.push({ id: 901, requesterId: 5, type: 'LEAVE', leaveType: 'unpaid', title: 'إجازة بدون راتب', details: null, amount: null, startDate: day(-12), endDate: day(-11), status: 'APPROVED', currentApproverId: null, createdAt: now(), decidedAt: now(), steps: [] });
  const SALARY = { 1: 6000000, 2: 4500000, 3: 3500000, 4: 2500000, 5: 1500000, 6: 1500000, 7: 3500000, 8: 2200000, 9: 1400000 };
  const logA = (who, action, entity, entityId, meta) => audit.unshift({ id: ++seq, actor: who.name, action, entity, entityId, meta, createdAt: now() });

  /* المستخدم الحالي للمعاينة */
  let meId = 4;
  try { meId = +localStorage.getItem('pv-user') || 4; } catch (e) {}
  const me = () => byId(meId);
  const err = (status, error) => ({ status, body: { error } });
  const ok = (body, status = 200) => ({ status: body === null ? 204 : status, body });
  const orgPerm = {};            // تعديلات المسؤول على الحد الأدنى للدور
  const denied = {};
  const extra = {};              // صلاحيات إضافية فردية: userId → [perms]
  const admins = new Set([1]);   // مسؤولو النظام
  const minOf = p => orgPerm[p] ?? MIN[p] ?? 99;
  const can = (u, p) => (p === 'admin' ? admins.has(u.id) : ((LEVEL[u.role] >= minOf(p) || (extra[u.id] || []).includes(p)) && !(denied[u.id] || []).includes(p)));
  org.permissions = orgPerm;
  org.settings = { timezone: 'Asia/Baghdad', weekStart: 0, workDays: [0, 1, 2, 3, 4], workStart: '08:30', workEnd: '15:30', leaveDefault: 30, passwordMin: 8, sessionDays: 14, inviteDays: 7, requireApprovalNote: false, graceMinutes: 10, labels: {},
    leaveTypes: [{ key: 'annual', name: 'سنوية', days: null, paid: true }, { key: 'sick', name: 'مرضية', days: 15, paid: true }, { key: 'unpaid', name: 'بدون راتب', days: null, paid: false }] };
  const notifs = [
    { id: 1, userId: 5, type: 'TASK', actor: 'حسن الكعبي', text: 'حسن الكعبي كلّفك بمهمة: متابعة عملاء الربع الرابع', link: '#/tasks', read: false, createdAt: now() },
    { id: 2, userId: 4, type: 'REQUEST', actor: 'زينب التميمي', text: 'زينب التميمي قدّم طلباً بانتظار موافقتك: ضيافة اجتماع عميل', link: '#/requests', read: false, createdAt: now() },
    { id: 3, userId: 4, type: 'MENTION', actor: 'نور الساعدي', text: 'نور الساعدي أشار إليك في «خطة مبيعات فريق الجنوب»', link: '#/tasks?open=5', read: false, createdAt: now() },
    { id: 4, userId: 4, type: 'EVENT', actor: 'نور الساعدي', text: 'نور الساعدي دعاك إلى: اجتماع مراجعة المبيعات', link: '#/calendar', read: true, createdAt: now() },
    { id: 5, userId: 5, type: 'MENTION', actor: 'حسن الكعبي', text: 'حسن الكعبي أشار إليك في «تحديث قائمة الأسعار»', link: '#/tasks?open=2', read: false, createdAt: now() },
  ];
  const invites = [
    { id: 1, email: 'sara.k@example.com', name: 'سارة كامل', role: 'EMPLOYEE', managerId: 4, title: 'مسؤولة مبيعات', department: 'المبيعات', status: 'PENDING', expiresAt: new Date(Date.now() + 5 * 864e5).toISOString(), createdAt: now() },
    { id: 2, email: 'omar@example.com', name: null, role: 'MANAGER', managerId: 3, title: null, department: 'المبيعات', status: 'ACCEPTED', expiresAt: new Date(Date.now() + 2 * 864e5).toISOString(), createdAt: now() },
  ];
  const platformOrgs = [
    { id: 1, name: 'شركة النخبة (معاينة)', users: 9, tasks: 8, suspended: false, createdAt: now() },
    { id: 2, name: 'مؤسسة الرافدين للتجارة', users: 24, tasks: 131, suspended: false, createdAt: now() },
    { id: 3, name: 'مكتب الأمل الهندسي', users: 11, tasks: 47, suspended: true, createdAt: now() },
  ];

  /* حفظ الحالة بالمتصفح حتى تبقى التعديلات عند تبديل المستخدم (لتجربة الإشارات بين موظفين) */
  const PKEY = 'pv-state-v5';
  const requestComments = [];
  const reviews = [
    { id: 1, cycle: cycleNow(), employeeId: 5, reviewerId: 4, status: 'SUBMITTED', ratings: { quality: 4, delivery: 3, teamwork: 5, initiative: 4, communication: 4 }, overall: 4, strengths: 'تعاون ممتاز مع الفريق وسرعة بتعلّم أدوات العمل.', improvements: 'الالتزام بمواعيد التسليم في الأسبوع الأخير من الشهر.', nextGoals: 'إغلاق 10 عقود ورفع الاحتفاظ بالعملاء إلى 90%.', employeeComment: null, submittedAt: now(), acknowledgedAt: null },
    { id: 2, cycle: cycleNow(), employeeId: 6, reviewerId: 4, status: 'DRAFT', ratings: { quality: 4 }, overall: null, strengths: null, improvements: null, nextGoals: null, employeeComment: null, submittedAt: null, acknowledgedAt: null },
  ];
  const policies = [
    { id: 1, title: 'سياسة الدوام والإجازات', category: 'الموارد البشرية', body: 'ساعات الدوام الرسمية من 8:30 إلى 15:30 من الأحد إلى الخميس.\nتُقدَّم طلبات الإجازة قبل 3 أيام عمل على الأقل عبر النظام.\nالإجازة المرضية تحتاج تقريراً طبياً عند تجاوز يومين.', requireAck: true, version: 1, authorId: 1, updatedAt: now(), createdAt: now() },
    { id: 2, title: 'دليل السلوك المهني', category: 'الموارد البشرية', body: 'نلتزم بالاحترام والسرّية والنزاهة بالتعامل مع الزملاء والعملاء.\nلا يُستخدم اسم الشركة بأي نشاط شخصي دون إذن.', requireAck: true, version: 2, authorId: 1, updatedAt: now(), createdAt: now() },
    { id: 3, title: 'إجراءات الشراء والمصروفات', category: 'المالية', body: 'كل مصروف يُقدَّم كطلب بالنظام مع المرفقات الداعمة.\nالموافقة حسب حدود الاعتماد المعلنة بإعدادات الشركة.', requireAck: false, version: 1, authorId: 2, updatedAt: now(), createdAt: now() },
  ];
  const policyAcks = [{ policyId: 1, userId: 5, version: 1, at: now() }, { policyId: 1, userId: 4, version: 1, at: now() }, { policyId: 2, userId: 4, version: 1, at: now() }];
  const webhooks = [{ id: 1, url: 'https://hooks.example.com/routini', events: ['task.done', 'request.approved'], active: true, lastStatus: 200, lastAt: now() }];
  const files = [];            // مرفقات: {id, entity, entityId, name, mime, size, uploaderId, createdAt, url (data URL)}
  const projectComments = [];
  const boardsArr = [];
  const arrays = { boardsArr, sprints, worklogs, links, watchers, history, users, tasks, goals, requests, audit, events, projects, announcements, attendance, notifs, invites, platformOrgs, files, projectComments, requestComments, reviews, policies, policyAcks, webhooks };
  try {
    const p = JSON.parse(localStorage.getItem(PKEY));
    if (p) {
      for (const [k, arr] of Object.entries(arrays)) if (Array.isArray(p[k])) { arr.length = 0; p[k].forEach(x => arr.push(x)); }
      Object.assign(org, p.org || {});
      Object.keys(orgPerm).forEach(k => delete orgPerm[k]); Object.assign(orgPerm, p.orgPerm || {});
      Object.assign(extra, p.extra || {});
      admins.clear(); (p.admins || [1]).forEach(a => admins.add(a));
      if (p.seq) seq = p.seq;
    }
  } catch (e) {}
  org.permissions = orgPerm;
  const savePV = () => { try { localStorage.setItem(PKEY, JSON.stringify({ ...arrays, org, orgPerm, extra, admins: [...admins], seq })); } catch (e) {} };

  const leaveBal = usr => (org.settings.leaveTypes || []).map(t => {
    const used = requests.filter(r => r.requesterId === usr.id && r.type === 'LEAVE' && r.status === 'APPROVED' && (r.leaveType || 'annual') === t.key)
      .reduce((s, r) => s + Math.round((new Date(r.endDate) - new Date(r.startDate)) / 864e5) + 1, 0);
    const ent = t.key === 'annual' ? (usr.leaveEntitlement ?? 30) : t.days;
    return { key: t.key, name: t.name, paid: t.paid !== false, entitlement: ent, used, remaining: ent == null ? null : ent - used };
  });
  const hmMin = hm => { const m = /^(\d\d):(\d\d)$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const attMetrics = (rec, usr) => {
    const st = hmMin(usr.shiftStart) ?? hmMin(org.settings.workStart) ?? 510, en = hmMin(usr.shiftEnd) ?? hmMin(org.settings.workEnd) ?? 930;
    const ci = new Date(rec.checkIn), co = rec.checkOut ? new Date(rec.checkOut) : null;
    const inM = ci.getHours() * 60 + ci.getMinutes(), outM = co ? co.getHours() * 60 + co.getMinutes() : null;
    const late = inM - st;
    return { lateMin: late > (org.settings.graceMinutes ?? 10) ? late : 0, earlyMin: outM != null && outM < en ? en - outM : 0, overtimeMin: outM != null && outM - en >= 15 ? outM - en : 0,
      workedMin: co ? Math.round((co - ci) / 60000) : null };
  };
  /* صلاحيات المساحات: users/roles → NONE|VIEW|MOVE|EDIT */
  const ALLC = ['view', 'create', 'edit', 'move', 'assign', 'comment', 'delete', 'manageBoard'];
  const PRESETC = { OWNER: ALLC, MANAGER: ['view', 'create', 'edit', 'move', 'assign', 'comment'], EDITOR: ['view', 'create', 'edit', 'move', 'comment'], MOVER: ['view', 'move', 'comment'], COMMENTER: ['view', 'comment'], VIEWER: ['view'], HIDDEN: [], NONE: [], VIEW: ['view'], MOVE: ['view', 'move', 'comment'], EDIT: ['view', 'create', 'edit', 'move', 'assign', 'comment', 'delete'] };
  const capsOfM = e => (e == null || e === '' ? null : typeof e === 'string' ? (PRESETC[e] || null) : (Array.isArray(e.caps) ? e.caps : null));
  /* خصائص المستخدم على لوحة/مساحة (null = لا قاعدة) */
  const spCaps = (u, pid) => { if (!pid || can(u, 'admin')) return null; const p = projects.find(x => x.id === pid); const pm = ((p && p.settings) || {}).perms || {}; return capsOfM((pm.users || {})[u.id] ?? (pm.roles || {})[u.role]); };
  const spHas = (u, pid, cap) => { const c = spCaps(u, pid); return !c || c.includes(cap); };
  const taskVisible = (u, sc) => t => { const c = spCaps(u, t.projectId); if (c && !c.includes('view')) return false; return sc.has(t.assigneeId) || t.creatorId === u.id || !!(c && c.includes('view')); };
  const PROJ_KEYS = { 1: 'SUB', 2: 'CMP', 3: 'FIN' };
  const projKey = p => (p && (p.key || PROJ_KEYS[p.id])) || (p ? 'P' + p.id : null);
  const DEF_PREFIX = () => ((org.settings && org.settings.taskKey) || 'TSK').toUpperCase();
  const ensureKey = t => {
    if (!t.keyPrefix) { const p = t.projectId ? projects.find(x => x.id === t.projectId) : null; t.keyPrefix = (p && projKey(p)) || DEF_PREFIX(); }
    if (!t.number) t.number = Math.max(0, ...tasks.filter(x => x.keyPrefix === t.keyPrefix).map(x => x.number || 0)) + 1;
    return t;
  };
  const keyOfT = t => { ensureKey(t); return t.keyPrefix + '-' + t.number; };
  /* عيّنات للأرشيف: مهمتان منجزتان منذ أكثر من 90 يوماً بلوحة «المهام العامة» (تُضاف مرة واحدة) */
  if (!tasks.some(t => t.demoOld)) {
    const ago = d => new Date(Date.now() - d * 864e5).toISOString();
    [['تجهيز عرض الربع الأول', 130], ['جرد المستودع السنوي', 104]].forEach(([title, d]) => {
      const t = { id: ++seq, title, description: null, status: 'DONE', priority: 'MEDIUM', progress: 100, dueDate: null, assigneeId: 1, creatorId: 1, goalId: null, comments: [], projectId: 4, completedAt: ago(d), createdAt: ago(d + 20), demoOld: true };
      tasks.push(t);
    });
  }  tasks.forEach(ensureKey);
  const taskBrief = t => t ? { id: t.id, key: keyOfT(t), title: t.title, issueType: t.issueType || 'TASK', status: t.status } : null;
  const sprintOf = id => { const s = sprints.find(x => x.id === id); return s ? { id: s.id, name: s.name, state: s.state } : null; };
  const taskJSON = t => ({
    id: t.id, key: keyOfT(t), title: t.title, description: t.description, status: t.status, priority: t.priority, progress: t.progress,
    issueType: t.issueType == null ? '' : t.issueType, labels: t.labels || [], storyPoints: t.storyPoints ?? null, estimateMin: t.estimateMin ?? null,
    startDate: t.startDate || null, parentId: t.parentId || null, parent: taskBrief(tasks.find(x => x.id === t.parentId)),
    sprintId: t.sprintId || null, sprint: sprintOf(t.sprintId),
    dueDate: t.dueDate, goalId: t.goalId, projectId: t.projectId || null,
    project: t.projectId ? (p => ({ id: p.id, name: p.name, key: projKey(p) }))(projects.find(x => x.id === t.projectId) || { id: t.projectId, name: '' }) : null,
    assignee: person(t.assigneeId), creator: person(t.creatorId), createdAt: t.createdAt || now(), updatedAt: now(),
    completedAt: t.completedAt || null, comments: t.comments.length, children: tasks.filter(x => x.parentId === t.id).length,
    recurrence: t.recurrence || null,
    customFields: t.customFields || {}, coverFileId: t.coverFileId || null, coverUrl: t.coverFileId ? ((files.find(f => f.id === t.coverFileId) || {}).url || null) : null, timer: t.timerUserId ? { userId: t.timerUserId, startedAt: t.timerStartedAt } : null,
    checklist: { done: (t.items || []).filter(i => i.done).length, total: (t.items || []).length },
  });
  const logH = (taskId, userId, field, from, to) => { if (String(from ?? '') !== String(to ?? '')) history.unshift({ id: ++seq, taskId, userId, field, from: from ?? null, to: to ?? null, createdAt: now() }); };
  const evJSON = (e, myId) => ({ id: e.id, type: e.type, customType: e.customType || null, title: e.title, description: e.description, location: e.location, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, companyWide: e.companyWide, recurrence: e.recurrence || null, recurEvery: e.recurEvery || null, recurUntil: e.recurUntil || null, creator: person(e.creatorId), attendees: e.attendees.map(a => ({ id: a.userId, name: byId(a.userId).name, response: a.response })), myResponse: (e.attendees.find(a => a.userId === myId) || {}).response || null });
  const krProgress = g => (g.keyResults.length ? Math.round(g.keyResults.reduce((s, k) => s + Math.min(k.current / k.target, 1), 0) / g.keyResults.length * 100) : 0);
  const goalJSON = (g, sc) => ({ id: g.id, title: g.title, description: g.description, period: g.period, status: g.status, parentId: g.parentId, owner: person(g.ownerId), editable: sc.has(g.ownerId), progress: krProgress(g), keyResults: g.keyResults, tasks: tasks.filter(t => t.goalId === g.id).length });
  const reqJSON = r => ({ ...r, leaveType: r.leaveType || null, comments: requestComments.filter(c => c.requestId === r.id).length, amount: r.amount, requester: person(r.requesterId), currentApprover: person(r.currentApproverId), steps: r.steps.map(s => ({ approver: person(s.approverId), decision: s.decision, note: s.note, createdAt: s.createdAt })) });
  const limitOk = (role, r) => r.type === 'LEAVE' || role === 'CEO' || r.amount <= (org.approvalLimits[role] ?? 0);
  const nearest = id => anc(id).find(a => a.active) || null;

  function summarize(list) {
    const open = list.filter(t => t.status !== 'DONE');
    const overdue = open.filter(t => t.dueDate && t.dueDate < day(0)).length;
    return { open: open.length, overdue, urgent: open.filter(t => t.priority === 'URGENT').length, inReview: open.filter(t => t.status === 'REVIEW').length, done30: list.length - open.length, completion: list.length ? Math.round((list.length - open.length) / list.length * 100) : null };
  }

  const DEMO_EMAIL = 'demo@routini.test', DEMO_PASS = 'Demo@2026';
  const ACCOUNTS = { 'demo@routini.test': ['Demo@2026', 1], 'reviewer@routini.test': ['Review@2026', 1] };   // حسابات التجربة (المدقّق يدخل بصلاحية المدير التنفيذي لرؤية كل شيء)
  const authed = () => { try { return localStorage.getItem('pv-auth') === '1'; } catch (e) { return false; } };
  function authRoute(method, path, body) {
    if (path === '/api/auth/login' && method === 'POST') {
      const acc = ACCOUNTS[String(body.email || '').trim().toLowerCase()];
      if (acc && body.password === acc[0]) {
        try { localStorage.setItem('pv-auth', '1'); localStorage.setItem('pv-user', String(acc[1])); } catch (e) {}
        return ok({ id: acc[1], name: 'سارة الجبوري', email: String(body.email).trim().toLowerCase(), role: 'CEO' });
      }
      return err(401, 'البريد أو كلمة المرور غير صحيحة');
    }
    if (path === '/api/auth/register-company' && method === 'POST') {
      try { localStorage.setItem('pv-auth', '1'); localStorage.setItem('pv-user', '1'); } catch (e) {}
      return ok({ id: 1, name: body.name || 'سارة الجبوري', email: body.email || DEMO_EMAIL, role: 'CEO' }, 201);
    }
    if (path === '/api/auth/logout') { try { localStorage.removeItem('pv-auth'); } catch (e) {} return ok(null); }
    if (path.startsWith('/api/auth/invite/')) return err(404, 'رابط الدعوة غير صالح أو منتهي (وضع التجربة)');
    return null;
  }

  function handle(method, url, body) {
    { const p0 = url.split('?')[0]; const a = authRoute(method, p0, body); if (a) return a; if (!authed()) return err(401, 'يجب تسجيل الدخول'); }
    const u = me(), sc = scopeOf(u);
    const [path, qs] = url.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    let m;

    if (path === '/api/me' && method === 'GET') return ok({
      user: { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, department: u.department, phone: u.phone || null, managerId: u.managerId, mustChangePassword: false, isAdmin: admins.has(u.id) },
      org, level: LEVEL[u.role], perms: [...Object.keys(MIN).filter(p => can(u, p)), ...(admins.has(u.id) ? ['admin'] : [])],
      permCatalog: CATALOG, platformAdmin: u.id === 1, notifyPrefs: u.notifyPrefs || {},
    });
    if (path === '/api/me' && method === 'PATCH') {
      if (body.name) u.name = body.name;
      if (body.phone !== undefined) u.phone = body.phone;
      if (body.notifyPrefs) u.notifyPrefs = { ...(u.notifyPrefs || {}), ...body.notifyPrefs };
      return ok(null);
    }
    if (path === '/api/me/password') return ok(null);
    if (path === '/api/auth/logout') return ok(null);
    if (path === '/api/notifications' && method === 'GET') {
      const mine = notifs.filter(n => n.userId === u.id).sort((a, b) => b.id - a.id);
      return ok({ unread: mine.filter(n => !n.read).length, unreadMentions: mine.filter(n => !n.read && n.type === 'MENTION').length, items: mine.slice(0, 40).map(n => ({ id: n.id, type: n.type, actor: n.actor, text: n.text, link: n.link, read: n.read, createdAt: n.createdAt })) });
    }
    if (path === '/api/notifications/read') {
      notifs.forEach(n => { if (n.userId === u.id && (!body.ids || body.ids.includes(n.id))) n.read = true; });
      return ok(null);
    }
    if (path === '/api/push/key') return ok({ key: null });
    if (path === '/api/push/subscribe' || path === '/api/push/unsubscribe') return ok(null);

    if (path === '/api/users' && method === 'GET') {
      const vis = new Set(sc); anc(u.id).forEach(a => vis.add(a.id));
      const isAdm = can(u, 'admin'), manage = can(u, 'users.manage') || isAdm;
      const full = isAdm ? new Set(users.map(x => x.id)) : vis;
      const lvl = isAdm ? 5 : LEVEL[u.role];
      return ok(users.filter(x => full.has(x.id)).map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title, department: x.department, managerId: x.managerId, active: x.active, inScope: sc.has(x.id),
        canManage: manage && (isAdm || sc.has(x.id)) && x.id !== u.id && LEVEL[x.role] < lvl,
        ...((isAdm || sc.has(x.id)) && manage ? { email: x.email, lastLoginAt: x.lastLoginAt, mustChangePassword: false, leaveEntitlement: x.leaveEntitlement ?? 30 } : {}) })));
    }
    if (path === '/api/users' && method === 'POST') {
      if (!can(u, 'users.manage')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      { const mx = (platformOrgs[0] || {}).maxUsers; if (mx != null && users.filter(x => x.active).length + invites.filter(i => i.status === 'PENDING').length >= mx) return err(409, 'وصلت الشركة للحد الأقصى من المستخدمين (' + mx + '). عطّل مستخدماً أو تواصل مع مزوّد المنصة لزيادة العدد.'); }
      if (LEVEL[body.role] >= (can(u, 'admin') ? 5 : LEVEL[u.role])) return err(403, 'ما تقدر تعطي دور بمستواك أو أعلى');
      if (!can(u, 'admin') && !sc.has(body.managerId)) return err(403, 'الرئيس المباشر خارج نطاقك');
      const n = U(++seq, body.name, body.role, body.title || null, body.managerId); n.email = body.email; n.department = body.department || null; if (body.leaveEntitlement != null) n.leaveEntitlement = body.leaveEntitlement; users.push(n);
      logA(u, 'user.create', 'user', n.id, { role: n.role });
      return ok({ id: n.id, tempPassword: 'Xk3p9Qa7Lm2z' }, 201);
    }
    if ((m = path.match(/^\/api\/users\/(\d+)$/)) && method === 'PATCH') {
      const t = byId(+m[1]);
      if (!t || !(can(u, 'admin') || sc.has(t.id))) return err(404, 'المستخدم غير موجود');
      if (body.role && LEVEL[body.role] >= (can(u, 'admin') ? 5 : LEVEL[u.role])) return err(403, 'ما تقدر تعطي دور بمستواك أو أعلى');
      if (body.active === false && kids(t.id).some(k => k.active)) return err(400, 'انقل فريق هذا المستخدم لرئيس ثاني قبل تعطيله');
      Object.assign(t, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
      logA(u, 'user.update', 'user', t.id, body);
      return ok(null);
    }
    if (path.match(/^\/api\/users\/\d+\/reset-password$/)) return ok({ tempPassword: 'Rt8vN2cWq5Yb' });

    if (path === '/api/dashboard') {
      const mine = tasks.filter(t => t.assigneeId === u.id);
      const myGoals = goals.filter(g => g.ownerId === u.id && g.status === 'ACTIVE');
      const out = { today: day(0), level: LEVEL[u.role], me: { ...summarize(mine), goals: myGoals.length, goalProgress: myGoals.length ? Math.round(myGoals.reduce((s, g) => s + krProgress(g), 0) / myGoals.length) : null, inbox: requests.filter(r => r.currentApproverId === u.id && r.status === 'PENDING').length, pendingRequests: requests.filter(r => r.requesterId === u.id && r.status === 'PENDING').length } };
      const inScope = tasks.filter(t => sc.has(t.assigneeId));
      if (can(u, 'team.view')) out.team = kids(u.id).filter(k => k.active).map(k => {
        const ids = new Set([k.id, ...desc(k.id)]); const gl = goals.filter(g => ids.has(g.ownerId) && g.status === 'ACTIVE');
        return { id: k.id, name: k.name, role: k.role, title: k.title, headcount: ids.size, ...summarize(inScope.filter(t => ids.has(t.assigneeId))), goalProgress: gl.length ? Math.round(gl.reduce((s, g) => s + krProgress(g), 0) / gl.length) : null };
      });
      if (can(u, 'org.view')) {
        const hc = {}; users.filter(x => x.active).forEach(x => { hc[x.role] = (hc[x.role] || 0) + 1; });
        const appr = requests.filter(r => r.status === 'APPROVED' && r.type !== 'LEAVE');
        out.org = { headcount: hc, tasks: summarize(inScope), approvedThisMonth: { count: appr.length, amount: appr.reduce((s, r) => s + r.amount, 0) }, pendingRequests: requests.filter(r => r.status === 'PENDING').length };
      }
      return ok(out);
    }

    /* المهام */
    if (path === '/api/tasks' && method === 'GET') {
      let list = tasks.filter(taskVisible(u, sc)).filter(t => !t.archivedAt);
      if (q.scope === 'mine' || !q.scope) list = list.filter(t => t.assigneeId === u.id);
      else if (q.scope === 'team') list = list.filter(t => t.assigneeId !== u.id && sc.has(t.assigneeId));
      return ok(list.map(taskJSON));
    }
    /* الأرشيف: منجزة منذ أكثر من 90 يوماً تُقترح على مسؤول اللوحة، وتُؤرشَف بموافقته ويمكن استرجاعها */
    {
      const ARCH_DAYS = 90;
      const isBoardAdminM = (usr, pid) => can(usr, 'admin') || ((spCaps(usr, pid) || []).includes('manageBoard'));
      const boardAdminsM = pid => users.filter(x => x.active !== false && (can(x, 'admin') || x.role === 'CEO' || (spCaps(x, pid) || []).includes('manageBoard')));
      if (path === '/api/tasks/archive-candidates' && method === 'GET') {
        const pid = +q.projectId;
        if (!pid || !isBoardAdminM(u, pid)) return ok({ days: ARCH_DAYS, tasks: [] });
        const cut = Date.now() - ARCH_DAYS * 864e5;
        const list = tasks.filter(t => t.projectId === pid && !t.archivedAt && t.status === 'DONE' && t.completedAt && new Date(t.completedAt).getTime() < cut && taskVisible(u, sc)(t));
        if (list.length) {
          const link = '#/tasks?archive=' + (((boardsArr.find(b => (b.filters || {}).projectId === pid)) || {}).id || '');
          boardAdminsM(pid).forEach(a => {
            if (!notifs.some(n => n.userId === a.id && n.link === link && Date.now() - new Date(n.createdAt).getTime() < 7 * 864e5))
              notifs.push({ id: ++seq, userId: a.id, type: 'TASK', actor: 'الأرشيف', text: `${list.length} مهمة منجزة منذ أكثر من ${ARCH_DAYS} يوماً تنتظر موافقتك على نقلها للأرشيف`, link, read: false, createdAt: now() });
          });
          savePV();
        }
        return ok({ days: ARCH_DAYS, tasks: list.map(taskJSON) });
      }
      if (path === '/api/tasks/archive' && method === 'GET') {
        const pid = +q.projectId;
        return ok({ canRestore: isBoardAdminM(u, pid), tasks: tasks.filter(t => t.projectId === pid && t.archivedAt && taskVisible(u, sc)(t)).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt))).map(t => ({ ...taskJSON(t), archivedAt: t.archivedAt })) });
      }
      if ((path === '/api/tasks/archive' || path === '/api/tasks/unarchive') && method === 'POST') {
        const on = path.endsWith('/archive');
        let n = 0;
        (body.ids || []).forEach(id => { const t = tasks.find(x => x.id === +id); if (t && t.projectId && isBoardAdminM(u, t.projectId)) { if (on) { t.archivedAt = now(); t.archivedById = u.id; } else { t.archivedAt = null; t.archivedById = null; } n++; } });
        if (!n) return err(403, 'الأرشفة والاسترجاع لمسؤول اللوحة فقط');
        savePV(); return ok({ count: n });
      }
    }    if (path === '/api/task-labels') return ok([...new Set(tasks.flatMap(t => t.labels || []))].sort());
    if (path === '/api/tasks-search') {
      const s = (q.q || '').trim().toLowerCase();
      return ok(tasks.filter(taskVisible(u, sc)).filter(t => (!q.type || (t.issueType || 'TASK') === q.type) && (!s || keyOfT(t).toLowerCase() === s || t.title.toLowerCase().includes(s))).slice(0, 15).map(taskBrief));
    }
    if (path === '/api/tasks' && method === 'POST') {
      if (body.projectId && !spHas(u, body.projectId, 'create')) return err(403, 'صلاحيتك على هذه اللوحة لا تسمح بإنشاء مهام فيها');
      const aid = body.assigneeId || u.id;
      if (!sc.has(aid)) return err(403, 'تقدر تسند مهام لنفسك أو لمن تحتك فقط');
      if ((body.issueType || 'TASK') === 'SUBTASK' && !body.parentId) return err(400, 'المهمة الفرعية تحتاج مهمة أم');
      const t = { id: ++seq, title: body.title, description: body.description || null, status: 'TODO', priority: body.priority || 'MEDIUM', progress: 0, dueDate: body.dueDate || null, assigneeId: aid, creatorId: u.id, goalId: body.goalId || null, projectId: body.projectId || null, recurrence: body.recurrence || null,
        customFields: Object.fromEntries(Object.entries(body.customFields || {}).filter(([, v]) => v !== null && v !== '' && v !== false)), issueType: body.issueType == null ? '' : body.issueType, labels: body.labels || [], storyPoints: body.storyPoints ?? null, estimateMin: body.estimateMin ?? null, startDate: body.startDate || null, parentId: body.parentId || null, sprintId: body.sprintId || null, createdAt: now(),
        comments: [], items: (body.items || []).map((text, i) => ({ id: ++seq, text, done: false, position: i })) };
      ensureKey(t);
      tasks.push(t); logA(u, 'task.create', 'task', t.id, { assigneeId: aid });
      [u.id, aid].forEach(w => { if (!watchers.some(x => x.taskId === t.id && x.userId === w)) watchers.push({ taskId: t.id, userId: w }); });
      return ok({ id: t.id, key: keyOfT(t) }, 201);
    }
    /* السباقات */
    if (path === '/api/sprints' && method === 'GET') {
      return ok(sprints.map(s => { const ts = tasks.filter(t => t.sprintId === s.id); return { ...s, tasks: ts.length, done: ts.filter(t => t.status === 'DONE').length, points: ts.reduce((a, t) => a + (t.storyPoints || 0), 0), pointsDone: ts.filter(t => t.status === 'DONE').reduce((a, t) => a + (t.storyPoints || 0), 0) }; }));
    }
    if (path === '/api/sprints' && method === 'POST') {
      if (!can(u, 'team.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const s = { id: ++seq, name: body.name, goal: body.goal || null, state: 'PLANNED', projectId: body.projectId || null, startDate: body.startDate || null, endDate: body.endDate || null, closedAt: null };
      sprints.push(s); return ok({ id: s.id }, 201);
    }
    if ((m = path.match(/^\/api\/sprints\/(\d+)$/))) {
      const s = sprints.find(x => x.id === +m[1]);
      if (!s) return err(404, 'السباق غير موجود');
      if (!can(u, 'team.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (method === 'DELETE') {
        if (s.state === 'ACTIVE') return err(409, 'أغلق السباق الجاري أولاً');
        tasks.forEach(t => { if (t.sprintId === s.id) t.sprintId = null; });
        sprints.splice(sprints.indexOf(s), 1); return ok(null);
      }
      if (method === 'PATCH') {
        ['name', 'goal', 'startDate', 'endDate'].forEach(k => { if (body[k] !== undefined) s[k] = body[k]; });
        if (body.action === 'start') {
          if (s.state !== 'PLANNED') return err(409, 'السباق ليس بحالة تخطيط');
          const a = sprints.find(x => x.state === 'ACTIVE' && x.projectId === s.projectId);
          if (a) return err(409, 'يوجد سباق جارٍ: «' + a.name + '» — أغلقه أولاً');
          s.state = 'ACTIVE'; if (!s.startDate) s.startDate = day(0);
        }
        if (body.action === 'complete') {
          if (s.state !== 'ACTIVE') return err(409, 'السباق غير جارٍ');
          tasks.forEach(t => { if (t.sprintId === s.id && t.status !== 'DONE') { logH(t.id, u.id, 'sprint', s.name, body.moveTo ? '(سباق تالٍ)' : 'Backlog'); t.sprintId = body.moveTo || null; } });
          s.state = 'CLOSED'; s.closedAt = now();
        }
        return ok(null);
      }
    }
    /* لوحات المهام المتعددة */
    if (path === '/api/boards' && method === 'GET') {
      /* لوحة لكل مساحة: ترقيم المهام موحّد بداخلها (بادئة المساحة) ومختلف عن اللوحات الأخرى */
      if (!boardsArr.length) [[1, 'المهام العامة', 4], [2, 'خدمة الاشتراكات', 1], [3, 'حملة نهاية السنة', 2], [4, 'المطابقة المالية', 3]].forEach(([id, name, pid], i) => boardsArr.push({ id, name, position: i, autoColumns: true, columns: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map(s => ({ status: s })), filters: { projectId: pid }, card: null, labels: {} }));
      const roleOf = b => {
        if (((b.detail || {}).hiddenFor || []).includes(u.id) && !can(u, 'admin')) return null;
        if (can(u, 'admin') || b.createdBy === u.id) return 'MANAGE';
        const mm = (b.members || []).find(x => x.userId === u.id);
        if (mm) return mm.role;
        if (b.visibility === 'MEMBERS') return null;
        return can(u, 'team.view') ? 'MANAGE' : 'EDIT';
      };
      return ok(boardsArr.filter(b => roleOf(b)).slice().sort((a, b) => a.position - b.position).map(b => ({ ...b, myRole: roleOf(b), visibility: b.visibility || 'ALL', members: roleOf(b) === 'MANAGE' ? (b.members || []) : undefined, card: { fields: {}, custom: [], density: 'comfortable', color: 'none', ...(b.card || {}), fields: { ...((b.card || {}).fields || {}) } } })));
    }
    const resolveCols = cols => cols.map(c => {
      let st = c.status;
      if (!st && c.newName) { st = 's' + (++seq).toString(36); org.settings.taskStatuses = [...(org.settings.taskStatuses || []), { key: st, name: c.newName }]; }
      return { status: st, ...(c.name ? { name: c.name } : {}), ...(c.color ? { color: c.color } : {}), ...(c.max ? { max: c.max } : {}), ...(c.min ? { min: c.min } : {}), ...(c.noCreate ? { noCreate: true } : {}) };
    });
    if (path === '/api/boards' && method === 'POST') {
      if (!can(u, 'team.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const b = { id: ++seq, name: body.name, position: boardsArr.length, autoColumns: false, columns: resolveCols(body.columns || []), filters: body.filters || {}, card: body.card || null, labels: body.labels || {}, visibility: body.visibility || 'ALL', members: body.visibility === 'MEMBERS' ? (body.members || []) : [], fields: body.fields || [], detail: body.detail || {}, createdBy: u.id };
      boardsArr.push(b); return ok({ id: b.id }, 201);
    }
    if ((m = path.match(/^\/api\/boards\/(\d+)$/))) {
      const b = boardsArr.find(x => x.id === +m[1]);
      if (!b) return err(404, 'اللوحة غير موجودة');
      if (!can(u, 'team.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (method === 'DELETE') { if (boardsArr.length <= 1) return err(409, 'لا يمكن حذف آخر لوحة'); boardsArr.splice(boardsArr.indexOf(b), 1); return ok(null); }
      if (method === 'PATCH') {
        if (body.name !== undefined) b.name = body.name;
        if (body.columns !== undefined) { b.columns = resolveCols(body.columns); b.autoColumns = false; }
        ['filters', 'card', 'labels', 'visibility', 'members', 'fields', 'detail'].forEach(k => { if (body[k] !== undefined) b[k] = body[k]; });
        return ok(null);
      }
    }
    /* مؤقّت العمل + أتمتة */
    function runRulesMock(t, user, trigger, status, ruleId) {
      const rules = ((org.settings && org.settings.automations) || []).filter(r => r.trigger === trigger && (trigger !== 'STATUS_CHANGED' || r.status === status) && (!ruleId || r.id === ruleId));
      rules.forEach(r => {
        (r.actions || []).forEach(a => {
          if (a.type === 'setStatus' && a.value !== t.status) { logH(t.id, user.id, 'status', t.status, a.value); t.status = a.value; if (a.value === 'DONE') { t.progress = 100; t.completedAt = now(); } }
          if (a.type === 'setPriority') { logH(t.id, user.id, 'priority', t.priority, a.value); t.priority = a.value; }
          if (a.type === 'assign' && byId(+a.value)) { logH(t.id, user.id, 'assignee', byId(t.assigneeId).name, byId(+a.value).name); t.assigneeId = +a.value; }
          if (a.type === 'addLabel' && a.value && !(t.labels || []).includes(a.value)) t.labels = [...(t.labels || []), a.value];
          if (a.type === 'comment' && a.value) t.comments.push({ id: ++seq, userId: user.id, body: a.value, createdAt: now() });
          if (a.type === 'startTimer' && !t.timerUserId) { t.timerUserId = user.id; t.timerStartedAt = now(); }
          if (a.type === 'stopTimer' && t.timerUserId) { const mins = Math.max(1, Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000)); worklogs.push({ id: ++seq, taskId: t.id, userId: t.timerUserId, minutes: mins, note: 'مؤقّت العمل', workedOn: day(0), createdAt: now() }); t.timerUserId = null; t.timerStartedAt = null; }
          if (a.type === 'setField' && a.value && a.value.key) t.customFields = { ...(t.customFields || {}), [a.value.key]: a.value.value };
        });
        logH(t.id, user.id, 'automation', null, r.name);
      });
      return rules.map(r => r.name);
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/timer$/)) && method === 'POST') {
      const t = tasks.find(x => x.id === +m[1]); if (!t) return err(404, 'المهمة غير موجودة');
      if (body.action === 'start') {
        if (t.timerUserId) return err(409, 'المؤقّت يعمل مسبقاً');
        t.timerUserId = u.id; t.timerStartedAt = now(); if (t.status === 'TODO') { logH(t.id, u.id, 'status', 'TODO', 'IN_PROGRESS'); t.status = 'IN_PROGRESS'; }
        logH(t.id, u.id, 'timer', null, 'بدء'); return ok(null);
      }
      if (!t.timerUserId) return err(409, 'لا يوجد مؤقّت يعمل');
      const mins = Math.min(1440, Math.max(1, Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000)));
      worklogs.push({ id: ++seq, taskId: t.id, userId: t.timerUserId, minutes: mins, note: 'مؤقّت العمل', workedOn: day(0), createdAt: now() });
      t.timerUserId = null; t.timerStartedAt = null; logH(t.id, u.id, 'worklog', null, mins + ' د');
      return ok({ minutes: mins });
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/automation\/([^\/]+)$/)) && method === 'POST') {
      const t = tasks.find(x => x.id === +m[1]); if (!t) return err(404, 'المهمة غير موجودة');
      const ran = runRulesMock(t, u, 'MANUAL', null, decodeURIComponent(m[2]));
      return ran.length ? ok({ ran }) : err(404, 'القاعدة غير موجودة');
    }
    /* وقت/روابط/مراقبة */
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/worklog$/)) && method === 'POST') {
      const t = tasks.find(x => x.id === +m[1]); if (!t) return err(404, 'المهمة غير موجودة');
      if (!(body.minutes >= 1)) return err(400, 'المدة أكبر من صفر');
      worklogs.push({ id: ++seq, taskId: t.id, userId: u.id, minutes: body.minutes, note: body.note || null, workedOn: body.workedOn || day(0), createdAt: now() });
      logH(t.id, u.id, 'worklog', null, body.minutes + ' د');
      return ok({ id: seq }, 201);
    }
    if ((m = path.match(/^\/api\/task-worklogs\/(\d+)$/)) && method === 'DELETE') {
      const i = worklogs.findIndex(x => x.id === +m[1]); if (i < 0) return err(404, 'السجل غير موجود');
      worklogs.splice(i, 1); return ok(null);
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/links$/)) && method === 'POST') {
      const t = tasks.find(x => x.id === +m[1]); if (!t) return err(404, 'المهمة غير موجودة');
      if (body.toId === t.id) return err(400, 'لا يمكن ربط المهمة بنفسها');
      if (links.some(l => l.fromId === t.id && l.toId === body.toId && l.type === body.type)) return err(409, 'هذا الرابط موجود');
      links.push({ id: ++seq, fromId: t.id, toId: body.toId, type: body.type });
      logH(t.id, u.id, 'link', null, body.type);
      return ok(null, 201);
    }
    if ((m = path.match(/^\/api\/task-links\/(\d+)$/)) && method === 'DELETE') {
      const i = links.findIndex(x => x.id === +m[1]); if (i < 0) return err(404, 'الرابط غير موجود');
      links.splice(i, 1); return ok(null);
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/watch$/)) && method === 'POST') {
      const i = watchers.findIndex(w => w.taskId === +m[1] && w.userId === u.id);
      if (body.on && i < 0) watchers.push({ taskId: +m[1], userId: u.id });
      if (!body.on && i >= 0) watchers.splice(i, 1);
      return ok(null);
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)$/))) {
      const t = tasks.find(x => x.id === +m[1]);
      if (!t || !taskVisible(u, sc)(t)) return err(404, 'المهمة غير موجودة');
      const manage = t.creatorId === u.id || (t.assigneeId !== u.id && sc.has(t.assigneeId));
      if (method === 'GET') {
        const wl = worklogs.filter(w => w.taskId === t.id);
        return ok({ ...taskJSON(t), items: (t.items || []).map(i => ({ id: i.id, text: i.text, done: i.done })), canManage: manage, canUpdate: manage || t.assigneeId === u.id, mentionable: [...new Set([t.assigneeId, t.creatorId, ...anc(t.assigneeId).map(a => a.id), ...users.filter(x => x.role === 'CEO').map(x => x.id), ...users.filter(x => t.projectId && (spCaps(x, t.projectId) || []).includes('view')).map(x => x.id)])].filter(id => id !== u.id && byId(id).active).map(id => person(id)), comments: t.comments.map(c => ({ id: c.id, body: c.body, user: person(c.userId), createdAt: c.createdAt, editedAt: c.editedAt || null })),
          childIssues: tasks.filter(x => x.parentId === t.id).map(c => ({ ...taskBrief(c), assignee: person(c.assigneeId) })),
          worklogs: wl.map(w => ({ id: w.id, minutes: w.minutes, note: w.note, workedOn: w.workedOn, user: person(w.userId), mine: w.userId === u.id })),
          timeSpentMin: wl.reduce((s, w) => s + w.minutes, 0),
          links: [...links.filter(l => l.fromId === t.id).map(l => ({ id: l.id, type: l.type, direction: 'out', task: taskBrief(tasks.find(x => x.id === l.toId)) })), ...links.filter(l => l.toId === t.id).map(l => ({ id: l.id, type: l.type, direction: 'in', task: taskBrief(tasks.find(x => x.id === l.fromId)) }))].filter(l => l.task),
          watchers: watchers.filter(w => w.taskId === t.id).map(w => person(w.userId)), watching: watchers.some(w => w.taskId === t.id && w.userId === u.id),
          history: history.filter(h => h.taskId === t.id).slice(0, 80).map(h => ({ id: h.id, field: h.field, from: h.from, to: h.to, user: person(h.userId), createdAt: h.createdAt })) });
      }
      if (method === 'PATCH') {
        const detail = ['title', 'description', 'priority', 'issueType', 'labels', 'storyPoints', 'estimateMin', 'startDate', 'dueDate', 'goalId', 'projectId', 'parentId', 'sprintId', 'assigneeId'].some(k => body[k] !== undefined);
        const detailEdit = ['title', 'description', 'priority', 'issueType', 'labels', 'storyPoints', 'estimateMin', 'startDate', 'dueDate', 'goalId', 'projectId', 'parentId', 'sprintId'].some(k => body[k] !== undefined) || body.customFields !== undefined;
        if (body.status !== undefined && body.status !== t.status && !spHas(u, t.projectId, 'move')) return err(403, 'صلاحيتك على هذه اللوحة لا تسمح بنقل المهام');
        if (detailEdit && !spHas(u, t.projectId, 'edit')) return err(403, 'صلاحيتك على هذه اللوحة لا تسمح بتعديل تفاصيل المهام');
        if (body.assigneeId !== undefined && body.assigneeId !== t.assigneeId && !spHas(u, t.projectId, 'assign')) return err(403, 'صلاحيتك على هذه اللوحة لا تسمح بإسناد المهام');
        const explicitEdit = (() => { const c = spCaps(u, t.projectId); return !!(c && c.includes('edit')); })();
        if (!manage && detail && !explicitEdit) return err(403, 'تعديل تفاصيل المهمة لمن كلّف بها أو لرئيس المنفّذ');
        if (!manage && t.assigneeId !== u.id) return err(403, 'ليست لديك صلاحية على هذه المهمة');
        if (body.assigneeId && !sc.has(body.assigneeId)) return err(403, 'تقدر تسند لنفسك أو لمن تحتك فقط');
        if (body.parentId === t.id) return err(400, 'لا يمكن أن تكون المهمة أماً لنفسها');
        if (body.startDate && (body.dueDate || t.dueDate) && (body.dueDate || t.dueDate) < body.startDate) return err(400, 'التسليم قبل البدء');
        const SP = { status: s => s, priority: s => s, issueType: s => s, storyPoints: s => s, estimateMin: s => s, dueDate: s => s, startDate: s => s, title: s => s,
          labels: a => (a || []).join('، '), assigneeId: id => (byId(id) || {}).name, parentId: id => { const x = tasks.find(y => y.id === id); return x ? keyOfT(x) : null; },
          sprintId: id => (sprints.find(s => s.id === id) || {}).name || null, projectId: id => (projects.find(p => p.id === id) || {}).name || null };
        const FM = { assigneeId: 'assignee', parentId: 'parent', sprintId: 'sprint', projectId: 'project' };
        Object.keys(body).forEach(k => { if (SP[k] && body[k] !== undefined) logH(t.id, u.id, FM[k] || k, SP[k](t[k]), SP[k](body[k])); });
        if (body.projectId !== undefined && body.projectId !== t.projectId) { const p = projects.find(x => x.id === body.projectId); t.keyPrefix = (p && projKey(p)) || DEF_PREFIX(); t.number = null; }
        if (body.customFields) {
          const cur = { ...(t.customFields || {}) };
          Object.entries(body.customFields).forEach(([k, v]) => { logH(t.id, u.id, 'custom:' + k, Array.isArray(cur[k]) ? cur[k].join('، ') : cur[k], Array.isArray(v) ? v.join('، ') : v); if (v === null || v === '') delete cur[k]; else cur[k] = v; });
          t.customFields = cur;
        }
        const oldStatus = t.status;
        Object.assign(t, Object.fromEntries(Object.entries(body).filter(([k, v]) => v !== undefined && k !== 'customFields')));
        ensureKey(t);
        if (body.status && body.status !== oldStatus) runRulesMock(t, u, 'STATUS_CHANGED', body.status);
        if (body.status === 'DONE') {
          t.progress = 100; t.completedAt = now();
          if (t.recurrence && t.dueDate) {
            const d = new Date(t.dueDate + 'T00:00:00');
            if (t.recurrence === 'DAILY') d.setDate(d.getDate() + 1); else if (t.recurrence === 'WEEKLY') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1);
            const nd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            tasks.push({ ...t, id: ++seq, status: 'TODO', progress: 0, completedAt: null, dueDate: nd, comments: [], items: (t.items || []).map(i => ({ ...i, id: ++seq, done: false })) });
          }
        }
        logA(u, 'task.update', 'task', t.id, Object.keys(body));
        return ok(null);
      }
      if (method === 'DELETE') {
        if (!manage) return err(403, 'الحذف لمن كلّف بالمهمة أو لرئيس المنفّذ');
        tasks.splice(tasks.indexOf(t), 1); logA(u, 'task.delete', 'task', t.id, { title: t.title });
        return ok(null);
      }
    }
    /* بنود قائمة التحقق */
    const syncItems = t => { if (t.items && t.items.length) { t.progress = Math.round(t.items.filter(i => i.done).length / t.items.length * 100); if (t.progress > 0 && t.status === 'TODO') t.status = 'IN_PROGRESS'; } };
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/items$/)) && method === 'POST') {
      const t = tasks.find(x => x.id === +m[1]);
      if (!t || !taskVisible(u, sc)(t)) return err(404, 'المهمة غير موجودة');
      (t.items = t.items || []).push({ id: ++seq, text: body.text, done: false, position: t.items.length });
      syncItems(t); return ok({ id: seq }, 201);
    }
    if ((m = path.match(/^\/api\/task-items\/(\d+)$/))) {
      const t = tasks.find(x => (x.items || []).some(i => i.id === +m[1]));
      if (!t) return err(404, 'البند غير موجود');
      const it = t.items.find(i => i.id === +m[1]);
      if (method === 'PATCH') { Object.assign(it, body); syncItems(t); return ok(null); }
      if (method === 'DELETE') { t.items.splice(t.items.indexOf(it), 1); syncItems(t); return ok(null); }
    }
    if ((m = path.match(/^\/api\/tasks\/(\d+)\/comments\/(\d+)$/)) && (method === 'PATCH' || method === 'DELETE')) {
      const t = tasks.find(x => x.id === +m[1]);
      if (!t) return err(404, 'المهمة غير موجودة');
      const c = t.comments.find(x => x.id === +m[2]);
      if (!c) return err(404, 'التعليق غير موجود');
      if (method === 'PATCH') {
        if (c.userId !== u.id) return err(403, 'يمكنك تعديل تعليقاتك فقط');
        c.body = String(body.body || '').trim() || c.body; c.editedAt = now(); return ok(null);
      }
      if (c.userId !== u.id && !admins.has(u.id)) return err(403, 'يمكنك حذف تعليقاتك فقط');
      t.comments.splice(t.comments.indexOf(c), 1); return ok(null);
    }    if ((m = path.match(/^\/api\/tasks\/(\d+)\/comments$/)) && method === 'POST') {
      { const tt = tasks.find(x => x.id === +m[1]); if (tt && !spHas(u, tt.projectId, 'comment')) return err(403, 'صلاحيتك على هذه اللوحة لا تسمح بالتعليق'); }
      const t = tasks.find(x => x.id === +m[1]);
      if (!t) return err(404, 'المهمة غير موجودة');
      t.comments.push({ id: ++seq, userId: u.id, body: body.body, createdAt: now() });
      const allowed = new Set([t.assigneeId, t.creatorId, ...anc(t.assigneeId).map(a => a.id), ...users.filter(x => x.role === 'CEO').map(x => x.id), ...users.filter(x => t.projectId && (spCaps(x, t.projectId) || []).includes('view')).map(x => x.id)]);
      const ment = [...new Set([...body.body.matchAll(/@\[(\d+)\]/g)].map(x => +x[1]))].filter(id => allowed.has(id) && id !== u.id);
      const push = (uid, type, text) => { const x = byId(uid); const pref = { MENTION: 'mention', TASK: 'task' }[type]; if (x && !(x.notifyPrefs && x.notifyPrefs[pref] === false)) notifs.push({ id: ++seq, userId: uid, type, actor: u.name, text, link: '#/tasks?open=' + t.id, read: false, createdAt: now() }); };
      ment.forEach(uid => push(uid, 'MENTION', `${u.name} أشار إليك في «${t.title}»`));
      [t.assigneeId, t.creatorId].filter(uid => uid !== u.id && !ment.includes(uid)).forEach(uid => push(uid, 'TASK', `${u.name} علّق على: ${t.title}`));
      return ok(null, 201);
    }

    /* الأهداف */
    if (path === '/api/goals' && method === 'GET') {
      const vis = new Set(sc); anc(u.id).forEach(a => vis.add(a.id));
      return ok(goals.filter(g => vis.has(g.ownerId)).map(g => goalJSON(g, sc)));
    }
    if (path === '/api/goals' && method === 'POST') {
      const oid = body.ownerId || u.id;
      if (!sc.has(oid)) return err(403, 'تقدر تضع أهداف لنفسك أو لمن تحتك فقط');
      const g = { id: ++seq, ownerId: oid, parentId: body.parentId || null, title: body.title, description: null, period: body.period, status: 'ACTIVE', keyResults: (body.keyResults || []).map(k => ({ id: ++seq, title: k.title, target: k.target, current: 0, unit: k.unit || null })) };
      goals.push(g); logA(u, 'goal.create', 'goal', g.id, { ownerId: oid });
      return ok({ id: g.id }, 201);
    }
    if ((m = path.match(/^\/api\/goals\/(\d+)$/))) {
      const g = goals.find(x => x.id === +m[1]);
      if (!g || !sc.has(g.ownerId)) return err(404, 'الهدف غير موجود');
      if (method === 'PATCH') { Object.assign(g, body); return ok(null); }
      if (method === 'DELETE') { goals.splice(goals.indexOf(g), 1); return ok(null); }
    }
    if ((m = path.match(/^\/api\/goals\/(\d+)\/key-results$/)) && method === 'POST') {
      const g = goals.find(x => x.id === +m[1]);
      if (!g || !sc.has(g.ownerId)) return err(404, 'الهدف غير موجود');
      g.keyResults.push({ id: ++seq, title: body.title, target: body.target, current: 0, unit: body.unit || null });
      return ok({ id: seq }, 201);
    }
    if ((m = path.match(/^\/api\/key-results\/(\d+)$/)) && method === 'PATCH') {
      for (const g of goals) { const k = g.keyResults.find(x => x.id === +m[1]); if (k) { if (!sc.has(g.ownerId)) return err(404, 'النتيجة غير موجودة'); Object.assign(k, body); return ok(null); } }
      return err(404, 'النتيجة غير موجودة');
    }

    /* الطلبات */
    if (path === '/api/requests/summary') return ok({ inbox: requests.filter(r => r.currentApproverId === u.id && r.status === 'PENDING').length, mine: requests.filter(r => r.requesterId === u.id && r.status === 'PENDING').length });
    if (path === '/api/requests' && method === 'GET') {
      const box = q.box || 'mine';
      let list = requests;
      if (box === 'mine') list = list.filter(r => r.requesterId === u.id);
      else if (box === 'inbox') list = list.filter(r => r.currentApproverId === u.id && r.status === 'PENDING');
      else if (box === 'team') list = list.filter(r => r.requesterId !== u.id && sc.has(r.requesterId));
      else list = list.filter(r => r.steps.some(s => s.approverId === u.id));
      return ok(list.slice().reverse().map(reqJSON));
    }
    if (path === '/api/requests' && method === 'POST') {
      if (body.type === 'LEAVE') {
        const bal = leaveBal(u).find(b => b.key === (body.leaveType || 'annual'));
        const want = Math.round((new Date(body.endDate) - new Date(body.startDate)) / 864e5) + 1;
        if (!bal) return err(400, 'نوع إجازة غير معروف');
        if (bal.remaining != null && want > bal.remaining) return err(400, `رصيد «${bal.name}» غير كافٍ: المتبقي ${bal.remaining} يوم والمطلوب ${want}`);
      }
      const a = nearest(u.id);
      const r = { id: ++seq, requesterId: u.id, leaveType: body.type === 'LEAVE' ? (body.leaveType || 'annual') : null, type: body.type, title: body.title, details: body.details || null, amount: body.type === 'LEAVE' ? null : body.amount, startDate: body.startDate || null, endDate: body.endDate || null, status: a ? 'PENDING' : 'APPROVED', currentApproverId: a ? a.id : null, createdAt: now(), steps: a ? [] : [{ approverId: u.id, decision: 'APPROVED', note: 'اعتماد ذاتي', createdAt: now() }] };
      requests.push(r); logA(u, 'request.create', 'request', r.id, { type: r.type });
      return ok({ id: r.id, status: r.status }, 201);
    }
    if ((m = path.match(/^\/api\/requests\/(\d+)$/)) && method === 'GET') {
      const r = requests.find(x => x.id === +m[1]);
      if (!r || !(sc.has(r.requesterId) || r.currentApproverId === u.id || r.steps.some(s => s.approverId === u.id))) return err(404, 'الطلب غير موجود');
      const done = new Map(r.steps.map(s => [s.approverId, s.decision]));
      const chain = [];
      for (const a of anc(r.requesterId).filter(x => x.active)) {
        const enough = limitOk(a.role, r);
        const lim = a.role === 'CEO' ? null : (org.approvalLimits[a.role] ?? 0);
        let state = 'FUTURE';
        if (done.has(a.id)) state = done.get(a.id) === 'REJECTED' ? 'REJECTED' : 'DONE'; else if (r.currentApproverId === a.id) state = 'CURRENT';
        chain.push({ id: a.id, name: a.name, role: a.role, limit: lim, canFinalize: enough, state });
        if (enough) break;
      }
      return ok({ ...reqJSON(r), chain: r.status === 'PENDING' || r.status === 'REJECTED' ? chain : chain.filter(c => c.state !== 'FUTURE'),
        comments: requestComments.filter(c => c.requestId === r.id).map(c => ({ id: c.id, body: c.body, user: person(c.userId), createdAt: c.createdAt })) });
    }
    if ((m = path.match(/^\/api\/requests\/(\d+)\/comments$/)) && method === 'POST') {
      const r = requests.find(x => x.id === +m[1]);
      if (!r) return err(404, 'الطلب غير موجود');
      requestComments.push({ id: ++seq, requestId: r.id, userId: u.id, body: body.body, createdAt: now() });
      [r.requesterId, r.currentApproverId, ...r.steps.map(s => s.approverId)].filter(i => i && i !== u.id).forEach(i =>
        notifs.push({ id: ++seq, userId: i, type: 'REQUEST', actor: u.name, text: `${u.name} علّق على الطلب «${r.title}»`, link: '#/requests', read: false, createdAt: now() }));
      return ok(null, 201);
    }
    if ((m = path.match(/^\/api\/requests\/(\d+)\/(approve|reject|cancel)$/)) && method === 'POST') {
      const r = requests.find(x => x.id === +m[1]);
      if (!r) return err(404, 'الطلب غير موجود');
      if (r.status !== 'PENDING') return err(409, 'هذا الطلب تم البتّ فيه مسبقاً');
      if (m[2] === 'cancel') { if (r.requesterId !== u.id) return err(403, 'الإلغاء لصاحب الطلب فقط'); r.status = 'CANCELLED'; r.currentApproverId = null; return ok(null); }
      if (!can(u, 'requests.approve') || (r.currentApproverId !== u.id && u.role !== 'CEO')) return err(403, 'هذا الطلب ليس بانتظار موافقتك');
      if (m[2] === 'reject') { r.steps.push({ approverId: u.id, decision: 'REJECTED', note: body.note || null, createdAt: now() }); r.status = 'REJECTED'; r.currentApproverId = null; logA(u, 'request.reject', 'request', r.id); return ok(null); }
      const next = !limitOk(u.role, r) ? nearest(u.id) : null;
      r.steps.push({ approverId: u.id, decision: next ? 'ESCALATED' : 'APPROVED', note: body.note || null, createdAt: now() });
      if (next) r.currentApproverId = next.id; else { r.status = 'APPROVED'; r.currentApproverId = null; r.decidedAt = now(); }
      logA(u, 'request.approve', 'request', r.id, { result: r.status });
      return ok({ status: r.status });
    }

    if (path === '/api/directory') return ok(users.filter(x => x.active).map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title, department: x.department })));

    if (path === '/api/calendar') {
      const fromD = new Date(q.from + 'T00:00:00'), toD = new Date(q.to + 'T23:59:59');
      const outEvents = [];
      events.filter(e => e.companyWide || e.attendees.some(a => a.userId === u.id)).forEach(e => {
        const dur = new Date(e.endAt) - new Date(e.startAt);
        let cur = new Date(e.startAt), n = 0;
        const until = e.recurUntil ? new Date(e.recurUntil + 'T23:59:59') : null;
        const anchor = cur.getDate();
        for (let i = 0; i < 4000 && cur <= toD && n < 250; i++) {
          if (until && cur > until) break;
          if (cur.getTime() + dur >= fromD.getTime()) outEvents.push({ ...evJSON({ ...e, startAt: cur.toISOString(), endAt: new Date(cur.getTime() + dur).toISOString() }, u.id), occurrence: i > 0, seriesStart: e.startAt });
          if (!e.recurrence) break;
          const nx = new Date(cur);
          if (e.recurrence === 'HOURLY') nx.setTime(nx.getTime() + Math.max(1, e.recurEvery || 1) * 36e5);
          else if (e.recurrence === 'DAILY') nx.setDate(nx.getDate() + 1);
          else if (e.recurrence === 'WEEKLY') nx.setDate(nx.getDate() + 7);
          else { nx.setDate(1); nx.setMonth(nx.getMonth() + 1); const dim = new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate(); nx.setDate(Math.min(anchor, dim)); }
          cur = nx; n++;
        }
      });
      outEvents.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
      return ok({
        events: outEvents,
        tasks: tasks.filter(t => t.assigneeId === u.id && t.status !== 'DONE' && t.dueDate && t.dueDate >= q.from && t.dueDate <= q.to).map(t => ({ id: t.id, title: t.title, date: t.dueDate, priority: t.priority })),
        leaves: requests.filter(r => r.type === 'LEAVE' && r.status === 'APPROVED' && sc.has(r.requesterId) && r.startDate <= q.to && r.endDate >= q.from).map(r => ({ id: r.id, person: person(r.requesterId), startDate: r.startDate, endDate: r.endDate, mine: r.requesterId === u.id })),
      });
    }
    if ((m = path.match(/^\/api\/events\/(\d+)$/)) && method === 'GET') {
      const e = events.find(x => x.id === +m[1]);
      if (!e || !(e.companyWide || e.attendees.some(a => a.userId === u.id))) return err(404, 'الموعد غير موجود');
      return ok(evJSON(e, u.id));
    }
    if (path === '/api/events' && method === 'POST') {
      if ((body.companyWide || body.type === 'HOLIDAY') && !can(u, 'events.company')) return err(403, 'ليست لديك صلاحية فعاليات الشركة');
      const ids = [u.id, ...(body.attendeeIds || [])];
      const conflicts = [...new Set(events.filter(e => !e.allDay && new Date(e.startAt) < new Date(body.endAt) && new Date(e.endAt) > new Date(body.startAt)).flatMap(e => e.attendees.filter(a => ids.includes(a.userId) && a.response !== 'DECLINED').map(a => byId(a.userId).name)))];
      const e = { id: ++seq, type: body.type || 'MEETING', customType: body.type === 'OTHER' ? (body.customType || null) : null, recurEvery: body.recurrence === 'HOURLY' ? body.recurEvery : null, title: body.title, description: body.description || null, location: body.location || null, startAt: body.startAt, endAt: body.endAt, allDay: !!body.allDay, companyWide: !!(body.companyWide || body.type === 'HOLIDAY'), recurrence: body.recurrence || null, recurUntil: body.recurUntil || null, creatorId: u.id, attendees: ids.map((id, i) => ({ userId: id, response: i === 0 ? 'ACCEPTED' : 'PENDING' })) };
      events.push(e); logA(u, 'event.create', 'event', e.id, { type: e.type });
      return ok({ id: e.id, conflicts }, 201);
    }
    if ((m = path.match(/^\/api\/events\/(\d+)$/))) {
      const e = events.find(x => x.id === +m[1]);
      if (!e) return err(404, 'الموعد غير موجود');
      if (method === 'PATCH') {
        if (e.creatorId !== u.id) return err(403, 'التعديل لمن أنشأ الموعد');
        const { attendeeIds, ...rest } = body;
        Object.assign(e, rest);
        if (attendeeIds) e.attendees = [{ userId: u.id, response: 'ACCEPTED' }, ...attendeeIds.map(id => e.attendees.find(a => a.userId === id) || { userId: id, response: 'PENDING' })];
        return ok(null);
      }
      if (method === 'DELETE') {
        if (e.creatorId !== u.id && u.role !== 'CEO') return err(403, 'الحذف لمن أنشأ الموعد');
        events.splice(events.indexOf(e), 1); logA(u, 'event.delete', 'event', e.id, { title: e.title });
        return ok(null);
      }
    }
    if ((m = path.match(/^\/api\/events\/(\d+)\/respond$/)) && method === 'POST') {
      const a = (events.find(x => x.id === +m[1]) || { attendees: [] }).attendees.find(x => x.userId === u.id);
      if (!a) return err(404, 'لست مدعواً لهذا الموعد');
      a.response = body.response; return ok(null);
    }

    /* المساحات */
    const spaceOut = p => ({ id: p.id, key: projKey(p), name: p.name, description: p.description || null, background: p.background || null, fields: (p.settings || {}).fields || [], perms: can(u, 'admin') ? ((p.settings || {}).perms || { users: {}, roles: {} }) : undefined, boards: boardsArr.filter(b => (b.filters || {}).projectId === p.id).map(b => ({ id: b.id, name: b.name })), canManage: can(u, 'admin') });
    if (path === '/api/spaces' && method === 'GET') return ok(projects.filter(p => spHas(u, p.id, 'view')).map(spaceOut));
    if (path === '/api/spaces' && method === 'POST') {
      if (!can(u, 'admin')) return err(403, 'إنشاء المساحات لمن يملك صلاحية «إدارة اللوحات»');
      if (!body.name || !body.name.trim()) return err(400, 'اسم المساحة مطلوب');
      const p = { id: ++seq, name: body.name.trim(), description: body.description || null, status: 'ACTIVE', ownerId: u.id, startDate: null, endDate: null, key: (body.key || body.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SP' + seq).toUpperCase(), background: body.background || null, settings: { fields: [], perms: { users: {}, roles: {} } } };
      projects.push(p); return ok({ id: p.id }, 201);
    }
    if ((m = path.match(/^\/api\/spaces\/(\d+)$/))) {
      const p = projects.find(x => x.id === +m[1]);
      if (!p) return err(404, 'المساحة غير موجودة');
      if (!can(u, 'admin')) return err(403, 'تعديل المساحات لمن يملك صلاحية «إدارة اللوحات»');
      if (method === 'DELETE') { projects.splice(projects.indexOf(p), 1); tasks.forEach(t => { if (t.projectId === p.id) t.projectId = null; }); return ok(null); }
      if (method === 'PATCH') {
        ['name', 'description', 'background'].forEach(k => { if (body[k] !== undefined) p[k] = body[k]; });
        if (body.key) p.key = body.key;
        p.settings = p.settings || {};
        if (body.fields) p.settings.fields = body.fields;
        if (body.perms) p.settings.perms = { users: body.perms.users || {}, roles: body.perms.roles || {} };
        return ok(null);
      }
    }
    if (path === '/api/projects' && method === 'GET') {
      const upper = new Set(anc(u.id).map(a => a.id));
      const mine = projects.filter(p => sc.has(p.ownerId) || upper.has(p.ownerId) || tasks.some(t => t.projectId === p.id && sc.has(t.assigneeId)));
      return ok(mine.map(p => {
        const ts = tasks.filter(t => t.projectId === p.id);
        return { id: p.id, key: projKey(p), name: p.name, description: p.description, status: p.status, owner: person(p.ownerId), startDate: p.startDate, endDate: p.endDate, tasks: ts.length, done: ts.filter(t => t.status === 'DONE').length, overdue: ts.filter(t => t.status !== 'DONE' && t.dueDate && t.dueDate < day(0)).length, progress: ts.length ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / ts.length) : 0 };
      }));
    }
    if (path === '/api/projects' && method === 'POST') {
      if (!can(u, 'projects.manage')) return err(403, 'ليست لديك صلاحية إنشاء المشاريع');
      const p = { id: ++seq, name: body.name, description: body.description || null, status: body.status || 'ACTIVE', ownerId: body.ownerId || u.id, startDate: body.startDate || null, endDate: body.endDate || null };
      projects.push(p); logA(u, 'project.create', 'project', p.id, {});
      return ok({ id: p.id }, 201);
    }
    if (method !== 'GET' && (m = path.match(/^\/api\/projects\/(\d+)$/))) {
      const p = projects.find(x => x.id === +m[1]);
      if (!p || !sc.has(p.ownerId)) return err(404, 'المشروع غير موجود');
      if (method === 'PATCH') { Object.assign(p, body); return ok(null); }
      if (method === 'DELETE') { projects.splice(projects.indexOf(p), 1); tasks.forEach(t => { if (t.projectId === p.id) t.projectId = null; }); return ok(null); }
    }

    /* تفاصيل المشروع + التعليقات */
    if ((m = path.match(/^\/api\/projects\/(\d+)$/)) && method === 'GET') {
      const p = projects.find(x => x.id === +m[1]);
      const upper = new Set(anc(u.id).map(a => a.id));
      const ts = p ? tasks.filter(t => t.projectId === p.id) : [];
      if (!p || !(sc.has(p.ownerId) || upper.has(p.ownerId) || ts.some(t => sc.has(t.assigneeId)))) return err(404, 'المشروع غير موجود');
      const ids = new Set([p.ownerId, ...ts.map(t => t.assigneeId), ...anc(p.ownerId).map(a => a.id), ...users.filter(x => x.role === 'CEO').map(x => x.id)]);
      return ok({
        id: p.id, name: p.name, description: p.description, status: p.status, owner: person(p.ownerId), startDate: p.startDate, endDate: p.endDate,
        tasks: ts.length, done: ts.filter(t => t.status === 'DONE').length, overdue: ts.filter(t => t.status !== 'DONE' && t.dueDate && t.dueDate < day(0)).length,
        progress: ts.length ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / ts.length) : 0,
        canEdit: sc.has(p.ownerId) && can(u, 'projects.manage'),
        tasksList: ts.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, progress: t.progress, dueDate: t.dueDate, assignee: person(t.assigneeId) })),
        comments: projectComments.filter(c => c.projectId === p.id).map(c => ({ id: c.id, body: c.body, user: person(c.userId), createdAt: c.createdAt })),
        mentionable: [...ids].filter(i => i !== u.id && byId(i) && byId(i).active).map(i => person(i)),
      });
    }
    if ((m = path.match(/^\/api\/projects\/(\d+)\/comments$/)) && method === 'POST') {
      const p = projects.find(x => x.id === +m[1]);
      if (!p) return err(404, 'المشروع غير موجود');
      projectComments.push({ id: ++seq, projectId: p.id, userId: u.id, body: body.body, createdAt: now() });
      const ts = tasks.filter(t => t.projectId === p.id);
      const allowed = new Set([p.ownerId, ...ts.map(t => t.assigneeId), ...anc(p.ownerId).map(a => a.id), ...users.filter(x => x.role === 'CEO').map(x => x.id)]);
      [...new Set([...body.body.matchAll(/@\[(\d+)\]/g)].map(x => +x[1]))].filter(i => allowed.has(i) && i !== u.id).forEach(i =>
        notifs.push({ id: ++seq, userId: i, type: 'MENTION', actor: u.name, text: `${u.name} أشار إليك في مشروع «${p.name}»`, link: '#/projects', read: false, createdAt: now() }));
      return ok(null, 201);
    }

    /* المرفقات */
    const fileAccess = (entity, id) => {
      if (entity === 'task') { const t = tasks.find(x => x.id === id); return !!t && (sc.has(t.assigneeId) || t.creatorId === u.id); }
      if (entity === 'project') return projects.some(x => x.id === id);
      if (entity === 'event') { const e = events.find(x => x.id === id); return !!e && (e.companyWide || e.attendees.some(a => a.userId === u.id)); }
      if (entity === 'announcement') return announcements.some(x => x.id === id);
      if (entity === 'request') { const r = requests.find(x => x.id === id); return !!r && (sc.has(r.requesterId) || r.currentApproverId === u.id); }
      if (entity === 'goal') return goals.some(x => x.id === id);
      return false;
    };
    const fileJSON = f => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, url: f.url, uploader: person(f.uploaderId), canDelete: f.uploaderId === u.id || can(u, 'admin') || u.role === 'CEO' });
    if (path === '/api/attachments' && method === 'GET') {
      const id = +q.id;
      if (!fileAccess(q.entity, id)) return err(404, 'العنصر غير موجود');
      const a = q.entity === 'announcement' ? announcements.find(x => x.id === id) : null;
      return ok({ canUpload: a ? a.authorId === u.id : true, files: files.filter(f => f.entity === q.entity && f.entityId === id).map(fileJSON) });
    }
    if (path === '/api/attachments' && method === 'POST') {
      if (!fileAccess(body.entity, body.id)) return err(404, 'العنصر غير موجود');
      const bin = atob(body.data.slice(0, 16));
      const mime = bin.startsWith('%PDF') ? 'application/pdf' : bin.charCodeAt(0) === 0x89 && bin.slice(1, 4) === 'PNG' ? 'image/png'
        : bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8 ? 'image/jpeg' : bin.startsWith('RIFF') ? 'image/webp' : null;
      if (!mime) return err(400, 'مسموح فقط PDF وصور (PNG, JPG, WEBP)');
      const size = Math.floor(body.data.length * 3 / 4);
      if (size > 1.5 * 1024 * 1024) return err(413, 'في المعاينة الحد 1.5MB للملف (على الخادم الحقيقي 8MB)');
      const f = { id: ++seq, entity: body.entity, entityId: body.id, name: body.name, mime, size, uploaderId: u.id, createdAt: now(), url: `data:${mime};base64,${body.data}` };
      files.push(f); logA(u, 'file.upload', body.entity, body.id, { name: f.name });
      return ok({ id: f.id }, 201);
    }
    if ((m = path.match(/^\/api\/attachments\/(\d+)$/)) && method === 'DELETE') {
      const i = files.findIndex(f => f.id === +m[1]);
      if (i < 0) return err(404, 'الملف غير موجود');
      if (files[i].uploaderId !== u.id && !can(u, 'admin') && u.role !== 'CEO') return err(403, 'الحذف لمن رفع الملف');
      files.splice(i, 1); return ok(null);
    }

    if (path === '/api/announcements' && method === 'GET') {
      return ok(announcements.filter(a => a.audience === 'COMPANY' || a.authorId === u.id
          || (a.audience === 'TEAM' && desc(a.authorId).has(u.id)) || (a.audience === 'CUSTOM' && (a.recipientIds || []).includes(u.id)))
        .sort((a, b) => (b.pinned - a.pinned) || b.id - a.id)
        .map(a => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, pinned: a.pinned, author: person(a.authorId), createdAt: a.createdAt,
          recipients: a.authorId === u.id && a.audience === 'CUSTOM' ? (a.recipientIds || []).map(i => ({ id: i, name: byId(i).name })) : undefined,
          recipientCount: a.audience === 'CUSTOM' ? (a.recipientIds || []).length : undefined,
          canDelete: a.authorId === u.id || u.role === 'CEO' })));
    }
    if (path === '/api/announcements' && method === 'POST') {
      const aud = body.audience || 'TEAM';
      if (aud === 'COMPANY' && !can(u, 'announcements.company')) return err(403, 'ليست لديك صلاحية التعميم على الشركة');
      if (aud === 'TEAM' && !can(u, 'announcements.team')) return err(403, 'ليست لديك صلاحية النشر للفريق');
      if (aud === 'CUSTOM' && !can(u, 'announcements.team') && !can(u, 'announcements.company')) return err(403, 'ليست لديك صلاحية النشر لأشخاص مختارين');
      const rcp = aud === 'CUSTOM' ? [...new Set(body.recipientIds || [])].filter(i => byId(i) && i !== u.id) : [];
      if (aud === 'CUSTOM' && !rcp.length) return err(400, 'اختر شخصاً واحداً على الأقل');
      const a = { id: ++seq, title: body.title, body: body.body, audience: aud, pinned: !!body.pinned && can(u, 'announcements.company'), authorId: u.id, createdAt: now(), recipientIds: rcp };
      announcements.push(a); logA(u, 'announcement.create', 'announcement', a.id, { audience: a.audience });
      const to = aud === 'COMPANY' ? users.map(x => x.id) : aud === 'CUSTOM' ? rcp : [...desc(u.id)];
      to.filter(i => i !== u.id).forEach(i => notifs.push({ id: ++seq, userId: i, type: 'ANNOUNCEMENT', actor: u.name, text: `تعميم جديد من ${u.name}: ${a.title}`, link: '#/announcements', read: false, createdAt: now() }));
      return ok({ id: a.id }, 201);
    }
    if ((m = path.match(/^\/api\/announcements\/(\d+)$/)) && method === 'DELETE') {
      const i = announcements.findIndex(x => x.id === +m[1]);
      if (i < 0) return err(404, 'التعميم غير موجود');
      if (announcements[i].authorId !== u.id && u.role !== 'CEO') return err(403, 'الحذف لكاتب التعميم');
      announcements.splice(i, 1); return ok(null);
    }

    if (path === '/api/leave-balance') {
      const types = leaveBal(u);
      const an = types.find(t => t.key === 'annual') || { entitlement: 30, used: 0, remaining: 30 };
      return ok({ year: new Date().getFullYear(), entitlement: an.entitlement, used: an.used, remaining: an.remaining, types });
    }
    if (path === '/api/attendance/today') { const r = attendance.find(a => a.userId === u.id && a.date === day(0)); return ok({ date: day(0), checkIn: r ? r.checkIn : null, checkOut: r ? r.checkOut : null, ...(r ? attMetrics(r, u) : {}), shift: { start: u.shiftStart || org.settings.workStart, end: u.shiftEnd || org.settings.workEnd } }); }
    if (path === '/api/attendance/check-in') {
      if (attendance.some(a => a.userId === u.id && a.date === day(0))) return err(409, 'سجّلت حضورك اليوم مسبقاً');
      attendance.push({ userId: u.id, date: day(0), checkIn: now(), checkOut: null }); return ok({ checkIn: now() }, 201);
    }
    if (path === '/api/attendance/check-out') {
      const r = attendance.find(a => a.userId === u.id && a.date === day(0) && !a.checkOut);
      if (!r) return err(409, 'لا يوجد حضور مفتوح لتسجيل الخروج');
      r.checkOut = now(); return ok(null);
    }
    if (path === '/api/attendance/team') {
      if (!can(u, 'attendance.team')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const ids = [...sc].filter(id => id !== u.id && byId(id).active);
      return ok({ date: day(0), people: ids.map(id => {
        const x = byId(id), a = attendance.find(r => r.userId === id && r.date === day(0));
        const lv = requests.some(r => r.requesterId === id && r.type === 'LEAVE' && r.status === 'APPROVED' && r.startDate <= day(0) && r.endDate >= day(0));
        const mt = a ? attMetrics(a, x) : null; return { id, name: x.name, role: x.role, title: x.title, status: lv ? 'LEAVE' : a ? (a.checkOut ? 'LEFT' : 'PRESENT') : 'ABSENT', checkIn: a ? a.checkIn : null, checkOut: a ? a.checkOut : null, lateMin: mt ? mt.lateMin : 0, overtimeMin: mt ? mt.overtimeMin : 0 };
      }) });
    }
    if ((m = path.match(/^\/api\/attendance\/(\d+)\/(\d{4}-\d{2}-\d{2})$/)) && (method === 'PUT' || method === 'DELETE')) {
      const uid = +m[1];
      if (!can(u, 'attendance.team')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (uid === u.id) return err(403, 'لا يمكنك تعديل حضورك بنفسك');
      if (!sc.has(uid)) return err(403, 'خارج نطاقك');
      const i = attendance.findIndex(a => a.userId === uid && a.date === m[2]);
      if (method === 'DELETE') { if (i < 0) return err(404, 'لا يوجد سجل بهذا اليوم'); attendance.splice(i, 1); logA(u, 'attendance.delete', 'user', uid, { date: m[2] }); return ok(null); }
      if (body.checkOut && new Date(body.checkOut) <= new Date(body.checkIn)) return err(400, 'الخروج لازم يكون بعد الحضور');
      if (i < 0) attendance.push({ userId: uid, date: m[2], checkIn: body.checkIn, checkOut: body.checkOut || null });
      else Object.assign(attendance[i], { checkIn: body.checkIn, checkOut: body.checkOut || null });
      notifs.push({ id: ++seq, userId: uid, type: 'TASK', actor: u.name, text: `${u.name} عدّل سجل حضورك ليوم ${m[2]}`, link: '#/attendance', read: false, createdAt: now() });
      logA(u, 'attendance.edit', 'user', uid, { date: m[2] });
      return ok(null);
    }
    if (path === '/api/attendance' && method === 'GET') {
      const uid = +q.userId || u.id;
      if (!sc.has(uid)) return err(403, 'خارج نطاقك');
      return ok(attendance.filter(a => a.userId === uid && a.date.slice(0, 7) === q.month).sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ date: a.date, checkIn: a.checkIn, checkOut: a.checkOut, ...attMetrics(a, byId(uid)) })));
    }
    if (path === '/api/reports/performance') {
      if (!can(u, 'reports.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      return ok({ from: q.from, to: q.to, rows: [...sc].filter(id => byId(id).active).map((id, i) => {
        const x = byId(id), my = tasks.filter(t => t.assigneeId === id), done = my.filter(t => t.status === 'DONE'), open = my.filter(t => t.status !== 'DONE');
        const reqs = requests.filter(r => r.requesterId === id);
        return { id, name: x.name, role: x.role, title: x.title, department: x.department, tasksDone: done.length + (i % 3), tasksOpen: open.length, tasksOverdue: open.filter(t => t.dueDate && t.dueDate < day(0)).length, avgDaysToDone: done.length ? 2.5 + i * 0.4 : null, onTimeRate: done.length ? 70 + i * 4 : null, requests: reqs.length, approvedSpend: reqs.filter(r => r.status === 'APPROVED' && r.type !== 'LEAVE').reduce((s, r) => s + r.amount, 0), leaveDays: reqs.filter(r => r.status === 'APPROVED' && r.type === 'LEAVE').length * 5, attendanceDays: attendance.filter(a => a.userId === id).length };
      }) });
    }
    /* ── الموارد البشرية: تقرير الحضور والإجازات والرواتب ── */
    if (path === '/api/hr/people' && method === 'GET') {
      if (!can(u, 'hr.export')) return err(403, 'هذا التقرير للموارد البشرية والمدير التنفيذي فقط');
      return ok(users.filter(x => x.active).map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title, department: x.department || null, salary: SALARY[x.id] ?? null })));
    }
    if ((m = path.match(/^\/api\/hr\/salary\/(\d+)$/)) && method === 'PUT') {
      if (!can(u, 'hr.export')) return err(403, 'هذا التقرير للموارد البشرية والمدير التنفيذي فقط');
      SALARY[+m[1]] = body.salary; return ok(null);
    }
    if (path === '/api/hr/report' && method === 'GET') {
      if (!can(u, 'hr.export')) return err(403, 'هذا التقرير للموارد البشرية والمدير التنفيذي فقط');
      const [yy, mm] = q.month.split('-').map(Number);
      const first = new Date(yy, mm - 1, 1), last = new Date(yy, mm, 0);
      const fmtD = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      const wdays = org.settings.workDays || [0, 1, 2, 3, 4], types = org.settings.leaveTypes || [];
      const basis = 30, upto = new Date() < last ? new Date() : last;
      const hol = new Set(events.filter(e => e.type === 'HOLIDAY').flatMap(e => { const a = new Date(String(e.startAt).slice(0, 10)), b = new Date(String(e.endAt).slice(0, 10)), r = []; for (let t = a; t <= b; t = new Date(t.getTime() + 864e5)) r.push(fmtD(t)); return r; }));
      const ids = q.ids ? q.ids.split(',').map(Number) : users.filter(x => x.active).map(x => x.id);
      const people = users.filter(x => x.active && ids.includes(x.id)).map(usr => {
        const lv = requests.filter(r => r.requesterId === usr.id && r.type === 'LEAVE' && r.status === 'APPROVED' && r.endDate >= fmtD(first) && r.startDate <= fmtD(last)).map(r => { const t = types.find(x => x.key === (r.leaveType || 'annual')) || { name: 'إجازة', paid: true }; return { key: r.leaveType || 'annual', name: t.name, paid: t.paid !== false, from: r.startDate < fmtD(first) ? fmtD(first) : r.startDate, to: r.endDate > fmtD(last) ? fmtD(last) : r.endDate, title: r.title }; });
        let workdays = 0, present = 0, absent = 0, paidLeave = 0, unpaidLeave = 0, late = 0, early = 0, over = 0; const days = [];
        for (let dt = new Date(first); dt <= last; dt = new Date(dt.getTime() + 864e5)) {
          const d = fmtD(dt), isWork = wdays.includes(dt.getDay()) && !hol.has(d);
          const a = attendance.find(x => x.userId === usr.id && x.date === d), l = lv.find(x => d >= x.from && d <= x.to);
          let status = isWork ? '' : (hol.has(d) ? 'HOLIDAY' : 'OFF'), row = {};
          if (isWork) workdays++;
          if (a) { const mt = attMetrics(a, usr); present++; late += mt.lateMin; early += mt.earlyMin; over += mt.overtimeMin; status = 'PRESENT'; row = { checkIn: a.checkIn, checkOut: a.checkOut, lateMin: mt.lateMin, earlyMin: mt.earlyMin, overtimeMin: mt.overtimeMin, workedMin: mt.workedMin }; }
          else if (l && isWork) { status = l.paid ? 'LEAVE_PAID' : 'LEAVE_UNPAID'; if (l.paid) paidLeave++; else unpaidLeave++; }
          else if (isWork && dt <= upto) { status = 'ABSENT'; absent++; }
          days.push({ date: d, status, leave: l && isWork ? l.name : null, ...row });
        }
        const salary = SALARY[usr.id] ?? null, daily = salary != null ? salary / basis : null, deductions = [];
        if (daily != null) { if (unpaidLeave) deductions.push({ label: 'إجازات بدون راتب', days: unpaidLeave, amount: Math.round(daily * unpaidLeave * 100) / 100 }); if (absent) deductions.push({ label: 'غياب بدون إذن', days: absent, amount: Math.round(daily * absent * 100) / 100 }); }
        const totalDeduction = deductions.reduce((s2, x) => s2 + x.amount, 0);
        return { id: usr.id, name: usr.name, title: usr.title, department: usr.department || null, role: usr.role, salary, dailyRate: daily != null ? Math.round(daily * 100) / 100 : null, deductions, totalDeduction, net: salary != null ? Math.round((salary - totalDeduction) * 100) / 100 : null,
          summary: { workdays, present, absent, paidLeave, unpaidLeave, lateMin: late, earlyMin: early, overtimeMin: over }, leaves: lv, days };
      });
      return ok({ month: q.month, org: { name: org.name, currency: org.currency }, generatedAt: new Date().toISOString(), generatedBy: u.name, dayBasis: basis, people });
    }    /* ── الصلاحيات (مسؤول النظام) ── */
    if (path === '/api/admin/permissions' && method === 'GET') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      return ok({ catalog: CATALOG, overrides: orgPerm, users: users.filter(x => x.active).map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title, extraPerms: extra[x.id] || [], deniedPerms: denied[x.id] || [], isAdmin: admins.has(x.id) })) });
    }
    if (path === '/api/admin/permissions' && method === 'PUT') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      Object.keys(orgPerm).forEach(k => delete orgPerm[k]);
      for (const [p, l] of Object.entries(body.overrides || {})) if (CATALOG[p] && l !== CATALOG[p].min) orgPerm[p] = l;
      logA(u, 'permissions.update', 'org', 1, orgPerm);
      return ok(null);
    }
    /* الأدمن الشامل: شخص واحد غير مدير الشركة، يعيّنه ويستبدله مدير الشركة وحده */
    if (path === '/api/admin/global-admin' && method === 'GET') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const cur = users.find(x => x.active !== false && x.role !== 'CEO' && admins.has(x.id));
      return ok({ current: cur ? person(cur.id) : null, canManage: u.role === 'CEO', candidates: users.filter(x => x.active !== false && x.role !== 'CEO').map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title })) });
    }
    if (path === '/api/admin/global-admin' && method === 'PUT') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (u.role !== 'CEO') return err(403, 'تعيين الأدمن الشامل أو استبداله لمدير الشركة فقط');
      const tid = body.userId == null ? null : +body.userId;
      if (tid) { const t = byId(tid); if (!t || t.active === false || t.role === 'CEO') return err(400, 'اختر موظفاً فعّالاً غير مدير الشركة'); }
      users.filter(x => x.role !== 'CEO').forEach(x => admins.delete(x.id));
      if (tid) { admins.add(tid); notifs.push({ id: ++seq, userId: tid, type: 'TASK', actor: u.name, text: 'عيّنك مدير الشركة أدمن شامل للنظام', link: '#/settings', read: false, createdAt: now() }); }
      logA(u, 'admin.global', 'user', tid || u.id, { userId: tid });
      savePV(); return ok(null);
    }    if ((m = path.match(/^\/api\/admin\/users\/(\d+)\/access$/)) && method === 'PUT') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const id = +m[1];
      if (body.deniedPerms) denied[id] = body.deniedPerms.filter(p => CATALOG[p]);
      if (body.extraPerms) extra[id] = body.extraPerms.filter(p => CATALOG[p] && !(denied[id] || []).includes(p));
      if (body.isAdmin !== undefined) return err(400, 'الأدمن الشامل يُعيَّنه مدير الشركة فقط من قسم «الأدمن الشامل»');
      logA(u, 'access.update', 'user', id, body);
      return ok(null);
    }
    if (path === '/api/admin/settings' && method === 'PATCH') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (body.name) org.name = body.name;
      if (body.currency) org.currency = body.currency;
      if (body.approvalLimits) org.approvalLimits = body.approvalLimits;
      if (body.settings && body.settings.taskStatuses) {
        const keep = new Set(body.settings.taskStatuses.map(s => s.key));
        const gone = (org.settings.taskStatuses || []).map(s => s.key).filter(k => !keep.has(k));
        tasks.forEach(t => { if (gone.includes(t.status)) t.status = 'TODO'; });
      }
      if (body.settings && body.settings.customItems) {
        const prev = org.settings.customItems || {};
        const redo = { priority: [tasks, 'priority', 'MEDIUM'], requestType: [requests, 'type', 'EXPENSE'], eventType: [events, 'type', 'MEETING'], projectStatus: [projects, 'status', 'ACTIVE'] };
        for (const g of Object.keys(redo)) {
          const keep = new Set((body.settings.customItems[g] || []).map(s => s.key));
          const gone = (prev[g] || []).map(s => s.key).filter(k => !keep.has(k));
          const [arr, field, fb] = redo[g];
          arr.forEach(x => { if (gone.includes(x[field])) x[field] = fb; });
        }
      }
      if (body.settings) org.settings = { ...org.settings, ...body.settings };
      if (body.applyLeaveToAll) users.forEach(x => { x.leaveEntitlement = org.settings.leaveDefault; });
      logA(u, 'org.update', 'org', 1, body);
      return ok(null);
    }
    if (path === '/api/admin/export') { if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء'); return ok({ exportedAt: now(), org, users, tasks, goals, projects, requests, events, announcements }); }

    /* ── الدعوات ── */
    if (path === '/api/invitations' && method === 'GET') {
      if (!can(u, 'admin') && !can(u, 'users.invite')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const list = invites.filter(i => can(u, 'admin') || i.invitedBy === u.id).slice().reverse();
      return ok(list.map(i => ({ ...i, status: i.status === 'PENDING' && new Date(i.expiresAt) < new Date() ? 'EXPIRED' : i.status })));
    }
    if (path === '/api/invitations' && method === 'POST') {
      if (!can(u, 'admin') && !can(u, 'users.invite')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      { const mx = (platformOrgs[0] || {}).maxUsers; if (mx != null && users.filter(x => x.active).length + invites.filter(i => i.status === 'PENDING').length >= mx) return err(409, 'وصلت الشركة للحد الأقصى من المستخدمين (' + mx + '). عطّل مستخدماً أو تواصل مع مزوّد المنصة لزيادة العدد.'); }
      if (!can(u, 'admin') && LEVEL[body.role] >= LEVEL[u.role]) return err(403, 'ما تقدر تدعو بدور بمستواك أو أعلى');
      if (users.some(x => x.email === body.email)) return err(409, 'هذا البريد مسجّل مسبقاً بحساب');
      if (invites.some(i => i.email === body.email && i.status === 'PENDING')) return err(409, 'توجد دعوة سارية لهذا البريد — ألغها أولاً أو أعد إرسالها');
      const days = org.settings.inviteDays;
      const inv = { id: ++seq, email: body.email, name: body.name || null, role: body.role, managerId: body.managerId || u.id, title: body.title || null, department: body.department || null, status: 'PENDING', invitedBy: u.id, expiresAt: new Date(Date.now() + days * 864e5).toISOString(), createdAt: now() };
      invites.push(inv); logA(u, 'invite.create', 'invitation', inv.id, { email: inv.email, role: inv.role });
      return ok({ id: inv.id, link: location.origin + '/join?token=demo-' + inv.id + '-' + Math.random().toString(36).slice(2, 10), expiresAt: inv.expiresAt }, 201);
    }
    if ((m = path.match(/^\/api\/invitations\/(\d+)\/renew$/)) && method === 'POST') {
      const inv = invites.find(i => i.id === +m[1]); if (!inv) return err(404, 'الدعوة غير موجودة');
      inv.status = 'PENDING'; inv.expiresAt = new Date(Date.now() + org.settings.inviteDays * 864e5).toISOString();
      return ok({ link: location.origin + '/join?token=demo-' + inv.id + '-' + Math.random().toString(36).slice(2, 10), expiresAt: inv.expiresAt });
    }
    if ((m = path.match(/^\/api\/invitations\/(\d+)$/)) && method === 'DELETE') {
      const inv = invites.find(i => i.id === +m[1]); if (!inv) return err(404, 'الدعوة غير موجودة');
      if (q.permanent === '1') { invites.splice(invites.indexOf(inv), 1); logA(u, 'invite.delete', 'invitation', inv.id, { email: inv.email }); return ok(null); }
      inv.status = 'REVOKED'; logA(u, 'invite.revoke', 'invitation', inv.id, { email: inv.email });
      return ok(null);
    }

    /* ── مالك المنصة ── */
    if (path === '/api/platform/orgs' && method === 'GET') return u.id === 1 ? ok(platformOrgs.map(o => ({ ...o, activeUsers: o.id === 1 ? users.filter(x => x.active).length : Math.max(0, o.users - 1) }))) : err(403, 'ليست لديك صلاحية لهذا الإجراء');
    if (path === '/api/platform/orgs' && method === 'POST') {
      if (u.id !== 1) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (users.some(x => x.email === (body.email || '').toLowerCase())) return err(409, 'هذا البريد مسجّل مسبقاً');
      const o = { id: ++seq, name: body.company, users: 1, tasks: 0, suspended: false, maxUsers: body.maxUsers || null, createdAt: now(), ceo: { name: body.name, email: body.email, lastLoginAt: null } };
      platformOrgs.push(o);
      return ok({ id: o.id, tempPassword: 'Tmp-' + Math.random().toString(36).slice(2, 10) }, 201);
    }
    if ((m = path.match(/^\/api\/platform\/orgs\/(\d+)$/)) && method === 'PATCH') {
      const o = platformOrgs.find(x => x.id === +m[1]); if (!o) return err(404, 'غير موجود');
      if (body.suspended !== undefined) o.suspended = !!body.suspended;
      if (body.maxUsers !== undefined) o.maxUsers = body.maxUsers;
      return ok(null);
    }

    /* ═══ بحث شامل ═══ */
    if (path === '/api/search') {
      const ql = String(q.q || '').toLowerCase();
      if (ql.length < 2) return err(400, 'اكتب حرفين على الأقل');
      const has = s => String(s || '').toLowerCase().includes(ql);
      const snip = s => { s = String(s || ''); const i = s.toLowerCase().indexOf(ql); return i < 0 ? s.slice(0, 90) : (i > 35 ? '…' : '') + s.slice(Math.max(0, i - 35), i + ql.length + 55).replace(/\s+/g, ' '); };
      const strip = s => String(s || '').replace(/@\[(\d+)\]/g, '@');
      const out = [];
      tasks.filter(taskVisible(u, sc)).forEach(t => {
        if (has(t.title) || has(t.description)) out.push({ type: 'task', id: t.id, title: t.title, snippet: snip(t.description), meta: 'مهمة' });
        t.comments.filter(c => has(c.body)).forEach(c => out.push({ type: 'task', id: t.id, title: t.title, snippet: `${byId(c.userId).name}: ${snip(strip(c.body))}`, meta: 'تعليق على مهمة' }));
      });
      projects.forEach(p => { if (has(p.name) || has(p.description)) out.push({ type: 'project', id: p.id, title: p.name, snippet: snip(p.description), meta: 'مشروع' }); });
      projectComments.filter(c => has(c.body)).forEach(c => { const p = projects.find(x => x.id === c.projectId); if (p) out.push({ type: 'project', id: p.id, title: p.name, snippet: `${byId(c.userId).name}: ${snip(strip(c.body))}`, meta: 'تعليق على مشروع' }); });
      requests.filter(r => sc.has(r.requesterId) || r.currentApproverId === u.id).forEach(r => { if (has(r.title) || has(r.details)) out.push({ type: 'request', id: r.id, title: r.title, snippet: snip(r.details), meta: 'طلب' }); });
      requestComments.filter(c => has(c.body)).forEach(c => { const r = requests.find(x => x.id === c.requestId); if (r) out.push({ type: 'request', id: r.id, title: r.title, snippet: `${byId(c.userId).name}: ${snip(c.body)}`, meta: 'نقاش على طلب' }); });
      announcements.filter(a => a.audience === 'COMPANY' || a.authorId === u.id || (a.audience === 'TEAM' && desc(a.authorId).has(u.id)) || (a.audience === 'CUSTOM' && (a.recipientIds || []).includes(u.id)))
        .filter(a => has(a.title) || has(a.body)).forEach(a => out.push({ type: 'announcement', id: a.id, title: a.title, snippet: snip(a.body), meta: 'تعميم' }));
      events.filter(e => (e.companyWide || e.attendees.some(a => a.userId === u.id)) && (has(e.title) || has(e.description) || has(e.location)))
        .forEach(e => out.push({ type: 'event', id: e.id, title: e.title, snippet: snip(e.description), meta: 'موعد' }));
      goals.filter(g => has(g.title)).forEach(g => out.push({ type: 'goal', id: g.id, title: g.title, snippet: g.period, meta: 'هدف' }));
      files.filter(f => has(f.name)).forEach(f => out.push({ type: 'file', id: f.id, title: f.name, snippet: '', meta: 'ملف مرفق', mime: f.mime, url: f.url, size: f.size }));
      users.filter(x => x.active && (has(x.name) || has(x.title) || has(x.department))).forEach(x => out.push({ type: 'person', id: x.id, title: x.name, snippet: [x.title, x.department].filter(Boolean).join(' · '), meta: 'شخص' }));
      return ok({ q: q.q, results: out.slice(0, 40) });
    }

    /* ═══ التقييمات ═══ */
    const rvJSON = r => ({ id: r.id, cycle: r.cycle, status: r.status, overall: r.overall, employee: { ...person(r.employeeId), title: byId(r.employeeId).title }, reviewer: { ...person(r.reviewerId), title: byId(r.reviewerId).title }, submittedAt: r.submittedAt, acknowledgedAt: r.acknowledgedAt });
    if (path === '/api/reviews' && method === 'GET') {
      let list = reviews.filter(r => !q.cycle || r.cycle === q.cycle);
      if (q.box === 'given') list = list.filter(r => r.reviewerId === u.id);
      else if (q.box === 'team') list = list.filter(r => r.employeeId !== u.id && sc.has(r.employeeId) && r.status !== 'DRAFT');
      else list = list.filter(r => r.employeeId === u.id && r.status !== 'DRAFT');
      return ok(list.slice().reverse().map(rvJSON));
    }
    if (path === '/api/reviews' && method === 'POST') {
      if (!can(u, 'team.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (!sc.has(body.employeeId) || body.employeeId === u.id) return err(403, 'تقدر تقيّم من تحتك فقط');
      const ex = reviews.find(r => r.cycle === body.cycle && r.employeeId === body.employeeId);
      if (ex) return ok({ id: ex.id, existing: true });
      const r = { id: ++seq, cycle: body.cycle, employeeId: body.employeeId, reviewerId: u.id, status: 'DRAFT', ratings: {}, overall: null, strengths: null, improvements: null, nextGoals: null, employeeComment: null, submittedAt: null, acknowledgedAt: null };
      reviews.push(r); return ok({ id: r.id }, 201);
    }
    if ((m = path.match(/^\/api\/reviews\/(\d+)$/))) {
      const r = reviews.find(x => x.id === +m[1]);
      if (!r || !(r.reviewerId === u.id || (r.status !== 'DRAFT' && (r.employeeId === u.id || sc.has(r.employeeId))))) return err(404, 'التقييم غير موجود');
      if (method === 'GET') {
        const done = tasks.filter(t => t.assigneeId === r.employeeId && t.status === 'DONE');
        const gl = goals.filter(g => g.ownerId === r.employeeId);
        const att = attendance.filter(a => a.userId === r.employeeId);
        return ok({ ...rvJSON(r), ratings: r.ratings || {}, strengths: r.strengths, improvements: r.improvements, nextGoals: r.nextGoals, employeeComment: r.employeeComment,
          stats: { tasksDone: done.length, onTimeRate: done.length ? 80 : null, overdueOpen: tasks.filter(t => t.assigneeId === r.employeeId && t.status !== 'DONE' && t.dueDate && t.dueDate < day(0)).length,
            goals: gl.length, goalProgress: gl.length ? Math.round(gl.reduce((s, g) => s + krProgress(g), 0) / gl.length) : null, attendanceDays: att.length, lateDays: att.filter(a => attMetrics(a, byId(r.employeeId)).lateMin > 0).length, overtimeHours: 1.5 },
          canEdit: r.reviewerId === u.id && r.status !== 'ACKNOWLEDGED', canAcknowledge: r.employeeId === u.id && r.status === 'SUBMITTED' });
      }
      if (method === 'PATCH') { if (r.reviewerId !== u.id) return err(404, 'التقييم غير موجود'); Object.assign(r, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return ok(null); }
      if (method === 'DELETE') { reviews.splice(reviews.indexOf(r), 1); return ok(null); }
    }
    if ((m = path.match(/^\/api\/reviews\/(\d+)\/submit$/)) && method === 'POST') {
      const r = reviews.find(x => x.id === +m[1]);
      if (!r || r.reviewerId !== u.id) return err(404, 'التقييم غير موجود');
      if (!r.overall || !r.ratings || ['quality', 'delivery', 'teamwork', 'initiative', 'communication'].some(k => !r.ratings[k])) return err(400, 'أكمل كل معايير التقييم والتقييم العام قبل الإرسال');
      r.status = 'SUBMITTED'; r.submittedAt = now();
      notifs.push({ id: ++seq, userId: r.employeeId, type: 'TASK', actor: u.name, text: `تقييم أدائك لفترة ${r.cycle} جاهز للاطّلاع`, link: '#/reviews', read: false, createdAt: now() });
      return ok(null);
    }
    if ((m = path.match(/^\/api\/reviews\/(\d+)\/acknowledge$/)) && method === 'POST') {
      const r = reviews.find(x => x.id === +m[1]);
      if (!r || r.employeeId !== u.id || r.status !== 'SUBMITTED') return err(409, 'لا يمكن الإقرار الآن');
      r.status = 'ACKNOWLEDGED'; r.acknowledgedAt = now(); r.employeeComment = body.comment || null; return ok(null);
    }

    /* ═══ السياسات ═══ */
    const polAcked = p => policyAcks.some(a => a.policyId === p.id && a.userId === u.id && a.version === p.version);
    if (path === '/api/policies/summary') return ok({ pending: policies.filter(p => p.requireAck && !polAcked(p)).length });
    if (path === '/api/policies' && method === 'GET') {
      return ok(policies.map(p => ({ id: p.id, title: p.title, category: p.category, version: p.version, requireAck: p.requireAck, updatedAt: p.updatedAt, author: person(p.authorId), acknowledged: polAcked(p),
        ...(can(u, 'policies.manage') && p.requireAck ? { ackCount: policyAcks.filter(a => a.policyId === p.id && a.version === p.version).length, totalUsers: users.filter(x => x.active).length } : {}) })));
    }
    if (path === '/api/policies' && method === 'POST') {
      if (!can(u, 'policies.manage')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const p = { id: ++seq, title: body.title, category: body.category || null, body: body.body, requireAck: body.requireAck !== false, version: 1, authorId: u.id, updatedAt: now(), createdAt: now() };
      policies.push(p); logA(u, 'policy.create', 'policy', p.id, {}); return ok({ id: p.id }, 201);
    }
    if ((m = path.match(/^\/api\/policies\/(\d+)$/))) {
      const p = policies.find(x => x.id === +m[1]);
      if (!p) return err(404, 'السياسة غير موجودة');
      if (method === 'GET') {
        const out = { id: p.id, title: p.title, category: p.category, body: p.body, version: p.version, requireAck: p.requireAck, updatedAt: p.updatedAt, createdAt: p.createdAt, author: person(p.authorId), acknowledged: polAcked(p), canManage: can(u, 'policies.manage') };
        if (out.canManage && p.requireAck) out.people = users.filter(x => x.active).map(x => ({ id: x.id, name: x.name, role: x.role, department: x.department, at: (policyAcks.find(a => a.policyId === p.id && a.userId === x.id && a.version === p.version) || {}).at || null }));
        return ok(out);
      }
      if (!can(u, 'policies.manage')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (method === 'PATCH') { if (body.body !== undefined && body.body !== p.body) p.version++; Object.assign(p, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)), { updatedAt: now() }); return ok(null); }
      if (method === 'DELETE') { policies.splice(policies.indexOf(p), 1); return ok(null); }
    }
    if ((m = path.match(/^\/api\/policies\/(\d+)\/ack$/)) && method === 'POST') {
      const p = policies.find(x => x.id === +m[1]);
      if (!p) return err(404, 'السياسة غير موجودة');
      if (!polAcked(p)) policyAcks.push({ policyId: p.id, userId: u.id, version: p.version, at: now() });
      return ok(null);
    }

    /* ═══ التحليلات ═══ */
    if (path === '/api/analytics') {
      if (!can(u, 'reports.view')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      const n = +q.weeks || 12;
      const ids = [...sc].filter(i => byId(i).active);
      const base = tasks.filter(t => sc.has(t.assigneeId)).length + 3;
      const weeks = Array.from({ length: n }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (n - 1 - i) * 7 - ((d.getDay() + 6) % 7));
        const done = Math.max(0, Math.round(base * 0.5 + ((i * 7 + 3) % 5) + i * 0.25));
        const created = Math.max(0, Math.round(base * 0.6 + ((i * 5 + 1) % 4) + i * 0.15));
        return { start: d.toISOString().slice(0, 10), created, done, late: Math.round(done * (0.15 + ((i * 3) % 4) / 20)), attendance: 0, attendanceRate: Math.min(100, 78 + ((i * 11) % 18)), lateDays: (i * 5) % 4 };
      });
      const deptSpend = {};
      requests.filter(r => r.status === 'APPROVED' && r.type !== 'LEAVE' && sc.has(r.requesterId)).forEach(r => { const d = byId(r.requesterId).department || 'بدون قسم'; deptSpend[d] = (deptSpend[d] || 0) + r.amount; });
      if (!Object.keys(deptSpend).length) Object.assign(deptSpend, { 'المبيعات': 3250000, 'التسويق': 1800000, 'المالية': 640000 });
      const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + i); return { month: d.toISOString().slice(0, 7), total: 400000 + ((i * 7) % 5) * 380000 }; });
      const lv = {};
      requests.filter(r => r.type === 'LEAVE' && r.status === 'APPROVED' && sc.has(r.requesterId)).forEach(r => { const k = r.leaveType || 'annual'; lv[k] = (lv[k] || 0) + Math.round((new Date(r.endDate) - new Date(r.startDate)) / 864e5) + 1; });
      const nm = Object.fromEntries((org.settings.leaveTypes || []).map(t => [t.key, t.name]));
      if (!Object.keys(lv).length) Object.assign(lv, { annual: 12, sick: 3 });
      return ok({ weeks, spendByDept: Object.entries(deptSpend).map(([department, total]) => ({ department, total })).sort((a, b) => b.total - a.total),
        spendByMonth: months, leaveByType: Object.entries(lv).map(([key, days]) => ({ key, name: nm[key] || key, days })), people: ids.length });
    }

    /* ═══ التكاملات ═══ */
    if (path === '/api/integrations/ics') return ok({ url: location.origin + '/cal/' + (u.icsToken || (u.icsToken = 'demo' + u.id + 'a1b2c3d4e5f6')) + '.ics' });
    if (path === '/api/integrations/ics/reset') { u.icsToken = 'demo' + u.id + Math.random().toString(36).slice(2, 12); return ok({ url: location.origin + '/cal/' + u.icsToken + '.ics' }); }
    if (path === '/api/integrations/webhooks' && method === 'GET') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      return ok({ available: ['task.created', 'task.done', 'request.created', 'request.approved', 'request.rejected', 'announcement.created', 'user.joined'], hooks: webhooks });
    }
    if (path === '/api/integrations/webhooks' && method === 'POST') {
      if (!can(u, 'admin')) return err(403, 'ليست لديك صلاحية لهذا الإجراء');
      if (!/^https:\/\//.test(body.url || '')) return err(400, 'الرابط لازم يكون https');
      const h = { id: ++seq, url: body.url, events: body.events, active: true, lastStatus: null, lastAt: null };
      webhooks.push(h); return ok({ id: h.id, secret: Array.from({ length: 48 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('') }, 201);
    }
    if ((m = path.match(/^\/api\/integrations\/webhooks\/(\d+)(\/test)?$/))) {
      const h = webhooks.find(x => x.id === +m[1]);
      if (!h) return err(404, 'غير موجود');
      if (m[2]) { h.lastStatus = 200; h.lastAt = now(); return ok({ status: 200 }); }
      if (method === 'PATCH') { Object.assign(h, body); return ok(null); }
      if (method === 'DELETE') { webhooks.splice(webhooks.indexOf(h), 1); return ok(null); }
    }
    if (path === '/api/integrations/whatsapp' && method === 'PATCH') {
      const cur = org.settings.whatsapp || {};
      org.settings.whatsapp = { enabled: body.enabled !== false, phoneNumberId: body.phoneNumberId ?? cur.phoneNumber ?? cur.phoneNumberId ?? '', countryCode: body.countryCode || cur.countryCode || '964', configured: !!(body.token || cur.configured) };
      return ok(null);
    }
    if (path === '/api/integrations/whatsapp/test') return ok({ ok: true });

    if (path === '/api/audit') return ok(can(u, 'audit.view') ? audit : []);

    return err(404, 'غير موجود');
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body; try { body = init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
    const r = handle(method, url.replace(/[?&]_=\d+/, ''), body);
    if (method !== 'GET') savePV();
    const res = new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    return new Promise(resolve => setTimeout(() => resolve(res), 60));
  };

  /* شريط تبديل المستخدم */
  const mountBar = () => { if (!authed() || document.getElementById('pvBar')) return;
    const ROLE = { EMPLOYEE: 'موظف', MANAGER: 'مدير قسم', DIRECTOR: 'مدير إدارة', GM: 'المدير العام', CEO: 'المدير التنفيذي' };
    const bar = document.createElement('div'); bar.id = 'pvBar';
    bar.style.cssText = 'position:relative;z-index:300;background:#031A4D;color:#fff;display:flex;gap:10px;align-items:center;justify-content:center;padding:8px 12px;font:600 13px Alexandria,system-ui,sans-serif;flex-wrap:wrap';
    bar.innerHTML = '<span>معاينة — شاهد المنصة كـ:</span><select id="pvUser" style="padding:5px 10px;border-radius:8px;border:0;font:inherit"></select><span style="opacity:.7;font-weight:500">بيانات وهمية داخل المتصفح</span>';
    bar.style.position='fixed'; bar.style.bottom='0'; bar.style.left='0'; bar.style.right='0'; bar.style.zIndex='9999'; bar.style.padding='5px 10px'; document.documentElement.appendChild(bar);
    /* الجوال: لوحة التبديل تصير زراً عائماً صغيراً يفتح اللوحة عند الضغط (حتى لا تغطي الشاشة) */
    if (window.matchMedia('(max-width:860px)').matches) {
      const full = bar; full.style.cssText += ';display:none;bottom:calc(200px + env(safe-area-inset-bottom));left:8px;right:8px;border-radius:14px;flex-direction:column;padding:10px';
      const fab = document.createElement('button'); fab.id = 'pvFab'; fab.type = 'button'; fab.setAttribute('aria-label', 'تبديل المستخدم (معاينة)');
      fab.style.cssText = 'position:fixed;z-index:9999;left:10px;bottom:calc(150px + env(safe-area-inset-bottom));width:40px;height:40px;border-radius:50%;border:0;background:#031A4D;color:#fff;font:700 15px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;opacity:.85';
      fab.textContent = '👤';
      fab.addEventListener('click', () => { const on = full.style.display === 'none'; full.style.display = on ? 'flex' : 'none'; });
      document.documentElement.appendChild(fab);
    }
    const sel = bar.querySelector('select');
    sel.innerHTML = users.slice().sort((a, b) => LEVEL[b.role] - LEVEL[a.role]).map(x => `<option value="${x.id}" ${x.id === meId ? 'selected' : ''}>${ROLE[x.role]} — ${x.name}</option>`).join('');
    sel.addEventListener('change', () => { try { localStorage.setItem('pv-user', sel.value); } catch (e) {} location.reload(); });
    const rs = document.createElement('button');
    rs.textContent = 'إعادة ضبط البيانات';
    rs.style.cssText = 'background:#ffffff22;color:#fff;border:0;border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer';
    rs.addEventListener('click', () => { try { localStorage.removeItem('pv-state-v5'); } catch (e) {} location.reload(); });
    bar.appendChild(rs);
  };
  setInterval(() => { try { mountBar(); } catch (e) {} }, 800);
})();
