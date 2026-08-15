import { Response } from 'express';
import path from 'path';
import { Op } from 'sequelize';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import quoteService from '../services/QuoteService';
import Quote from '../models/Quote';
import Notification from '../models/Notification';
import { notifyUser } from '../utils/notificationService';

/**
 * Phase 21 automation: Quote reminders. Scans for Quotes still in 'draft' or
 * 'sent' status whose validUntil date has passed, and notifies the assigned
 * user once per quote — mirrors taskController.checkOverdueTasks exactly:
 * lazily run from a commonly-hit endpoint (here, the Quotes list) rather
 * than a background cron job, since this environment doesn't run a
 * persistent process for scheduled jobs. Deduped via the same
 * already-notified check, so it's safe to call on every request.
 */
export const checkExpiringQuotes = async (): Promise<number> => {
  const expiredQuotes = await Quote.findAll({
    where: {
      status: { [Op.in]: ['draft', 'sent'] },
      validUntil: { [Op.lt]: new Date() },
    },
  });

  let notifiedCount = 0;
  for (const quote of expiredQuotes) {
    if (!quote.assignedToId) continue;

    const alreadyNotified = await Notification.findOne({
      where: { type: 'quote_expired', entityType: 'Quote', entityId: quote.id },
    });
    if (alreadyNotified) continue;

    await notifyUser({
      userId: quote.assignedToId,
      type: 'quote_expired',
      title: 'Quote expired',
      message: `Quotation ${quote.quoteNumber} for ${quote.client} passed its valid-until date and is still ${quote.status}. Follow up or revise it.`,
      entityType: 'Quote',
      entityId: quote.id,
    });
    notifiedCount++;
  }
  return notifiedCount;
};

export const getQuotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Lazily surface expiry notifications whenever the Quotes list is viewed.
  await checkExpiringQuotes();

  const result = await quoteService.list(req.query as any);
  return res.json(result);
});

export const getQuoteById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.getById(req.params.id);
  return res.json(quote);
});

export const createQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.create(req.body, req.user?.id);
  return res.status(201).json({ message: 'Quotation created successfully', quote });
});

export const createQuoteFromLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.createFromLead(req.params.leadId, req.user?.id, req.body || {});
  return res.status(201).json({ message: 'Quotation generated from lead', quote });
});

export const createQuoteFromDeal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.createFromDeal(req.params.dealId, req.user?.id, req.body || {});
  return res.status(201).json({ message: 'Quotation generated from deal', quote });
});

export const updateQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.update(req.params.id, req.body, req.user?.id);
  return res.json({ message: 'Quotation updated successfully', quote });
});

export const deleteQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  await quoteService.delete(req.params.id, req.user?.id);
  return res.json({ message: 'Quotation deleted successfully' });
});

export const downloadQuotePdf = asyncHandler(async (req: AuthRequest, res: Response) => {
  const pdfPath = await quoteService.generatePdf(req.params.id);
  return res.download(path.join(__dirname, '../../', pdfPath));
});

export const printQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const html = await quoteService.getPrintHtml(req.params.id);
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

// Customer-facing, unauthenticated — looked up by opaque publicToken only.
export const getPublicQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const html = await quoteService.getPublicPrintHtml(req.params.token);
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

// Internal/authenticated — builds the strategic share message + dynamic
// public link for the "Send Quote" (WhatsApp/email) UI.
export const getQuoteShareContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await quoteService.getShareContent(req.params.id);
  return res.json(content);
});

export const sendQuoteEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await quoteService.sendEmail(req.params.id, req.body?.email, req.user?.id);
  return res.json({ message: result.sent ? 'Quotation emailed successfully' : 'Email not sent (SMTP not configured) — see server logs', ...result });
});

export const reviseQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.createRevision(req.params.id, req.user?.id);
  return res.status(201).json({ message: 'Revision created successfully', quote });
});

export const acceptQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await quoteService.accept(req.params.id, req.user?.id);
  return res.json({ message: 'Quotation accepted and converted to deal', ...result });
});

export const approveQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await quoteService.approve(req.params.id, req.user?.id);
  return res.json({ message: 'Quotation approved and invoice generated', ...result });
});

export const getQuoteTimeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timeline = await quoteService.getTimeline(req.params.id);
  return res.json({ timeline });
});

export const rejectQuote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await quoteService.reject(req.params.id, req.user?.id);
  return res.json({ message: 'Quotation rejected', quote });
});
