import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as settingsController from '../controllers/settingsController';

const router = Router();

// Environment variables management (Super Admin only)
router.get('/env', protect, authorize('settings:manage'), settingsController.getEnvVars);
router.put('/env', protect, authorize('settings:manage'), settingsController.updateEnvVars);

export default router;