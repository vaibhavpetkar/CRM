import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, notificationController.getMyNotifications);
router.patch('/:id/read', protect, notificationController.markNotificationRead);
router.patch('/read-all', protect, notificationController.markAllNotificationsRead);
router.delete('/:id', protect, notificationController.deleteNotification);

export default router;
