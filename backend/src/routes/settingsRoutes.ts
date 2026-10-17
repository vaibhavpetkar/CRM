import { Router, Response, NextFunction } from 'express';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import * as settingsController from '../controllers/settingsController';

const router = Router();

// The server's .env holds platform-wide secrets shared by every company, so
// only the platform owner may read or change it, never a company's own admin.
const platformOwnerOnly = (req: AuthRequest, res: Response, next: NextFunction) =>
  req.user?.isSuperAdmin ? next() : res.status(403).json({ message: 'Only the platform super admin can manage server settings.' });

router.get('/env', protect, platformOwnerOnly, settingsController.getEnvVars);
router.put('/env', protect, platformOwnerOnly, settingsController.updateEnvVars);

export default router;
