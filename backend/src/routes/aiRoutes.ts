import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as aiController from '../controllers/aiController';

const router = Router();

router.get('/status', protect, aiController.getAIStatus);
router.post('/deals/:id/summary', protect, authorize('ai:use'), aiController.getDealSummary);
router.post('/leads/:id/summary', protect, authorize('ai:use'), aiController.getLeadSummary);
router.post('/quotes/:id/followup-message', protect, authorize('ai:use'), aiController.getQuoteFollowUpMessage);

export default router;
