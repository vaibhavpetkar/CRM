import { Request, Response } from 'express';
import ActivityLog from '../models/ActivityLog';
import User from '../models/User';

export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    const parsedPage = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const logs = await ActivityLog.findAndCountAll({
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });

    return res.json({
      logs: logs.rows,
      total: logs.count,
      page: parsedPage,
      pages: Math.ceil(logs.count / parsedLimit),
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const TIMELINE_ENTITY_TYPES = new Set(['lead', 'deal', 'contact', 'quote', 'invoice', 'task', 'user', 'company']);

/**
 * Returns the full activity timeline for a single record (e.g. a Lead, Deal,
 * Contact, Quote, Invoice, or Task), most recent first. Used to render an
 * "Activity" tab on a record's detail page.
 */
export const getEntityTimeline = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    if (!TIMELINE_ENTITY_TYPES.has(String(entityType).toLowerCase())) {
      return res.status(400).json({ message: 'Invalid entity type' });
    }

    const logs = await ActivityLog.findAll({
      where: { entityType: String(entityType).toLowerCase(), entityId },
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
