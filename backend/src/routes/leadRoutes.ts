import { Router } from 'express';
import * as leadController from '../controllers/leadController';
import { protect, authorize } from '../middleware/authMiddleware';
import { validate } from '../validations/validate';
import { createLeadValidation, updateLeadValidation, convertLeadValidation } from '../validations/leadValidation';
import { cacheRoute } from '../utils/cache';

const router = Router();

// IMPORTANT: Stats route must come BEFORE /:id to avoid being matched as id='stats'
router.get('/stats', protect, authorize('leads:read'), leadController.getLeadStats);

// Lead CRUD routes
// Short-lived cache keyed by the exact querystring (page/limit/filters/sort) —
// list results aren't scoped per-user here, so it's safe to share across
// requests. 15s keeps the "recent leads" dashboard widget and the leads
// table fast under load while staying close to real-time.
router.get('/', protect, authorize('leads:read'), cacheRoute((req) => `leads:list:${req.originalUrl}`, 15), leadController.getLeads);
router.post('/', protect, authorize('leads:create'), validate(createLeadValidation), leadController.createLead);
router.get('/:id', protect, authorize('leads:read'), leadController.getLeadById);
router.put('/:id', protect, authorize('leads:update'), validate(updateLeadValidation), leadController.updateLead);
router.delete('/:id', protect, authorize('leads:delete'), leadController.deleteLead);

// Conversion
router.post('/:id/convert', protect, authorize('leads:update'), validate(convertLeadValidation), leadController.convertLead);

// Activity timeline
router.get('/:id/timeline', protect, authorize('leads:read'), leadController.getLeadTimeline);
router.post('/:id/timeline/:logId/revert', protect, authorize('leads:update'), leadController.revertLeadChange);

export default router;
