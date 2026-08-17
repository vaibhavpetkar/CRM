import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import * as googleBusinessController from '../controllers/googleBusinessController';

const router = Router();

router.get('/status', protect, googleBusinessController.getGoogleBusinessStatus);
router.post('/connect', protect, googleBusinessController.connectGoogleBusiness);
// Public — Google redirects the browser here directly, not an authenticated API call.
router.get('/callback', googleBusinessController.googleBusinessCallback);
router.post('/disconnect', protect, googleBusinessController.disconnectGoogleBusiness);
router.get('/accounts', protect, googleBusinessController.getGoogleBusinessAccounts);

export default router;
