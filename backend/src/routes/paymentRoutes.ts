import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Nested under an invoice: list payments / record a new payment
router.get('/invoice/:invoiceId', protect, authorize('invoices:view'), paymentController.getPaymentsForInvoice);
router.post('/invoice/:invoiceId', protect, authorize('invoices:view'), paymentController.recordPayment);

// Flat: remove a payment by its own id
router.delete('/:id', protect, authorize('Administrator', 'Sales Manager'), paymentController.deletePayment);

export default router;
