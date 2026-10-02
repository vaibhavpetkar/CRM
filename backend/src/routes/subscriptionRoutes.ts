import { Router } from 'express';
import * as subscriptionController from '../controllers/subscriptionController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Reachable even when the company is locked (see authMiddleware), so users
// can see why and ask for a renewal.
router.get('/', protect, subscriptionController.getSubscription);
router.post('/request', protect, authorize('company:manage'), subscriptionController.requestPlan);

export default router;
