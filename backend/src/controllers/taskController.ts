import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Task from '../models/Task';
import User from '../models/User';
import ActivityLog from '../models/ActivityLog';
import Role from '../models/Role';
import Notification from '../models/Notification';
import { notifyUser } from '../utils/notificationService';

const serialize = (task: any) => {
  const plain = task.toJSON ? task.toJSON() : task;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
};

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
    if (userRole !== 'Administrator' && userRole !== 'Sales Manager') {
      whereClause.assignedToId = req.user?.id;
    }

    const tasks = await Task.findAll({
      where: whereClause,
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }],
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
    const { title, type, priority, dueDate, status, relatedTo, description, assignedToId } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const task = await Task.create({
      title,
      type: type || 'task',
      priority: priority || 'medium',
      status: status || 'pending',
      dueDate: dueDate || null,
      relatedTo: relatedTo || null,
      description: description || null,
      assignedToId: assignedToId || req.user?.id || null,
    });

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
    return res.status(500).json({ message: 'Server error while creating task' });
  }
};

export const updateTask = async (req: Request & { user?: any }, res: Response) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const { title, type, priority, dueDate, status, relatedTo, description, assignedToId } = req.body;
    const previousAssigneeId = task.assignedToId;

    await task.update({
      title: title ?? task.title,
      type: type ?? task.type,
      priority: priority ?? task.priority,
      status: status ?? task.status,
      dueDate: dueDate ?? task.dueDate,
      relatedTo: relatedTo ?? task.relatedTo,
      description: description ?? task.description,
      assignedToId: assignedToId ?? task.assignedToId,
    });

    await task.reload({ include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }] });

    await ActivityLog.create({
      action: 'updated',
      entityType: 'Task',
      entityId: task.id,
      performedById: req.user?.id || null,
      details: `Task "${task.title}" updated.`,
    });

    if (assignedToId && assignedToId !== previousAssigneeId && assignedToId !== req.user?.id) {
      await notifyUser({
        userId: assignedToId,
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
    if (userRole !== 'Administrator' && userRole !== 'Sales Manager') {
      whereClause.assignedToId = req.user?.id;
    }

    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const includeUser = [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }];

    const [pendingTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks, completedCount] = await Promise.all([
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.lt]: now } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.between]: [now, endOfToday] } }, include: includeUser, order: [['dueDate', 'ASC']] }),
      Task.findAll({ where: { ...whereClause, status: { [Op.ne]: 'completed' }, dueDate: { [Op.between]: [now, endOfWeek] } }, include: includeUser, order: [['dueDate', 'ASC']] }),
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
