import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Expense from '../models/Expense';
import User from '../models/User';

const serialize = (expense: any) => {
  const plain = expense.toJSON ? expense.toJSON() : expense;
  return {
    ...plain,
    amount: Number(plain.amount),
    recordedBy: plain.recordedBy ? `${plain.recordedBy.firstName} ${plain.recordedBy.lastName}` : null,
  };
};

const toFiniteNonNegative = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const getExpenses = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { search, category, startDate, endDate, page = '1', limit = '25' } = req.query as Record<string, string>;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { vendor: { [Op.iLike]: `%${search}%` } },
        { category: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (category && category !== 'all') whereClause.category = category;
    if (startDate || endDate) {
      whereClause.expenseDate = {};
      if (startDate) whereClause.expenseDate[Op.gte] = startDate;
      if (endDate) whereClause.expenseDate[Op.lte] = endDate;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

    const { rows, count } = await Expense.findAndCountAll({
      where: whereClause,
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'recordedBy', required: false }],
      order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    return res.json({
      expenses: rows.map(serialize),
      total: count,
      page: pageNum,
      totalPages: Math.max(1, Math.ceil(count / limitNum)),
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    return res.status(500).json({ message: 'Server error while fetching expenses' });
  }
};

export const getExpenseCategories = async (_req: Request, res: Response) => {
  try {
    const rows = await Expense.findAll({
      attributes: ['category'],
      group: ['category'],
      order: [['category', 'ASC']],
    });
    return res.json({ categories: rows.map((r: any) => r.category) });
  } catch (error) {
    console.error('Get expense categories error:', error);
    return res.status(500).json({ message: 'Server error while fetching expense categories' });
  }
};

export const createExpense = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { category, description, amount, expenseDate, paymentMethod, vendor, notes } = req.body;

    if (!category || !String(category).trim()) return res.status(400).json({ message: 'Category is required' });
    if (!description || !String(description).trim()) return res.status(400).json({ message: 'Description is required' });

    const parsedAmount = toFiniteNonNegative(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a valid positive number' });
    }

    const expense = await Expense.create({
      category: String(category).trim(),
      description: String(description).trim(),
      amount: parsedAmount,
      expenseDate: expenseDate || new Date(),
      paymentMethod: paymentMethod || 'bank_transfer',
      vendor: vendor ? String(vendor).trim() : null,
      notes: notes ? String(notes).trim() : null,
      recordedById: req.user?.id || null,
    });

    const withUser = await Expense.findByPk(expense.id, {
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'recordedBy', required: false }],
    });

    return res.status(201).json({ expense: serialize(withUser) });
  } catch (error) {
    console.error('Create expense error:', error);
    return res.status(500).json({ message: 'Server error while creating expense' });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    const { category, description, amount, expenseDate, paymentMethod, vendor, notes } = req.body;

    if (amount !== undefined) {
      const parsedAmount = toFiniteNonNegative(amount);
      if (parsedAmount === null || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be a valid positive number' });
      }
      expense.amount = parsedAmount;
    }
    if (category !== undefined) expense.category = String(category).trim();
    if (description !== undefined) expense.description = String(description).trim();
    if (expenseDate !== undefined) expense.expenseDate = expenseDate;
    if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
    if (vendor !== undefined) expense.vendor = vendor ? String(vendor).trim() : null;
    if (notes !== undefined) expense.notes = notes ? String(notes).trim() : null;

    await expense.save();

    const withUser = await Expense.findByPk(expense.id, {
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'recordedBy', required: false }],
    });

    return res.json({ expense: serialize(withUser) });
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({ message: 'Server error while updating expense' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await expense.destroy();
    return res.json({ message: 'Expense deleted' });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({ message: 'Server error while deleting expense' });
  }
};
