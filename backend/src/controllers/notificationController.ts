import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getMyNotifications = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { unreadOnly } = req.query;
    const whereClause: any = { userId: req.user?.id };
    if (unreadOnly === 'true') whereClause.isRead = false;

    const notifications = await Notification.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    const unreadCount = await Notification.count({ where: { userId: req.user?.id, isRead: false } });

    return res.json({ notifications, unreadCount, total: notifications.length });
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
