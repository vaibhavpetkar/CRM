import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { superAdminOnly } from '../middleware/superAdmin';
import * as settingsController from '../controllers/settingsController';

const router = Router();

// The server's .env holds platform-wide secrets shared by every company, so
// only the platform owner may read or change it, never a company's own admin.
router.get('/env', protect, superAdminOnly, settingsController.getEnvVars);
router.put('/env', protect, superAdminOnly, settingsController.updateEnvVars);

export default router;
