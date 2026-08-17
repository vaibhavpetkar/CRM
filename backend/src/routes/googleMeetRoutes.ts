import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import * as googleMeetController from '../controllers/googleMeetController';

const router = Router();

router.get('/status', protect, googleMeetController.getGoogleMeetStatus);
router.post('/connect', protect, googleMeetController.connectGoogleMeet);
// Public — Google redirects the browser here directly, not an authenticated API call.
router.get('/callback', googleMeetController.googleMeetCallback);
router.post('/disconnect', protect, googleMeetController.disconnectGoogleMeet);

export default router;
