import { Router } from 'express';
import { getActivityLogs, getEntityTimeline } from '../controllers/activityLogController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Only admin can view the full, unscoped activity log
router.get('/', protect, authorize('Administrator'), getActivityLogs);

// Any authenticated user can view the timeline for a specific record they can access
router.get('/timeline/:entityType/:entityId', protect, getEntityTimeline);

export default router;
