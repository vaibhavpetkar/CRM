import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import { NotFoundError } from '../errors/AppError';
import Deal from '../models/Deal';
import Lead from '../models/Lead';
import Quote from '../models/Quote';
import Company from '../models/Company';
import { getTimeline } from '../services/activityLogger';
import { isAIConfigured, summarizeDeal, summarizeLead, generateQuoteFollowUp } from '../services/aiService';

const getCurrencySymbol = (currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
};

const timelineToLines = (timeline: any[]) =>
  timeline.slice(-10).map((t) => `- [${new Date(t.createdAt).toISOString().slice(0, 10)}] ${t.action}${t.details ? ': ' + t.details : ''}`);

// Never fakes a state — mirrors GET /api/integrations exactly for consistency.
export const getAIStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json({
    configured: isAIConfigured(),
    missingEnvVars: isAIConfigured() ? [] : ['ANTHROPIC_API_KEY'],
  });
});

export const getDealSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const deal = await Deal.findByPk(req.params.id);
  if (!deal) throw new NotFoundError('Deal', req.params.id);

  const [timeline, company] = await Promise.all([getTimeline('Deal', deal.id), Company.findOne({ order: [['id', 'ASC']] })]);
  const currencySymbol = getCurrencySymbol(company?.currency || 'INR');

  const result = await summarizeDeal(deal, timelineToLines(timeline), currencySymbol);
  return res.json(result);
});

export const getLeadSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new NotFoundError('Lead', req.params.id);

  const timeline = await getTimeline('Lead', lead.id);
  const result = await summarizeLead(lead, timelineToLines(timeline));
  return res.json(result);
});

export const getQuoteFollowUpMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) throw new NotFoundError('Quote', req.params.id);

  const company = await Company.findOne({ order: [['id', 'ASC']] });
  const currencySymbol = getCurrencySymbol(company?.currency || 'INR');

  const message = await generateQuoteFollowUp(quote, company?.name || 'our team', currencySymbol);
  return res.json({ message });
});
