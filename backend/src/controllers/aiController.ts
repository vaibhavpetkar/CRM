import { Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import { NotFoundError } from '../errors/AppError';
import Deal from '../models/Deal';
import Lead from '../models/Lead';
import Quote from '../models/Quote';
import Company from '../models/Company';
import Task from '../models/Task';
import { getTimeline } from '../services/activityLogger';
import { isAIConfigured, summarizeDeal, summarizeLead, generateQuoteFollowUp, chatReply, getActiveProvider } from '../services/aiService';

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
    provider: getActiveProvider(),
    missingEnvVars: isAIConfigured() ? [] : ['OLLAMA_BASE_URL (free, local) or ANTHROPIC_API_KEY (paid)'],
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

const OPEN_DEAL_STAGES = { [Op.notIn]: ['closed-won', 'closed-lost'] };

/**
 * Real, current, aggregate-only snapshot of the CRM — deliberately not
 * individual records (that would need a much larger retrieval system).
 * The chat system prompt tells the model exactly that boundary, so it
 * doesn't invent specific names/details beyond these counts.
 */
const buildCrmSnapshot = async (currencySymbol: string) => {
  const [totalLeads, openDeals, openDealsValue, overdueTasks, pendingQuotes] = await Promise.all([
    Lead.count(),
    Deal.count({ where: { stage: OPEN_DEAL_STAGES } }),
    Deal.sum('value', { where: { stage: OPEN_DEAL_STAGES } }),
    Task.count({ where: { status: { [Op.ne]: 'completed' }, dueDate: { [Op.lt]: new Date() } } }),
    Quote.count({ where: { status: { [Op.in]: ['draft', 'sent'] } } }),
  ]);

  return [
    `- Total leads: ${totalLeads}`,
    `- Open deals: ${openDeals} (total value: ${currencySymbol}${Math.round(openDealsValue || 0)})`,
    `- Overdue tasks: ${overdueTasks}`,
    `- Pending quotes (draft/sent): ${pendingQuotes}`,
  ].join('\n');
};

export const chatWithAssistant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { message, history } = req.body as { message?: string; history?: { role: 'user' | 'assistant'; text: string }[] };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'A message is required.' });
  }

  const company = await Company.findOne({ order: [['id', 'ASC']] });
  const currencySymbol = getCurrencySymbol(company?.currency || 'INR');
  const snapshot = await buildCrmSnapshot(currencySymbol);

  const reply = await chatReply(message.trim(), Array.isArray(history) ? history : [], snapshot);
  return res.json({ reply });
});
