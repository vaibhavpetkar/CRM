import { Request, Response } from 'express';
import { Op } from 'sequelize';
import ItemCategory from '../models/ItemCategory';
import { generateCode } from '../utils/codeGenerator';

export const getItemCategories = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { search, isActive } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const categories = await ItemCategory.findAll({
      where: whereClause,
      order: [['name', 'ASC']],
    });

    return res.json({ categories });
  } catch (error) {
    console.error('Get item categories error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getItemCategoryById = async (req: Request, res: Response) => {
  try {
    const category = await ItemCategory.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    return res.json(category);
  } catch (error) {
    console.error('Get item category by ID error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createItemCategory = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { name, description, parentCategoryId } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const existing = await ItemCategory.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: 'A category with this name already exists' });
    }

    const code = await generateCode('ITEM_CATEGORY', 'CAT');

    const category = await ItemCategory.create({
      code,
      name,
      description: description || null,
      parentCategoryId: parentCategoryId || null,
      isActive: true,
      createdById: req.user?.id || null,
    });

    return res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    console.error('Create item category error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateItemCategory = async (req: Request, res: Response) => {
  try {
    const category = await ItemCategory.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const { name, description, parentCategoryId, isActive } = req.body;

    if (name && name !== category.name) {
      const existing = await ItemCategory.findOne({ where: { name } });
      if (existing) {
        return res.status(400).json({ message: 'A category with this name already exists' });
      }
    }

    await category.update({
      name: name ?? category.name,
      description: description ?? category.description,
      parentCategoryId: parentCategoryId ?? category.parentCategoryId,
      isActive: isActive ?? category.isActive,
    });

    return res.json({ message: 'Category updated successfully', category });
  } catch (error) {
    console.error('Update item category error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteItemCategory = async (req: Request, res: Response) => {
  try {
    const category = await ItemCategory.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await category.destroy();
    return res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete item category error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
