import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import * as googleTasksController from '../controllers/googleTasksController';

const router = Router();

router.get('/status', protect, googleTasksController.getGoogleTasksStatus);
router.post('/connect', protect, googleTasksController.connectGoogleTasks);
// Public — Google redirects the browser here directly, not an authenticated API call.
router.get('/callback', googleTasksController.googleTasksCallback);
router.post('/disconnect', protect, googleTasksController.disconnectGoogleTasks);

export default router;
