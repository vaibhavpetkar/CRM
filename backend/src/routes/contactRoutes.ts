import { Router } from 'express';
import * as contactController from '../controllers/contactController';
import { protect, authorize } from '../middleware/authMiddleware';
import { cacheRoute } from '../utils/cache';

const router = Router();

// IMPORTANT: Stats route must come BEFORE /:id to avoid being matched as id='stats'
router.get(
  '/stats',
  protect,
  authorize('contacts:read'),
  cacheRoute(() => 'contacts:stats', 30),
  contactController.getContactStats
);

// Item 8: relationship graph — same reason, must precede /:id.
router.get('/relationships', protect, authorize('contacts:read'), contactController.getContactRelationships);

// Contact CRUD routes
router.get('/', protect, authorize('contacts:read'), contactController.getContacts);
router.post('/', protect, authorize('contacts:create'), contactController.createContact);
router.get('/:id', protect, authorize('contacts:read'), contactController.getContactById);
router.put('/:id', protect, authorize('contacts:update'), contactController.updateContact);
router.delete('/:id', protect, authorize('contacts:delete'), contactController.deleteContact);

export default router;