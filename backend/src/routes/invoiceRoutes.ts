import { Router } from 'express';
import * as invoiceController from '../controllers/invoiceController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('invoices:view'), invoiceController.getInvoices);
router.post('/', protect, authorize('invoices:view'), invoiceController.createInvoice);
router.put('/:id', protect, authorize('invoices:view'), invoiceController.updateInvoice);
router.delete('/:id', protect, authorize('invoices:view'), invoiceController.deleteInvoice);

export default router;
