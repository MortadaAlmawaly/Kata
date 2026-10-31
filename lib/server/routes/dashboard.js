/* لوحات المتابعة حسب الدور:
   الكل: أرقامي. مدير قسم+: أداء كل مباشر تحتي (مع كل فرعه). مدير+: نظرة المنظمة. */
const express = require('../express');
const prisma = require('../db');
const { z, today, fromDate, toDate, num } = require('../validate');
const { can, level } = require('../permissions');
const { descendants } = require('../hierarchy');
const { progressOf } = require('./goals');

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  const { today: clientToday } = z.object({ today: z.string().optional() }).parse(req.query);
  const todayStr = today(clientToday);
  const todayDate = toDate(todayStr);
  const since = new Date(Date.now() - 30 * 864e5);
  const me = req.user.id;
  const scopeIds = [...req.scope];

  /* مهام النطاق: المفتوحة + المنجزة آخر 30 يوم */
  const tasks = await prisma.task.findMany({
    where: {
      orgId: req.user.orgId, assigneeId: { in: scopeIds },
      OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: since } }],
    },
    select: { assigneeId: true, status: true, dueDate: true, completedAt: true, priority: true },
  });
  const isOpen = t => t.status !== 'DONE';
  const isOverdue = t => isOpen(t) && t.dueDate && t.dueDate < todayDate;
  const summarize = list => {
    const open = list.filter(isOpen);
    const done = list.length - open.length;
    return {
      open: open.length,
      overdue: open.filter(isOverdue).length,
      urgent: open.filter(t => t.priority === 'URGENT').length,
      inReview: open.filter(t => t.status === 'REVIEW').length,
      done30: done,
      completion: list.length ? Math.round((done / list.length) * 100) : null,
    };
  };

  const myTasks = tasks.filter(t => t.assigneeId === me);
  const [myGoals, inbox, myPending] = await Promise.all([
    prisma.goal.findMany({
      where: { orgId: req.user.orgId, ownerId: me, status: 'ACTIVE' },
      include: { keyResults: true },
    }),
    prisma.request.count({ where: { currentApproverId: me, status: 'PENDING' } }),
    prisma.request.count({ where: { requesterId: me, status: 'PENDING' } }),
  ]);
  const goalProgress = myGoals.length
    ? Math.round(myGoals.reduce((s, g) => s + progressOf(g.keyResults), 0) / myGoals.length)
    : null;

  const out = {
    today: todayStr,
    me: { ...summarize(myTasks), goals: myGoals.length, goalProgress, inbox, pendingRequests: myPending },
  };

  /* الفريق: كل مباشر تحتي + مرؤوسيه */
  if (req.can('team.view')) {
    const direct = (req.index.kids.get(me) || []).map(id => req.index.byId.get(id)).filter(u => u.active);
    const teamIds = direct.map(d => [d.id, ...descendants(req.index, d.id)]);
    const owners = await prisma.goal.findMany({
      where: { orgId: req.user.orgId, status: 'ACTIVE', ownerId: { in: scopeIds } },
      include: { keyResults: true },
    });
    out.team = direct.map((d, i) => {
      const ids = new Set(teamIds[i]);
      const goals = owners.filter(g => ids.has(g.ownerId));
      return {
        id: d.id, name: d.name, role: d.role, title: d.title, headcount: ids.size,
        ...summarize(tasks.filter(t => ids.has(t.assigneeId))),
        goalProgress: goals.length ? Math.round(goals.reduce((s, g) => s + progressOf(g.keyResults), 0) / goals.length) : null,
      };
    });
  }

  /* المنظمة */
  if (req.can('org.view')) {
    const monthStart = new Date(Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, 1));
    const [byRole, spend, pendingAll] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: { orgId: req.user.orgId, active: true }, _count: true }),
      prisma.request.aggregate({
        where: { orgId: req.user.orgId, status: 'APPROVED', type: { not: 'LEAVE' }, decidedAt: { gte: monthStart } },
        _sum: { amount: true }, _count: true,
      }),
      prisma.request.count({ where: { orgId: req.user.orgId, status: 'PENDING' } }),
    ]);
    out.org = {
      headcount: Object.fromEntries(byRole.map(r => [r.role, r._count])),
      tasks: summarize(tasks),
      approvedThisMonth: { count: spend._count, amount: num(spend._sum.amount) || 0 },
      pendingRequests: pendingAll,
    };
  }
  out.level = level(req.user.role);
  res.json(out);
});

module.exports = router;
