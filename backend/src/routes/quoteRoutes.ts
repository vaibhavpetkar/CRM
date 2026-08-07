import { Router } from 'express';
import * as quoteController from '../controllers/quoteController';
import { protect, authorize } from '../middleware/authMiddleware';
import { validate } from '../validations/validate';
import { createQuoteValidation, updateQuoteValidation, sendEmailValidation } from '../validations/quoteValidation';

const router = Router();

// Generate directly from a Lead or a Deal (Opportunity) — auto-pulls
// customer, address, products and taxes.
router.post('/from-lead/:leadId', protect, authorize('quotes:view'), quoteController.createQuoteFromLead);
router.post('/from-deal/:dealId', protect, authorize('quotes:view'), quoteController.createQuoteFromDeal);

router.get('/', protect, authorize('quotes:view'), quoteController.getQuotes);
router.post('/', protect, authorize('quotes:view'), validate(createQuoteValidation), quoteController.createQuote);
router.get('/:id', protect, authorize('quotes:view'), quoteController.getQuoteById);
router.put('/:id', protect, authorize('quotes:view'), validate(updateQuoteValidation), quoteController.updateQuote);
router.delete('/:id', protect, authorize('Administrator', 'Sales Manager'), quoteController.deleteQuote);

// PDF / Print / Email
router.get('/:id/pdf', protect, authorize('quotes:view'), quoteController.downloadQuotePdf);
router.get('/:id/print', protect, authorize('quotes:view'), quoteController.printQuote);
router.post('/:id/send-email', protect, authorize('quotes:view'), validate(sendEmailValidation), quoteController.sendQuoteEmail);

// Revisions
router.post('/:id/revise', protect, authorize('quotes:view'), quoteController.reviseQuote);

// Accept / Reject — accepting converts to (or advances) a Deal
router.post('/:id/accept', protect, authorize('quotes:view'), quoteController.acceptQuote);
router.post('/:id/approve', protect, authorize('invoices:view'), quoteController.approveQuote);
router.post('/:id/reject', protect, authorize('quotes:view'), quoteController.rejectQuote);

// Activity timeline
router.get('/:id/timeline', protect, authorize('quotes:view'), quoteController.getQuoteTimeline);

export default router;
