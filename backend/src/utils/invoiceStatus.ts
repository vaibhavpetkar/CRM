import { Op } from 'sequelize';
import Invoice from '../models/Invoice';
import Payment from '../models/Payment';

/**
 * Statuses whose value is derived from payment sums + due date. Draft and
 * cancelled are workflow states and must never be silently rewritten.
 */
export const ACTIVE_INVOICE_STATUSES = ['pending', 'partial', 'paid', 'overdue'];

/**
 * Recomputes an invoice's status from the sum of its recorded payments:
 *   0 paid              -> 'pending' (or 'overdue' if past due date)
 *   0 < paid < amount   -> 'partial'
 *   paid >= amount      -> 'paid'
 *
 * Draft/cancelled invoices are left untouched. Returns null when the invoice
 * doesn't exist.
 */
export const recalculateInvoiceStatus = async (invoiceId: number) => {
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) return null;

  if (!ACTIVE_INVOICE_STATUSES.includes(invoice.status)) {
    return { invoice, totalPaid: null };
  }

  const payments = await Payment.findAll({ where: { invoiceId } });
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);
  const invoiceAmount = parseFloat(String(invoice.amount));

  let status: string;
  if (totalPaid <= 0) {
    status = invoice.dueDate && new Date(invoice.dueDate) < new Date() ? 'overdue' : 'pending';
  } else if (totalPaid < invoiceAmount) {
    status = 'partial';
  } else {
    status = 'paid';
  }

  await invoice.update({ status });
  return { invoice, totalPaid };
};

/**
 * Lazily flags pending invoices whose due date has passed as overdue. Called on
 * invoice list fetches so idle invoices (never touched by a payment) don't stay
 * 'pending' forever.
 */
export const markOverdueInvoices = async () => {
  const [updatedCount] = await Invoice.update(
    { status: 'overdue' },
    { where: { status: 'pending', dueDate: { [Op.lt]: new Date() } } }
  );
  return updatedCount;
};

/**
 * Validates that a value is a finite, non-negative number. Returns the number
 * or null when invalid.
 */
export const toFiniteNonNegative = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};
