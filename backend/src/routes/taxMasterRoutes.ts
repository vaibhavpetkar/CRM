import { Router } from 'express';
import * as taxMasterController from '../controllers/taxMasterController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('taxes:read'), taxMasterController.getTaxes);
router.post('/', protect, authorize('taxes:create'), taxMasterController.createTax);
router.get('/:id', protect, authorize('taxes:read'), taxMasterController.getTaxById);
router.put('/:id', protect, authorize('taxes:update'), taxMasterController.updateTax);
router.delete('/:id', protect, authorize('taxes:delete'), taxMasterController.deleteTax);

export default router;
