import { Router, Request, Response, NextFunction } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as documentTemplateController from '../controllers/documentTemplateController';

const router = Router();

const PRINT_PERMISSIONS: Record<string, string> = {
  quote: 'quotes:view',
  invoice: 'invoices:view',
  task: 'tasks:view',
  meeting: 'meetings:view',
};

const authorizePrint = (req: Request, res: Response, next: NextFunction) => {
  const permission = PRINT_PERMISSIONS[req.params.docType];
  if (!permission) return res.status(400).json({ message: `Unknown document type '${req.params.docType}'.` });
  return authorize(permission)(req, res, next);
};

router.get('/doc-types', protect, authorize('document_templates:read'), documentTemplateController.getDocTypes);
router.get('/merge-fields/:docType', protect, authorize('document_templates:read'), documentTemplateController.getMergeFields);
router.get('/starter/:docType', protect, authorize('document_templates:read'), documentTemplateController.getStarterTemplate);
router.post('/preview', protect, authorize('document_templates:read'), documentTemplateController.previewTemplate);
router.post('/preview-page', protect, authorize('document_templates:read'), documentTemplateController.previewPrintPage);
// Printing a record is gated by that record's own read permission, not by
// access to the template editor — anyone who can open an invoice can print it.
router.get('/print/:docType/:id', protect, authorizePrint, documentTemplateController.printDocument);

router.get('/', protect, authorize('document_templates:read'), documentTemplateController.getTemplates);
router.get('/:id', protect, authorize('document_templates:read'), documentTemplateController.getTemplate);
router.post('/', protect, authorize('document_templates:create'), documentTemplateController.createTemplate);
router.put('/:id', protect, authorize('document_templates:update'), documentTemplateController.updateTemplate);
router.delete('/:id', protect, authorize('document_templates:delete'), documentTemplateController.deleteTemplate);

export default router;
