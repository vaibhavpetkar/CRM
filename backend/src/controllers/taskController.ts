import { Request, Response } from 'express';
import { Op, ForeignKeyConstraintError, ValidationError } from 'sequelize';
import Task from '../models/Task';
import User from '../models/User';
import Lead from '../models/Lead';
import Deal from '../models/Deal';
import Contact from '../models/Contact';
import ActivityLog from '../models/ActivityLog';
import Role from '../models/Role';
import Notification from '../models/Notification';
import { notifyUser } from '../utils/notificationService';

// Included whenever a Task is fetched so the API returns the linked
// Lead/Deal/Contact record itself, not just a typed-in "relatedTo" string.
const relationIncludes = [
  { model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false },
  { model: Lead, attributes: ['id', 'firstName', 'lastName', 'company'], as: 'lead', required: false },
  { model: Deal, attributes: ['id', 'title'], as: 'deal', required: false },
  { model: Contact, attributes: ['id', 'firstName', 'lastName'], as: 'contact', required: false },
];

const serialize = (task: any) => {
  const plain = task.toJSON ? task.toJSON() : task;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
};

// leadId/dealId/contactId come from the client-side datalist and are normally
// valid, but the picked record can be stale (deleted or edited by someone
// else between page load and submit) or forged. Rather than let a bad FK
// bubble up as a bare 500, surface it as a normal 400 the form can show.
const isBadReferenceError = (error: unknown) =>
  error instanceof ForeignKeyConstraintError ||
  (error instanceof ValidationError && error.name === 'SequelizeValidationError');

export const getTasks = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { search, status, priority } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { relatedTo: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status && status !== 'all') whereClause.status = status;
    if (priority && priority !== 'all') whereClause.priority = priority;

    const userRole = req.user?.role?.name;
    const isSuperAdmin = req.user?.isSuperAdmin === true;
    if (!isSuperAdmin && userRole !== 'Sales Manager') {
      whereClause.assignedToId = req.user?.id;
    }

    const tasks = await Task.findAll({
      where: whereClause,
      include: relationIncludes,
      order: [['dueDate', 'ASC']],
    });

    return res.json({ tasks: tasks.map(serialize), total: tasks.length });
  } catch (error) {
    console.error('Get tasks error:', error);
    return res.status(500).json({ message: 'Server error while fetching tasks' });
  }
};

export const createTask = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { title, type, priority, dueDate, dueTime, status, relatedTo, leadId, dealId, contactId, description, assignedToId } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const task = await Task.create({
      title,
      type: type || 'call',
      priority: priority || 'medium',
      status: status || 'pending',
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      relatedTo: relatedTo || null,
      leadId: leadId || null,
      dealId: dealId || null,
      contactId: contactId || null,
      description: description || null,
      assignedToId: assignedToId || req.user?.id || null,
    });

    await task.reload({ include: relationIncludes });

    await ActivityLog.create({
      action: 'assigned',
      entityType: 'Task',
      entityId: task.id,
      performedById: req.user?.id || null,
      details: `Task "${title}" assigned to user ID ${task.assignedToId}.`,
    });

    if (task.assignedToId && task.assignedToId !== req.user?.id) {
      await notifyUser({
        userId: task.assignedToId,
        type: 'task_assigned',
        title: 'New task assigned to you',
        message: `You've been assigned the task "${task.title}"${task.dueDate ? ` (due ${new Date(task.dueDate).toLocaleDateString()})` : ''}.`,
        entityType: 'Task',
        entityId: task.id,
      });
    }

    return res.status(201).json({ message: 'Task created successfully', task: serialize(task) });
  } catch (error) {
    console.error('Create task error:', error);
    if (isBadReferenceError(error)) {
      return res.status(400).json({ message: 'The selected Lead, Deal, or Contact no longer exists. Please pick it again.' });
    }
    return res.status(500).json({ message: 'Server error while creating task' });
  }
};

