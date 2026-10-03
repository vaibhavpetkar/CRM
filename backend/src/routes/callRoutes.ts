import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import * as callController from '../controllers/callController';

// Click-to-call. Permission checks live in callService: calling a lead needs
// leads:read, a contact needs contacts:read.
const router = Router();

router.get('/config', protect, callController.getCallConfig);
router.put('/my-number', protect, callController.setMyNumber);
router.get('/', protect, callController.listCalls);
router.post('/', protect, callController.startCall);
router.get('/:id', protect, callController.getCall);
router.patch('/:id', protect, callController.updateCallNotes);
router.get('/:id/recording', protect, callController.getCallRecording);

export default router;
