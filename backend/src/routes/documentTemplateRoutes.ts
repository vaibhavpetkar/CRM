import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as documentTemplateController from '../controllers/documentTemplateController';

const router = Router();

router.get('/doc-types', protect, authorize('document_templates:read'), documentTemplateController.getDocTypes);
router.get('/merge-fields/:docType', protect, authorize('document_templates:read'), documentTemplateController.getMergeFields);
router.post('/preview', protect, authorize('document_templates:read'), documentTemplateController.previewTemplate);

router.get('/', protect, authorize('document_templates:read'), documentTemplateController.getTemplates);
router.get('/:id', protect, authorize('document_templates:read'), documentTemplateController.getTemplate);
router.post('/', protect, authorize('document_templates:create'), documentTemplateController.createTemplate);
router.put('/:id', protect, authorize('document_templates:update'), documentTemplateController.updateTemplate);
router.delete('/:id', protect, authorize('document_templates:delete'), documentTemplateController.deleteTemplate);

export default router;
