import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as callController from '../controllers/callController';

// Click-to-call. Permission checks live in callService: calling a lead needs
// leads:read, a contact needs contacts:read.
const router = Router();
const manage = [protect, authorize('integrations:manage')];

// The company's calling numbers (caller IDs), managed by admins. Before /:id.
router.get('/numbers', ...manage, callController.listCallerNumbers);
router.post('/numbers', ...manage, callController.addCallerNumber);
router.patch('/numbers/:id', ...manage, callController.updateCallerNumber);
router.delete('/numbers/:id', ...manage, callController.removeCallerNumber);

router.get('/config', protect, callController.getCallConfig);
router.put('/my-number', protect, callController.setMyNumber);
router.get('/', protect, callController.listCalls);
router.post('/', protect, callController.startCall);
router.get('/:id', protect, callController.getCall);
router.patch('/:id', protect, callController.updateCallNotes);
router.get('/:id/recording', protect, callController.getCallRecording);

export default router;
