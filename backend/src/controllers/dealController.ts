import { Response } from 'express';
import Deal from '../models/Deal';
import User from '../models/User';
import Lead from '../models/Lead';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import quoteService from '../services/QuoteService';

// Phase 7 automation: Prospecting Deal -> auto-generated Quote. Wrapped so a
// failure here (e.g. quote numbering race) never blocks the Deal save that
// triggered it — it's a best-effort side effect, not part of the core save.
const runProspectingQuoteAutomation = async (deal: Deal, userId?: number | null) => {
  try {
    return await quoteService.autoCreateForProspectingDeal(deal, userId);
  } catch (error) {
    console.error('Prospecting deal -> auto quote automation failed for deal', deal.id, error);
    return null;
  }
};

// Serialize deal to match frontend data shape
const serializeDeal = (deal: any) => {
  const plain = deal.toJSON ? deal.toJSON() : deal;
  return {
    ...plain,
    // Frontend uses "expectedClose" (not expectedCloseDate)
    expectedClose: plain.expectedCloseDate,
    // Frontend expects "assignedTo" as a string name
    assignedTo: plain.assignedTo
      ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}`
      : null,
    // Exposes the linked lead's number/company so the UI can render "View Lead LD-000001".
    leadNumber: plain.lead?.leadNumber || null,
    leadCompany: plain.lead?.company || null,
  };
};

const ALLOWED_SORT = new Set(['createdAt', 'updatedAt', 'title', 'client', 'value', 'stage', 'expectedCloseDate']);

export const getDeals = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      stage,
      sortBy = 'createdAt',
      order = 'DESC',
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page as string, 10) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 10));
    const safeSortBy = ALLOWED_SORT.has(sortBy as string) ? (sortBy as string) : 'createdAt';
    const safeOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { client: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (stage) {
      whereClause.stage = stage;
    }

    const deals = await Deal.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'assignedTo',
          required: false,
        },
        {
          model: Lead,
          attributes: ['id', 'leadNumber', 'company'],
          as: 'lead',
          required: false,
        },
      ],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      order: [[safeSortBy, safeOrder]],
    });

    return res.json({
      deals: deals.rows.map(serializeDeal),
      total: deals.count,
      page: parsedPage,
      pages: Math.ceil(deals.count / parsedLimit),
    });
  } catch (error) {
    console.error('Get deals error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getDealById = async (req: AuthRequest, res: Response) => {
  try {
    const deal = await Deal.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'assignedTo',
          required: false,
        },
        {
          model: Lead,
          attributes: ['id', 'leadNumber', 'company'],
          as: 'lead',
          required: false,
        },
      ],
    });

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    return res.json(serializeDeal(deal));
  } catch (error) {
    console.error('Get deal by ID error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createDeal = async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      client,
      value,
      currency,           // ← was missing from destructuring (caused undefined bug)
      stage,
      probability,
      expectedCloseDate,
      expectedClose,      // frontend sends "expectedClose"
      description,
      nextStep,
      source,
      assignedToId,
      accountId,          // ← was missing from destructuring (caused undefined bug)
      contactId,
      leadId,
    } = req.body;

    if (!title || !client) {
      return res.status(400).json({ message: 'title and client are required' });
    }

    const parsedValue = value !== undefined && value !== '' ? Number(value) : 0;
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return res.status(400).json({ message: 'Value must be a valid non-negative number' });
    }
    const parsedProbability = probability !== undefined && probability !== '' ? Number(probability) : 0;
    if (!Number.isFinite(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
      return res.status(400).json({ message: 'Probability must be between 0 and 100' });
    }

    const deal = await Deal.create({
      title,
      client,
      value: parsedValue,
      currency: currency || 'INR',
      stage: stage || 'prospecting',
      probability: parsedProbability,
      expectedCloseDate: expectedCloseDate || expectedClose || null,
      description: description || null,
      nextStep: nextStep || null,
      source: source || null,
      assignedToId: assignedToId || null,
      accountId: accountId || null,
      contactId: contactId || null,
      leadId: leadId || null,
      isActive: true,
    });

    await deal.reload({
      include: [
        { model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'assignedTo', required: false },
        { model: Lead, attributes: ['id', 'leadNumber', 'company'], as: 'lead', required: false },
      ],
    });

    // Prospecting Deal -> automatic Quote (see runProspectingQuoteAutomation).
    const autoGeneratedQuote = await runProspectingQuoteAutomation(deal, req.user?.id);

    return res.status(201).json({
      message: 'Deal created successfully',
      deal: serializeDeal(deal),
      ...(autoGeneratedQuote ? { autoGeneratedQuote } : {}),
    });
  } catch (error) {
    console.error('Create deal error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateDeal = async (req: AuthRequest, res: Response) => {
  try {
    const deal = await Deal.findByPk(req.params.id);

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    const {
      title,
      client,
      value,
      currency,           // ← was missing (caused undefined bug)
      stage,
      probability,
      expectedCloseDate,
      expectedClose,
      description,
      nextStep,
      source,
      assignedToId,
      accountId,          // ← was missing (caused undefined bug)
      contactId,
      leadId,
      isActive,
    } = req.body;

    const parsedValue = value !== undefined && value !== '' ? Number(value) : null;
    if (value !== undefined && (!Number.isFinite(parsedValue) || (parsedValue as number) < 0)) {
      return res.status(400).json({ message: 'Value must be a valid non-negative number' });
    }
    const parsedProbability = probability !== undefined && probability !== '' ? Number(probability) : null;
    if (probability !== undefined && (!Number.isFinite(parsedProbability) || (parsedProbability as number) < 0 || (parsedProbability as number) > 100)) {
      return res.status(400).json({ message: 'Probability must be between 0 and 100' });
    }

    // Use !== undefined so nullable fields can be cleared, and normalize '' -> null.
    const norm = (v: any) => (v === '' ? null : v);
    await deal.update({
      title: title !== undefined ? title : deal.title,
      client: client !== undefined ? client : deal.client,
      value: parsedValue !== null ? parsedValue : deal.value,
      currency: currency !== undefined ? currency : deal.currency,
      stage: stage !== undefined ? stage : deal.stage,
      probability: parsedProbability !== null ? parsedProbability : deal.probability,
      expectedCloseDate: expectedCloseDate !== undefined ? norm(expectedCloseDate) : (expectedClose !== undefined ? norm(expectedClose) : deal.expectedCloseDate),
      description: description !== undefined ? norm(description) : deal.description,
      nextStep: nextStep !== undefined ? norm(nextStep) : deal.nextStep,
      source: source !== undefined ? norm(source) : deal.source,
      assignedToId: assignedToId !== undefined ? norm(assignedToId) : deal.assignedToId,
      accountId: accountId !== undefined ? norm(accountId) : deal.accountId,
      contactId: contactId !== undefined ? norm(contactId) : deal.contactId,
      leadId: leadId !== undefined ? norm(leadId) : deal.leadId,
      isActive: isActive !== undefined ? isActive : deal.isActive,
    });

    await deal.reload({
      include: [
        { model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'assignedTo', required: false },
        { model: Lead, attributes: ['id', 'leadNumber', 'company'], as: 'lead', required: false },
      ],
    });

    // Prospecting Deal -> automatic Quote (see runProspectingQuoteAutomation).
    const autoGeneratedQuote = await runProspectingQuoteAutomation(deal, req.user?.id);

    return res.json({
      message: 'Deal updated successfully',
      deal: serializeDeal(deal),
      ...(autoGeneratedQuote ? { autoGeneratedQuote } : {}),
    });
  } catch (error) {
    console.error('Update deal error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteDeal = async (req: AuthRequest, res: Response) => {
  try {
    const deal = await Deal.findByPk(req.params.id);

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    await deal.destroy();

    return res.json({ message: 'Deal deleted successfully' });
  } catch (error) {
    console.error('Delete deal error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getDealStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalDeals = await Deal.count();

    const dealsByStage = await Deal.findAll({
      attributes: ['stage', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['stage'],
    });

    const totalValueResult = await Deal.findOne({
      attributes: [[sequelize.fn('SUM', sequelize.col('value')), 'totalValue']],
    });

    const avgValueResult = await Deal.findOne({
      attributes: [[sequelize.fn('AVG', sequelize.col('value')), 'averageValue']],
    });

    const wonDeals = await Deal.count({ where: { stage: 'closed-won' } });
    const lostDeals = await Deal.count({ where: { stage: 'closed-lost' } });
    const closedDeals = wonDeals + lostDeals;
    const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;

    return res.json({
      totalDeals,
      dealsByStage,
      totalValue: parseFloat(String(totalValueResult?.get('totalValue') ?? '0')),
      averageValue: parseFloat(String(avgValueResult?.get('averageValue') ?? '0')),
      winRate: parseFloat(winRate.toFixed(2)),
      wonDeals,
      lostDeals,
    });
  } catch (error) {
    console.error('Get deal stats error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};