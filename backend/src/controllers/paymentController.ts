import { Request, Response } from 'express';
import Payment from '../models/Payment';
import Invoice from '../models/Invoice';
import User from '../models/User';
import ActivityLog from '../models/ActivityLog';
import { notifyUser } from '../utils/notificationService';

const serialize = (payment: any) => {
  const plain = payment.toJSON ? payment.toJSON() : payment;
  return {
    ...plain,
    recordedBy: plain.recordedBy ? `${plain.recordedBy.firstName} ${plain.recordedBy.lastName}` : null,
  };
};

/**
 * Recalculates an invoice's status from the sum of its recorded payments:
 *   0 paid            -> 'pending' (or 'overdue' if past due date)
 *   0 < paid < amount  -> 'partial'
 *   paid >= amount     -> 'paid'
 */
const recalculateInvoiceStatus = async (invoiceId: number) => {
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) return null;

  const payments = await Payment.findAll({ where: { invoiceId } });
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);
  const invoiceAmount = parseFloat(String(invoice.amount));

  let status = invoice.status;
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

export const getPaymentsForInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const payments = await Payment.findAll({
      where: { invoiceId },
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'recordedBy', required: false }],
      order: [['paidOn', 'DESC']],
    });

    const invoice = await Invoice.findByPk(invoiceId);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);

    return res.json({
      payments: payments.map(serialize),
      totalPaid,
      balanceDue: invoice ? parseFloat(String(invoice.amount)) - totalPaid : null,
    });
  } catch (error) {
    console.error('Get payments error:', error);
    return res.status(500).json({ message: 'Server error while fetching payments' });
  }
};

export const recordPayment = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { amount, method, reference, paidOn, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'A positive payment amount is required' });
    }

    const invoice = await Invoice.findByPk(invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const payment = await Payment.create({
      invoiceId: invoice.id,
      amount,
      method: method || 'bank_transfer',
      reference: reference || null,
      paidOn: paidOn || new Date(),
      notes: notes || null,
      recordedById: req.user?.id || null,
    });

    const result = await recalculateInvoiceStatus(invoice.id);

    await ActivityLog.create({
      action: 'payment_recorded',
      entityType: 'Invoice',
      entityId: invoice.id,
      performedById: req.user?.id || null,
      details: `Payment of ${amount} recorded for invoice ${invoice.invoiceNumber}. Status is now "${result?.invoice.status}".`,
    });

    if (result?.invoice.status === 'paid') {
      await notifyUser({
        userId: invoice.assignedToId,
        type: 'invoice_paid',
        title: 'Invoice paid in full',
        message: `Invoice ${invoice.invoiceNumber} has been paid in full.`,
        entityType: 'Invoice',
        entityId: invoice.id,
      });
    }

    await payment.reload({ include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'recordedBy', required: false }] });

    return res.status(201).json({
      message: 'Payment recorded successfully',
      payment: serialize(payment),
      invoice: result?.invoice.toJSON(),
    });
  } catch (error) {
    console.error('Record payment error:', error);
    return res.status(500).json({ message: 'Server error while recording payment' });
  }
};

export const deletePayment = async (req: Request & { user?: any }, res: Response) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const invoiceId = payment.invoiceId;
    await payment.destroy();
    const result = await recalculateInvoiceStatus(invoiceId);

    await ActivityLog.create({
      action: 'payment_deleted',
      entityType: 'Invoice',
      entityId: invoiceId,
      performedById: req.user?.id || null,
      details: `A payment was removed from invoice ${result?.invoice.invoiceNumber}. Status is now "${result?.invoice.status}".`,
    });

    return res.json({ message: 'Payment deleted successfully', invoice: result?.invoice.toJSON() });
  } catch (error) {
    console.error('Delete payment error:', error);
    return res.status(500).json({ message: 'Server error while deleting payment' });
  }
};
