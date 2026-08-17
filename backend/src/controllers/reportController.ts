import { Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import Payment from '../models/Payment';
import Expense from '../models/Expense';

/**
 * Profit & Loss, computed on a cash basis:
 *   Revenue  = sum of Payment.amount actually collected in the date range
 *              (not invoiced amounts — money that hasn't come in yet isn't
 *              revenue for a cash-basis P&L)
 *   Expenses = sum of Expense.amount recorded in the date range
 *   Net      = Revenue - Expenses
 *
 * Defaults to the current calendar year if no range is given. Every number
 * here comes from real rows in Payments/Expenses — there's no accrual
 * accounting (no AR/AP aging, no depreciation, no COGS-vs-opex split), so
 * treat this as a straightforward cash P&L, not a full set of books.
 */
export const getProfitLoss = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const defaultStart = `${now.getFullYear()}-01-01`;
    const defaultEnd = `${now.getFullYear()}-12-31`;
    const startDate = (req.query.startDate as string) || defaultStart;
    const endDate = (req.query.endDate as string) || defaultEnd;

    const dateRangePayment = { paidOn: { [Op.gte]: startDate, [Op.lte]: endDate } };
    const dateRangeExpense = { expenseDate: { [Op.gte]: startDate, [Op.lte]: endDate } };

    const [totalRevenueRow, totalExpenseRow, revenueByMonth, expenseByMonth, expenseByCategory] = await Promise.all([
      Payment.findOne({ attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']], where: dateRangePayment, raw: true }),
      Expense.findOne({ attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']], where: dateRangeExpense, raw: true }),
      Payment.findAll({
        attributes: [
          [literal(`to_char("paidOn", 'YYYY-MM')`), 'month'],
          [fn('SUM', col('amount')), 'total'],
        ],
        where: dateRangePayment,
        group: [literal(`to_char("paidOn", 'YYYY-MM')`)] as any,
        order: [[literal(`to_char("paidOn", 'YYYY-MM')`), 'ASC']],
        raw: true,
      }),
      Expense.findAll({
        attributes: [
          [literal(`to_char("expenseDate", 'YYYY-MM')`), 'month'],
          [fn('SUM', col('amount')), 'total'],
        ],
        where: dateRangeExpense,
        group: [literal(`to_char("expenseDate", 'YYYY-MM')`)] as any,
        order: [[literal(`to_char("expenseDate", 'YYYY-MM')`), 'ASC']],
        raw: true,
      }),
      Expense.findAll({
        attributes: ['category', [fn('SUM', col('amount')), 'total']],
        where: dateRangeExpense,
        group: ['category'],
        order: [[literal('total'), 'DESC']],
        raw: true,
      }),
    ]);

    const totalRevenue = Number((totalRevenueRow as any)?.total || 0);
    const totalExpenses = Number((totalExpenseRow as any)?.total || 0);

    // Merge revenue/expense month series into one aligned list so the
    // frontend doesn't have to reconcile two differently-shaped arrays.
    const monthMap = new Map<string, { month: string; revenue: number; expenses: number }>();
    (revenueByMonth as any[]).forEach((r) => {
      monthMap.set(r.month, { month: r.month, revenue: Number(r.total), expenses: 0 });
    });
    (expenseByMonth as any[]).forEach((r) => {
      const existing = monthMap.get(r.month) || { month: r.month, revenue: 0, expenses: 0 };
      existing.expenses = Number(r.total);
      monthMap.set(r.month, existing);
    });
    const monthly = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ ...m, net: m.revenue - m.expenses }));

    return res.json({
      startDate,
      endDate,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      monthly,
      expensesByCategory: (expenseByCategory as any[]).map((c) => ({ category: c.category, total: Number(c.total) })),
      basis: 'cash', // computed from money actually received/spent, not invoiced/accrued amounts
    });
  } catch (error) {
    console.error('Get profit & loss error:', error);
    return res.status(500).json({ message: 'Server error while generating the profit & loss report' });
  }
};
