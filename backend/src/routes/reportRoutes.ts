import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as reportController from '../controllers/reportController';

const router = Router();

router.get('/profit-loss', protect, authorize('reports:view'), reportController.getProfitLoss);
router.get('/forecast', protect, authorize('reports:view'), reportController.getSalesForecast);

export default router;
