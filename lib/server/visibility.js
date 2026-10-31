/* قواعد الرؤية المشتركة (B1): مصدر واحد تستعمله وحدات المهام والمشاريع والطلبات والبحث الشامل.
   دوال نقية: ما تلمس قاعدة البيانات، فتنفحص بالاختبارات بدون Prisma.
   req.user.orgId يجي دائماً من الجلسة (requireAuth)، وما ناخذه من الطلب أبداً. */

/* المهمة تظهر لي إذا المنفّذ ضمن نطاقي أو أنا اللي كلّفت بها، أو عبر لوحة/مساحة ممنوحة، وتنستثنى المساحات المخفية.
   (نفس المنطق اللي كان مكتوب داخل routes/tasks.js) */
const taskVisibleWhere = req => ({
  orgId: req.user.orgId,
  OR: [{ assigneeId: { in: [...req.scope] } }, { creatorId: req.user.id },
    ...(req.boardProjects && req.boardProjects.size ? [{ projectId: { in: [...req.boardProjects.keys()] } }] : []),
    ...(req.grantedSpaces && req.grantedSpaces.length ? [{ projectId: { in: req.grantedSpaces } }] : [])],
  ...(req.hiddenSpaces && req.hiddenSpaces.length ? { AND: [{ OR: [{ projectId: null }, { projectId: { notIn: req.hiddenSpaces } }] }] } : {}),
});

/* المشروع يظهر إذا مالكه ضمن نطاقي أو من رؤسائي، أو عندي مهمة بي ضمن نطاقي.
   upper = معرّفات الرؤساء (ancestors) تنحسب برا الدالة حتى تبقى نقية.
   (نفس المنطق اللي كان مكتوب داخل routes/projects.js) */
const projectVisibleWhere = (req, upper = []) => ({
  orgId: req.user.orgId,
  OR: [
    { ownerId: { in: [...req.scope, ...upper] } },
    { tasks: { some: { assigneeId: { in: [...req.scope] } } } },
  ],
});

/* الطلب (ومنه الإجازات والمصروفات) يظهر لصاحبه ولمن فوقه بالنطاق، وللموافق الحالي، ولأي موافق بخطواته.
   (نفس المنطق اللي كان مكتوب داخل routes/requests.js، وما يفرّق حسب نوع الطلب) */
const requestVisibleWhere = req => ({
  orgId: req.user.orgId,
  OR: [{ requesterId: { in: [...req.scope] } }, { currentApproverId: req.user.id }, { steps: { some: { approverId: req.user.id } } }],
});

/* نجمع فلتر الرؤية ويه شرط إضافي بـ AND، حتى ما ينكتب مفتاح OR فوق مفتاح OR مال الرؤية.
   orgId نكرره بالمستوى الأعلى من الجلسة كحزام أمان إضافي. */
const andWhere = (orgId, vis, extra) => ({ orgId, AND: [vis, extra] });

/* شروط البحث الشامل للمهام والمشاريع والطلبات وتعليقاتها */
function buildSearchWhere(req, q, upper = []) {
  const orgId = req.user.orgId;
  const has = { contains: q };
  const taskVis = taskVisibleWhere(req);
  const projVis = projectVisibleWhere(req, upper);
  const reqVis = requestVisibleWhere(req);
  return {
    task: andWhere(orgId, taskVis, { OR: [{ title: has }, { description: has }] }),
    taskComment: { body: has, task: taskVis },
    project: andWhere(orgId, projVis, { OR: [{ name: has }, { description: has }] }),
    projectComment: { body: has, project: projVis },
    request: andWhere(orgId, reqVis, { OR: [{ title: has }, { details: has }] }),
    requestComment: { body: has, request: reqVis },
  };
}

module.exports = { taskVisibleWhere, projectVisibleWhere, requestVisibleWhere, andWhere, buildSearchWhere };