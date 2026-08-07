import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Item from '../models/Item';
import ItemCategory from '../models/ItemCategory';
import TaxMaster from '../models/TaxMaster';
import { generateCode } from '../utils/codeGenerator';

const includeRefs = [
  { model: ItemCategory, as: 'category', attributes: ['id', 'code', 'name'], required: false },
  { model: TaxMaster, as: 'tax', attributes: ['id', 'code', 'name', 'rate', 'taxType'], required: false },
];

// Flatten category/tax onto the item so the frontend can render without extra lookups
const serializeItem = (item: any) => {
  const plain = item.toJSON ? item.toJSON() : item;
  return {
    ...plain,
    categoryName: plain.category?.name || null,
    taxName: plain.tax?.name || null,
    taxRate: plain.tax?.rate ?? null,
  };
};

export const getItems = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      isActive,
      sortBy = 'createdAt',
      order = 'DESC',
    } = req.query;

    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { itemName: { [Op.iLike]: `%${search}%` } },
        { itemCode: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
        { hsnCode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (categoryId) {
      whereClause.categoryId = parseInt(categoryId as string);
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const items = await Item.findAndCountAll({
      where: whereClause,
      include: includeRefs,
      limit: parseInt(limit as string),
      offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      order: [[sortBy as string, order as string]],
    });

    return res.json({
      items: items.rows.map(serializeItem),
      total: items.count,
      page: parseInt(page as string),
      pages: Math.ceil(items.count / parseInt(limit as string)),
    });
  } catch (error) {
    console.error('Get items error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getItemById = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByPk(req.params.id, { include: includeRefs });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    return res.json(serializeItem(item));
  } catch (error) {
    console.error('Get item by ID error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createItem = async (req: Request & { user?: any }, res: Response) => {
  try {
    const {
      itemName,
      categoryId,
      taxId,
      unit,
      hsnCode,
      sku,
      sellingPrice,
      purchasePrice,
      description,
    } = req.body;

    if (!itemName) {
      return res.status(400).json({ message: 'itemName is required' });
    }

    // categoryId / taxId, if given, must reference real records
    if (categoryId) {
      const category = await ItemCategory.findByPk(categoryId);
      if (!category) return res.status(400).json({ message: 'Invalid categoryId' });
    }
    if (taxId) {
      const tax = await TaxMaster.findByPk(taxId);
      if (!tax) return res.status(400).json({ message: 'Invalid taxId' });
    }

    const itemCode = await generateCode('ITEM', 'PRD');

    const item = await Item.create({
      itemCode,
      itemName,
      categoryId: categoryId || null,
      taxId: taxId || null,
      unit: unit || 'Nos',
      hsnCode: hsnCode || null,
      sku: sku || null,
      sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : 0,
      purchasePrice: purchasePrice !== undefined && purchasePrice !== null ? Number(purchasePrice) : null,
      description: description || null,
      isActive: true,
      createdById: req.user?.id || null,
    });

    await item.reload({ include: includeRefs });

    return res.status(201).json({ message: 'Item created successfully', item: serializeItem(item) });
  } catch (error) {
    console.error('Create item error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const {
      itemName,
      categoryId,
      taxId,
      unit,
      hsnCode,
      sku,
      sellingPrice,
      purchasePrice,
      description,
      isActive,
    } = req.body;

    if (categoryId) {
      const category = await ItemCategory.findByPk(categoryId);
      if (!category) return res.status(400).json({ message: 'Invalid categoryId' });
    }
    if (taxId) {
      const tax = await TaxMaster.findByPk(taxId);
      if (!tax) return res.status(400).json({ message: 'Invalid taxId' });
    }

    await item.update({
      itemName: itemName ?? item.itemName,
      categoryId: categoryId !== undefined ? categoryId || null : item.categoryId,
      taxId: taxId !== undefined ? taxId || null : item.taxId,
      unit: unit ?? item.unit,
      hsnCode: hsnCode ?? item.hsnCode,
      sku: sku ?? item.sku,
      sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : item.sellingPrice,
      purchasePrice: purchasePrice !== undefined ? (purchasePrice === null ? null : Number(purchasePrice)) : item.purchasePrice,
      description: description ?? item.description,
      isActive: isActive ?? item.isActive,
    });

    await item.reload({ include: includeRefs });

    return res.json({ message: 'Item updated successfully', item: serializeItem(item) });
  } catch (error) {
    console.error('Update item error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await item.destroy();
    return res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getItemStats = async (req: Request, res: Response) => {
  try {
    const totalItems = await Item.count();
    const activeItems = await Item.count({ where: { isActive: true } });
    const totalCategories = await ItemCategory.count();
    const totalTaxes = await TaxMaster.count();

    return res.json({ totalItems, activeItems, totalCategories, totalTaxes });
  } catch (error) {
    console.error('Get item stats error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
