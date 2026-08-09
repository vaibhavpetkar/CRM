import { Request, Response } from 'express';
import Deal from '../models/Deal';
import User from '../models/User';
import Lead from '../models/Lead';
import { Op } from 'sequelize';
import sequelize from '../config/database';

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

export const getDeals = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      stage,
      sortBy = 'createdAt',
      order = 'DESC',
    } = req.query;

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
      limit: parseInt(limit as string),
      offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      order: [[sortBy as string, order as string]],
    });

    return res.json({
      deals: deals.rows.map(serializeDeal),
      total: deals.count,
      page: parseInt(page as string),
      pages: Math.ceil(deals.count / parseInt(limit as string)),
    });
  } catch (error) {
    console.error('Get deals error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getDealById = async (req: Request, res: Response) => {
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

export const createDeal = async (req: Request, res: Response) => {
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

    const deal = await Deal.create({
      title,
      client,
      value: value || 0,
      currency: currency || 'INR',
      stage: stage || 'prospecting',
      probability: probability || 0,
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

    return res.status(201).json({
      message: 'Deal created successfully',
      deal: serializeDeal(deal),
    });
  } catch (error) {
    console.error('Create deal error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateDeal = async (req: Request, res: Response) => {
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

    await deal.update({
      title: title ?? deal.title,
      client: client ?? deal.client,
      value: value ?? deal.value,
      currency: currency ?? deal.currency,
      stage: stage ?? deal.stage,
      probability: probability ?? deal.probability,
      expectedCloseDate: expectedCloseDate ?? expectedClose ?? deal.expectedCloseDate,
      description: description ?? deal.description,
      nextStep: nextStep ?? deal.nextStep,
      source: source ?? deal.source,
      assignedToId: assignedToId ?? deal.assignedToId,
      accountId: accountId ?? deal.accountId,
      contactId: contactId ?? deal.contactId,
      leadId: leadId ?? deal.leadId,
      isActive: isActive ?? deal.isActive,
    });

    await deal.reload({
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'assignedTo', required: false }],
    });

    return res.json({
      message: 'Deal updated successfully',
      deal: serializeDeal(deal),
    });
  } catch (error) {
    console.error('Update deal error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteDeal = async (req: Request, res: Response) => {
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

export const getDealStats = async (req: Request, res: Response) => {
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