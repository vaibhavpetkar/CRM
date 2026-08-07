import { Router } from 'express';
import * as campaignController from '../controllers/campaignController';
import { protect, authorize } from '../middleware/authMiddleware';
import { cacheRoute } from '../utils/cache';

const router = Router();

router.get('/', protect, authorize('marketing:view'), campaignController.getCampaigns);
router.get(
  '/stats',
  protect,
  authorize('marketing:view'),
  cacheRoute(() => 'campaigns:stats', 30),
  campaignController.getCampaignStats
);
router.post('/', protect, authorize('marketing:view'), campaignController.createCampaign);
router.put('/:id', protect, authorize('marketing:view'), campaignController.updateCampaign);
router.delete('/:id', protect, authorize('marketing:view'), campaignController.deleteCampaign);

export default router;
