import { Request, Response } from 'express';
import ActivityLog from '../models/ActivityLog';
import User from '../models/User';

export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const logs = await ActivityLog.findAndCountAll({
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: (parseInt(page as string) - 1) * parseInt(limit as string),
    });

    return res.json({
      logs: logs.rows,
      total: logs.count,
      page: parseInt(page as string),
      pages: Math.ceil(logs.count / parseInt(limit as string)),
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Returns the full activity timeline for a single record (e.g. a Lead, Deal,
 * Contact, Quote, Invoice, or Task), most recent first. Used to render an
 * "Activity" tab on a record's detail page.
 */
export const getEntityTimeline = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    const logs = await ActivityLog.findAll({
      where: { entityType, entityId },
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ logs, total: logs.length });
  } catch (error) {
    console.error('Get entity timeline error:', error);
    return res.status(500).json({ message: 'Server error while fetching timeline' });
  }
};
