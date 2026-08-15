import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as integrationController from '../controllers/integrationController';

const router = Router();

router.get('/', protect, authorize('integrations:manage'), integrationController.getIntegrations);
router.post('/:provider/connect', protect, authorize('integrations:manage'), integrationController.connectIntegration);
router.post('/:provider/disconnect', protect, authorize('integrations:manage'), integrationController.disconnectIntegration);

export default router;
