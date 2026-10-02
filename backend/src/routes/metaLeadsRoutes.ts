import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as metaLeadsController from '../controllers/metaLeadsController';

const router = Router();
const manage = [protect, authorize('integrations:manage')];

router.get('/status', ...manage, metaLeadsController.getMetaStatus);
router.post('/connect', ...manage, metaLeadsController.connectMeta);
// Public: Facebook redirects the browser here directly, not an authenticated API call.
router.get('/callback', metaLeadsController.metaCallback);
router.post('/disconnect', ...manage, metaLeadsController.disconnectMeta);
router.post('/pages/:id/subscribe', ...manage, metaLeadsController.subscribeMetaPage);
router.post('/pages/:id/unsubscribe', ...manage, metaLeadsController.unsubscribeMetaPage);
router.post('/pages/:id/sync', ...manage, metaLeadsController.syncMetaPage);

export default router;
