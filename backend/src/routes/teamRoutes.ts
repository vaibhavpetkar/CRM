import { Router } from 'express';
import * as teamController from '../controllers/teamController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// IMPORTANT: /stats must come before /:id
router.get('/stats', protect, authorize('users:read'), teamController.getTeamStats);

router.get('/', protect, authorize('users:read'), teamController.getTeamMembers);
router.get('/:id', protect, authorize('users:read'), teamController.getTeamMemberById);
router.put('/:id', protect, authorize('users:update'), teamController.updateTeamMember);
router.delete('/:id', protect, authorize('users:delete'), teamController.deleteTeamMember);

export default router;
