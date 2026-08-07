import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Template from '../models/Template';

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { search, type } = req.query;
    const whereClause: any = {};

    if (search) whereClause.name = { [Op.iLike]: `%${search}%` };
    if (type && type !== 'all') whereClause.type = type;

    const templates = await Template.findAll({ where: whereClause, order: [['createdAt', 'DESC']] });
    return res.json({ templates, total: templates.length });
  } catch (error) {
    console.error('Get templates error:', error);
    return res.status(500).json({ message: 'Server error while fetching templates' });
  }
};

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { name, type, category, subject, content } = req.body;
    if (!name) return res.status(400).json({ message: 'Template name is required' });

    const template = await Template.create({
      name,
      type: type || 'email',
      category: category || null,
      subject: subject || null,
      content: content || null,
      usageCount: 0,
    });

    return res.status(201).json({ message: 'Template created successfully', template });
  } catch (error) {
    console.error('Create template error:', error);
    return res.status(500).json({ message: 'Server error while creating template' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const { name, type, category, subject, content } = req.body;
    await template.update({
      name: name ?? template.name,
      type: type ?? template.type,
      category: category ?? template.category,
      subject: subject ?? template.subject,
      content: content ?? template.content,
    });

    return res.json({ message: 'Template updated successfully', template });
  } catch (error) {
    console.error('Update template error:', error);
    return res.status(500).json({ message: 'Server error while updating template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    await template.destroy();
    return res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const useTemplate = async (req: Request, res: Response) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    await template.update({ usageCount: template.usageCount + 1, lastUsed: new Date() });
    return res.json({ message: 'Template usage recorded', template });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
