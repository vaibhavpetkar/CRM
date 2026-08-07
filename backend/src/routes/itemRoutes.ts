import { Router } from 'express';
import * as itemController from '../controllers/itemController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// IMPORTANT: Stats route must come BEFORE /:id to avoid being matched as id='stats'
router.get('/stats', protect, authorize('items:read'), itemController.getItemStats);

router.get('/', protect, authorize('items:read'), itemController.getItems);
router.post('/', protect, authorize('items:create'), itemController.createItem);
router.get('/:id', protect, authorize('items:read'), itemController.getItemById);
router.put('/:id', protect, authorize('items:update'), itemController.updateItem);
router.delete('/:id', protect, authorize('items:delete'), itemController.deleteItem);

export default router;
