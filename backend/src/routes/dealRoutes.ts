import { Router } from 'express';
import * as dealController from '../controllers/dealController';
import { protect, authorize } from '../middleware/authMiddleware';
import { cacheRoute } from '../utils/cache';

const router = Router();

// IMPORTANT: Stats route must come BEFORE /:id to avoid being matched as id='stats'
router.get(
  '/stats',
  protect,
  authorize('deals:read'),
  cacheRoute(() => 'deals:stats', 30),
  dealController.getDealStats
);

// Deal CRUD routes
router.get('/', protect, authorize('deals:read'), dealController.getDeals);
router.post('/', protect, authorize('deals:create'), dealController.createDeal);
router.get('/:id', protect, authorize('deals:read'), dealController.getDealById);
router.put('/:id', protect, authorize('deals:update'), dealController.updateDeal);
router.delete('/:id', protect, authorize('deals:delete'), dealController.deleteDeal);

export default router;
