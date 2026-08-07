import { Request, Response } from 'express';
import { Op } from 'sequelize';
import TaxMaster from '../models/TaxMaster';
import { generateCode } from '../utils/codeGenerator';

export const getTaxes = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
        { taxType: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const taxes = await TaxMaster.findAll({
      where: whereClause,
      order: [['name', 'ASC']],
    });

    return res.json({ taxes });
  } catch (error) {
    console.error('Get taxes error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTaxById = async (req: Request, res: Response) => {
  try {
    const tax = await TaxMaster.findByPk(req.params.id);
    if (!tax) {
      return res.status(404).json({ message: 'Tax not found' });
    }
    return res.json(tax);
  } catch (error) {
    console.error('Get tax by ID error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createTax = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { name, taxType, rate, description } = req.body;

    if (!name || rate === undefined || rate === null) {
      return res.status(400).json({ message: 'name and rate are required' });
    }

    if (isNaN(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) {
      return res.status(400).json({ message: 'rate must be a number between 0 and 100' });
    }

    const code = await generateCode('TAX', 'TAX');

    const tax = await TaxMaster.create({
      code,
      name,
      taxType: taxType || 'GST',
      rate: Number(rate),
      description: description || null,
      isActive: true,
      createdById: req.user?.id || null,
    });

    return res.status(201).json({ message: 'Tax created successfully', tax });
  } catch (error) {
    console.error('Create tax error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateTax = async (req: Request, res: Response) => {
  try {
    const tax = await TaxMaster.findByPk(req.params.id);
    if (!tax) {
      return res.status(404).json({ message: 'Tax not found' });
    }

    const { name, taxType, rate, description, isActive } = req.body;

    if (rate !== undefined && rate !== null) {
      if (isNaN(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) {
        return res.status(400).json({ message: 'rate must be a number between 0 and 100' });
      }
    }

    await tax.update({
      name: name ?? tax.name,
      taxType: taxType ?? tax.taxType,
      rate: rate !== undefined && rate !== null ? Number(rate) : tax.rate,
      description: description ?? tax.description,
      isActive: isActive ?? tax.isActive,
    });

    return res.json({ message: 'Tax updated successfully', tax });
  } catch (error) {
    console.error('Update tax error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTax = async (req: Request, res: Response) => {
  try {
    const tax = await TaxMaster.findByPk(req.params.id);
    if (!tax) {
      return res.status(404).json({ message: 'Tax not found' });
    }

    await tax.destroy();
    return res.json({ message: 'Tax deleted successfully' });
  } catch (error) {
    console.error('Delete tax error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
