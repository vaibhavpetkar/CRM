import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getMyNotifications = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { unreadOnly } = req.query;
    const whereClause: any = { userId: req.user?.id };
    if (unreadOnly === 'true') whereClause.isRead = false;
    // Paged for the full Notifications page; the bell asks for the newest few.
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 100, 1), 100);
    const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);

    const { rows: notifications, count: total } = await Notification.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    const unreadCount = await Notification.count({ where: { userId: req.user?.id, isRead: false } });

    return res.json({ notifications, unreadCount, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ message: 'Server error while fetching notifications' });
  }
};

export const markNotificationRead = async (req: Request & { user?: any }, res: Response) => {
  try {
    const notification = await Notification.findOne({ where: { id: req.params.id, userId: req.user?.id } });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    await notification.update({ isRead: true, readAt: new Date() });
    return res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ message: 'Server error while updating notification' });
  }
};

export const markAllNotificationsRead = async (req: Request & { user?: any }, res: Response) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: req.user?.id, isRead: false } }
    );
    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ message: 'Server error while updating notifications' });
  }
};

export const deleteNotification = async (req: Request & { user?: any }, res: Response) => {
  try {
    const notification = await Notification.findOne({ where: { id: req.params.id, userId: req.user?.id } });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    await notification.destroy();
    return res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({ message: 'Server error while deleting notification' });
  }
};
