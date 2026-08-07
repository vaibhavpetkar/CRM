import { Router } from 'express';
import * as userController from '../controllers/userController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('users:view'), userController.getUsers);
router.get('/assignable', protect, userController.getAssignableUsers);
router.get('/:id', protect, authorize('users:view'), userController.getUserById);
router.put('/:id', protect, authorize('users:manage'), userController.updateUser);
router.delete('/:id', protect, authorize('users:manage'), userController.deactivateUser);

export default router;
