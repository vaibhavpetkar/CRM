import { Router } from 'express';
import * as templateController from '../controllers/templateController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('marketing:view'), templateController.getTemplates);
router.post('/', protect, authorize('marketing:view'), templateController.createTemplate);
router.put('/:id', protect, authorize('marketing:view'), templateController.updateTemplate);
router.delete('/:id', protect, authorize('marketing:view'), templateController.deleteTemplate);
router.post('/:id/use', protect, authorize('marketing:view'), templateController.useTemplate);

export default router;
