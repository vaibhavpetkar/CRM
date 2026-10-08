import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as salesController from '../controllers/salesController';

// Real-estate sales team: calls and site visits per sales person, lead
// sources, call tracking and rotational calling. Managers (users:read) see
// the whole team; everyone else sees their own numbers (see salesService).
const router = Router();

router.get('/activity', protect, salesController.getActivity);
router.get('/lead-sources', protect, authorize('leads:read'), salesController.getLeadSources);
router.get('/calls', protect, salesController.getCallLog);

router.get('/visits', protect, salesController.listVisits);
router.post('/visits', protect, salesController.createVisit);
router.patch('/visits/:id', protect, salesController.updateVisit);
router.delete('/visits/:id', protect, salesController.deleteVisit);

const manage = [protect, authorize('integrations:manage')];
router.get('/rotation', ...manage, salesController.getRotation);
router.put('/rotation', ...manage, salesController.saveRotation);
router.post('/rotation/distribute', ...manage, salesController.distributeUnassigned);

export default router;
