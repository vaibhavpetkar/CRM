import { Router } from 'express';
import * as itemCategoryController from '../controllers/itemCategoryController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('item_categories:read'), itemCategoryController.getItemCategories);
router.post('/', protect, authorize('item_categories:create'), itemCategoryController.createItemCategory);
router.get('/:id', protect, authorize('item_categories:read'), itemCategoryController.getItemCategoryById);
router.put('/:id', protect, authorize('item_categories:update'), itemCategoryController.updateItemCategory);
router.delete('/:id', protect, authorize('item_categories:delete'), itemCategoryController.deleteItemCategory);

export default router;
