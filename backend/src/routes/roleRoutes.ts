import { Router } from 'express';
import * as roleController from '../controllers/roleController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// IMPORTANT: /permissions must come before /:id
router.get('/permissions', protect, authorize('roles:read', 'roles:view'), roleController.getPermissionCatalog);

router.get('/', protect, authorize('roles:read', 'roles:view'), roleController.getRoles);
router.post('/', protect, authorize('roles:create', 'roles:manage'), roleController.createRole);
router.get('/:id', protect, authorize('roles:read', 'roles:view'), roleController.getRoleById);
router.put('/:id', protect, authorize('roles:update', 'roles:manage'), roleController.updateRole);
router.delete('/:id', protect, authorize('roles:delete', 'roles:manage'), roleController.deleteRole);

export default router;
