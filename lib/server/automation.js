/* أتمتة المهام (Automation) — قواعد بسيطة من إعدادات الشركة:
   المشغّل (trigger): MANUAL (زر ⚡ داخل المهمة) · STATUS_CHANGED (عند الانتقال لحالة معيّنة) · CREATED (عند الإنشاء).
   الإجراءات (actions): setStatus · setPriority · assign · addLabel · notify · comment · startTimer · stopTimer · setField.
   القواعد الآلية لا تُطلق قواعد أخرى (عمق 1) لمنع الحلقات. كل تنفيذ يُسجَّل بسجل المهمة. */
const prisma = require('./db');
const { notify } = require('./audit');
const { isValid } = require('./customItems');
const { cleanCustomValues, mergeCustom } = require('./customFields');
const { logChanges, keyOf } = require('./issues');

const ACTIONS = ['setStatus', 'setPriority', 'assign', 'addLabel', 'notify', 'comment', 'startTimer', 'stopTimer', 'setField'];
const TRIGGERS = ['MANUAL', 'STATUS_CHANGED', 'CREATED'];

const rulesOf = settings => (settings && Array.isArray(settings.automations) ? settings.automations : []);

async function applyAction(req, task, a, state) {
  const settings = req.settings, orgId = req.user.orgId;
  const upd = {};
  const changes = [];
  switch (a.type) {
    case 'setStatus':
      if (isValid(settings, 'taskStatus', a.value) && a.value !== task.status) {
        upd.status = a.value; changes.push({ field: 'status', from: task.status, to: a.value });
        if (a.value === 'DONE') { upd.progress = 100; upd.completedAt = new Date(); }
      }
      break;
    case 'setPriority':
      if (isValid(settings, 'priority', a.value) && a.value !== task.priority) { upd.priority = a.value; changes.push({ field: 'priority', from: task.priority, to: a.value }); }
      break;
    case 'assign': {
      const id = Number(a.value);
      const u = req.index.byId.get(id);
      if (u && u.active && id !== task.assigneeId) {
        upd.assigneeId = id; changes.push({ field: 'assignee', from: (req.index.byId.get(task.assigneeId) || {}).name, to: u.name });
        await prisma.taskWatcher.createMany({ data: [{ taskId: task.id, userId: id }], skipDuplicates: true });
        await notify([id], `أُسندت إليك ${keyOf(task)} ${task.title}`, `#/tasks?open=${task.id}`, req.user.id, 'TASK', req.user.name);
      }
      break;
    }
    case 'addLabel': {
      const cur = Array.isArray(task.labels) ? task.labels : [];
      const l = String(a.value || '').trim().slice(0, 30);
      if (l && !cur.includes(l)) { upd.labels = [...cur, l].slice(0, 20); changes.push({ field: 'labels', from: cur.join('، '), to: upd.labels.join('، ') }); }
      break;
    }
    case 'notify': {
      const ids = (Array.isArray(a.value && a.value.userIds) ? a.value.userIds : []).map(Number).filter(id => req.index.byId.get(id) && req.index.byId.get(id).active);
      const text = String((a.value && a.value.text) || 'تنبيه من قاعدة أتمتة').slice(0, 200);
      if (ids.length) await notify(ids, `${text}: ${keyOf(task)} ${task.title}`, `#/tasks?open=${task.id}`, req.user.id, 'TASK', req.user.name);
      break;
    }
    case 'comment': {
      const text = String(a.value || '').trim().slice(0, 1000);
      if (text) await prisma.taskComment.create({ data: { taskId: task.id, userId: req.user.id, body: text } });
      break;
    }
    case 'startTimer':
      if (!task.timerUserId && !state.timerStarted) { upd.timerUserId = req.user.id; upd.timerStartedAt = new Date(); state.timerStarted = true; changes.push({ field: 'timer', from: null, to: 'بدء' }); }
      break;
    case 'stopTimer':
      if (task.timerUserId && task.timerStartedAt && !state.timerStopped) {
        const mins = Math.max(1, Math.round((Date.now() - new Date(task.timerStartedAt).getTime()) / 60000));
        await prisma.taskWorklog.create({ data: { taskId: task.id, userId: task.timerUserId, minutes: Math.min(mins, 1440), note: 'مؤقّت العمل', workedOn: new Date() } });
        upd.timerUserId = null; upd.timerStartedAt = null; state.timerStopped = true;
        changes.push({ field: 'worklog', from: null, to: `${mins} د` });
      }
      break;
    case 'setField': {
      const k = a.value && a.value.key;
      const clean = cleanCustomValues(settings, { [k]: a.value && a.value.value }, new Set(req.index.users.filter(u => u.active).map(u => u.id)));
      if (k in clean) { upd.customFields = mergeCustom(state.customFields ?? task.customFields, clean); state.customFields = upd.customFields; changes.push({ field: 'custom:' + k, from: null, to: clean[k] }); }
      break;
    }
    default: break;
  }
  if (Object.keys(upd).length) {
    await prisma.task.update({ where: { id: task.id }, data: upd });
    Object.assign(task, upd);
  }
  return changes;
}

/* يشغّل القواعد المطابقة. trigger/status/ruleId حسب الحدث. يرجع أسماء القواعد المنفّذة. */
async function runRules(req, taskId, trigger, { status, ruleId } = {}) {
  const rules = rulesOf(req.settings).filter(r => r.trigger === trigger
    && (trigger !== 'STATUS_CHANGED' || r.status === status) && (!ruleId || r.id === ruleId));
  if (!rules.length) return [];
  const task = await prisma.task.findFirst({ where: { id: taskId, orgId: req.user.orgId } });
  if (!task) return [];
  const state = {};
  const ran = [];
  for (const r of rules) {
    const all = [];
    for (const a of (r.actions || []).slice(0, 8)) {
      if (ACTIONS.includes(a.type)) all.push(...await applyAction(req, task, a, state));
    }
    all.push({ field: 'automation', from: null, to: r.name });
    await logChanges(task.id, req.user.id, all);
    ran.push(r.name);
  }
  return ran;
}

module.exports = { ACTIONS, TRIGGERS, rulesOf, runRules };