export const updateTask = async (req: Request & { user?: any }, res: Response) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const { title, type, priority, dueDate, dueTime, status, relatedTo, leadId, dealId, contactId, description, assignedToId } = req.body;
    // Normalize to string for comparison — body values arrive as strings while
    // the DB value is a number, so `"5" !== 5` previously fired a spurious
    // assignment notification on every save where the assignee didn't change.
    const previousAssigneeId = task.assignedToId;
    const newAssigneeId = assignedToId !== undefined && assignedToId !== '' ? String(assignedToId) : null;
    const prevAssigneeId = previousAssigneeId !== null && previousAssigneeId !== undefined ? String(previousAssigneeId) : null;

    // Normalize '' -> null so empty date fields can be cleared without 500ing.
    const normDate = (v: any) => (v === '' ? null : v);
    const normNullable = (v: any) => (v === '' ? null : v);

    await task.update({
      title: title !== undefined ? title : task.title,
      type: type !== undefined ? type : task.type,
      priority: priority !== undefined ? priority : task.priority,
      status: status !== undefined ? status : task.status,
      dueDate: dueDate !== undefined ? normDate(dueDate) : task.dueDate,
      dueTime: dueTime !== undefined ? normDate(dueTime) : task.dueTime,
      relatedTo: relatedTo !== undefined ? normNullable(relatedTo) : task.relatedTo,
      leadId: leadId !== undefined ? normNullable(leadId) : task.leadId,
      dealId: dealId !== undefined ? normNullable(dealId) : task.dealId,
      contactId: contactId !== undefined ? normNullable(contactId) : task.contactId,
      description: description !== undefined ? normNullable(description) : task.description,
      assignedToId: assignedToId !== undefined ? (assignedToId === '' ? null : assignedToId) : task.assignedToId,
    });

    await task.reload({ include: relationIncludes });

    await ActivityLog.create({
      action: 'updated',
      entityType: 'Task',
      entityId: task.id,
      performedById: req.user?.id || null,
      details: `Task "${task.title}" updated.`,
    });

    if (newAssigneeId && newAssigneeId !== prevAssigneeId && newAssigneeId !== String(req.user?.id ?? '')) {
      await notifyUser({
        userId: Number(newAssigneeId),
        type: 'task_assigned',
        title: 'Task assigned to you',
        message: `You've been assigned the task "${task.title}"${task.dueDate ? ` (due ${new Date(task.dueDate).toLocaleDateString()})` : ''}.`,
        entityType: 'Task',
        entityId: task.id,
      });
    }

    return res.json({ message: 'Task updated successfully', task: serialize(task) });
  } catch (error) {
    console.error('Update task error:', error);
    if (isBadReferenceError(error)) {
      return res.status(400).json({ message: 'The selected Lead, Deal, or Contact no longer exists. Please pick it again.' });
    }
    return res.status(500).json({ message: 'Server error while updating task' });
  }
};

export const deleteTask = async (req: Request & { user?: any }, res: Response) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    await task.destroy();

    await ActivityLog.create({
      action: 'deleted',
      entityType: 'Task',
      entityId: task.id,
      performedById: req.user?.id || null,
      details: `Task "${task.title}" deleted (soft delete).`,
    });

    return res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Scans for tasks that are overdue (due date in the past, not completed) and haven't
 * already had an overdue notification sent, then notifies each assignee once.
 * Called lazily from getTaskDashboard rather than run as a background cron job,
 * since this environment doesn't run a persistent process for scheduled jobs.
 */
export const checkOverdueTasks = async (): Promise<number> => {
  const overdueTasks = await Task.findAll({
    where: {
      status: { [Op.ne]: 'completed' },
      dueDate: { [Op.lt]: new Date() },
    },
  });

  let notifiedCount = 0;

  for (const task of overdueTasks) {
    if (!task.assignedToId) continue;

    // Avoid spamming: skip if we already sent an overdue notification for this task.
    const alreadyNotified = await Notification.findOne({
      where: { type: 'task_overdue', entityType: 'Task', entityId: task.id },
    });
    if (alreadyNotified) continue;

    await notifyUser({
      userId: task.assignedToId,
      type: 'task_overdue',
      title: 'Task overdue',
      message: `The task "${task.title}" was due on ${new Date(task.dueDate as Date).toLocaleDateString()} and is still ${task.status}.`,
      entityType: 'Task',
      entityId: task.id,
    });

    await ActivityLog.create({
      action: 'overdue',
      entityType: 'Task',
      entityId: task.id,
      performedById: null,
      details: `Task "${task.title}" is overdue.`,
    });

    notifiedCount += 1;
  }

  return notifiedCount;
};

/**
 * Dashboard summary: pending tasks (grouped by priority), overdue tasks, and
 * tasks due today/this week — scoped to the requesting user unless they're a
 * manager/admin, in which case it covers everyone (mirrors getTasks scoping).
 */
export const getTaskDashboard = async (req: Request & { user?: any }, res: Response) => {
  try {
    // Lazily surface overdue notifications whenever the dashboard is viewed.
    await checkOverdueTasks();

    const whereClause: any = {};
    const userRole = req.user?.role?.name;
    const isSuperAdmin = req.user?.isSuperAdmin === true;
    if (!isSuperAdmin && userRole !== 'Sales Manager') {
      whereClause.assignedToId = req.user?.id;
    }

    const now = new Date();
    // Tasks due earlier today were landing in the Overdue bucket because the
    // overdue query used `dueDate < now`. Buckets are now day-aligned so they
    // don't overlap mid-day: overdue = before today, due today = any time today,
    // due this week = the actual calendar week (today .. end of week).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    const includeUser = [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }];

    const [pendingTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks, completedCount] = await Promise.all([
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.lt]: startOfToday } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.between]: [startOfToday, endOfToday] } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.between]: [startOfToday, endOfWeek] } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.count({ where: { ...whereClause, status: 'completed' } }),
    ]);

    const byPriority = pendingTasks.reduce((acc: Record<string, number>, t: any) => {
      acc[t.priority] = (acc[t.priority] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      pendingCount: pendingTasks.length,
      overdueCount: overdueTasks.length,
      dueTodayCount: dueTodayTasks.length,
      dueThisWeekCount: dueThisWeekTasks.length,
      completedCount,
      byPriority,
      pendingTasks: pendingTasks.map(serialize),
      overdueTasks: overdueTasks.map(serialize),
      dueTodayTasks: dueTodayTasks.map(serialize),
    });
  } catch (error) {
    console.error('Get task dashboard error:', error);
    return res.status(500).json({ message: 'Server error while fetching task dashboard' });
  }
};
