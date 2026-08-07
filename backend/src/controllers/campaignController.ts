import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Campaign from '../models/Campaign';
import User from '../models/User';

const serialize = (campaign: any) => {
  const plain = campaign.toJSON ? campaign.toJSON() : campaign;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
};

export const getCampaigns = async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const whereClause: any = {};

    if (search) whereClause.name = { [Op.iLike]: `%${search}%` };
    if (status && status !== 'all') whereClause.status = status;

    const campaigns = await Campaign.findAll({
      where: whereClause,
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ campaigns: campaigns.map(serialize), total: campaigns.length });
  } catch (error) {
    console.error('Get campaigns error:', error);
    return res.status(500).json({ message: 'Server error while fetching campaigns' });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const { name, type, status, startDate, assignedToId } = req.body;
    if (!name) return res.status(400).json({ message: 'Campaign name is required' });

    const campaign = await Campaign.create({
      name,
      type: type || 'email',
      status: status || 'draft',
      sent: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      startDate: startDate || null,
      assignedToId: assignedToId || null,
    });

    return res.status(201).json({ message: 'Campaign created successfully', campaign: serialize(campaign) });
  } catch (error) {
    console.error('Create campaign error:', error);
    return res.status(500).json({ message: 'Server error while creating campaign' });
  }
};

export const updateCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    const { name, type, status, sent, opened, clicked, converted, startDate, assignedToId } = req.body;
    await campaign.update({
      name: name ?? campaign.name,
      type: type ?? campaign.type,
      status: status ?? campaign.status,
      sent: sent ?? campaign.sent,
      opened: opened ?? campaign.opened,
      clicked: clicked ?? campaign.clicked,
      converted: converted ?? campaign.converted,
      startDate: startDate ?? campaign.startDate,
      assignedToId: assignedToId ?? campaign.assignedToId,
    });

    await campaign.reload({ include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }] });
    return res.json({ message: 'Campaign updated successfully', campaign: serialize(campaign) });
  } catch (error) {
    console.error('Update campaign error:', error);
    return res.status(500).json({ message: 'Server error while updating campaign' });
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    await campaign.destroy();
    return res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getCampaignStats = async (_req: Request, res: Response) => {
  try {
    const campaigns = await Campaign.findAll();
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.sent += c.sent;
        acc.opened += c.opened;
        acc.clicked += c.clicked;
        acc.converted += c.converted;
        return acc;
      },
      { sent: 0, opened: 0, clicked: 0, converted: 0 }
    );

    return res.json({
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
      ...totals,
      openRate: totals.sent > 0 ? Number(((totals.opened / totals.sent) * 100).toFixed(1)) : 0,
      clickRate: totals.opened > 0 ? Number(((totals.clicked / totals.opened) * 100).toFixed(1)) : 0,
      conversionRate: totals.clicked > 0 ? Number(((totals.converted / totals.clicked) * 100).toFixed(1)) : 0,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
