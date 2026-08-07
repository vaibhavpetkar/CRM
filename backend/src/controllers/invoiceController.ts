import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Invoice from '../models/Invoice';
import User from '../models/User';
import { generateCode } from '../utils/codeGenerator';

const serialize = (invoice: any) => {
  const plain = invoice.toJSON ? invoice.toJSON() : invoice;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
};

/**
 * Generates the next invoice number as INV-2026-00001, via the same atomic,
 * row-locked sequence counter used by Lead and Quote numbering. Previously this
 * derived the number from `Invoice.count()`, which (a) wasn't safe under
 * concurrent invoice creation - two requests could read the same count and
 * collide on the unique invoiceNumber column, (b) produced duplicate/reused
 * numbers once any invoice was deleted, since count() drops, and (c) didn't
 * follow the same PREFIX-YEAR-NUMBER format as Lead/Quote, making it hard to
 * trace the Lead -> Quote -> Invoice reference chain by eye.
 */
export const generateInvoiceNumber = async () => {
  return generateCode('INVOICE', 'INV', 5, true);
};

/**
 * Auto-generates an Invoice from an approved Quote. Used by the quote approval
 * workflow so sales reps don't have to manually re-key the quote into an invoice.
 * Idempotent: if an invoice already exists for this quote, it's returned as-is.
 */
export const createInvoiceFromQuote = async (quote: {
  id: number;
  client: string;
  amount: number;
  assignedToId?: number | null;
}) => {
  const existing = await Invoice.findOne({ where: { quoteId: quote.id } });
  if (existing) return existing;

  const issuedDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // default net-30 terms

  return Invoice.create({
    invoiceNumber: await generateInvoiceNumber(),
    client: quote.client,
    amount: quote.amount,
    status: 'pending',
    issuedDate,
    dueDate,
    quoteId: quote.id,
    assignedToId: quote.assignedToId || null,
  });
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { client: { [Op.iLike]: `%${search}%` } },
        { invoiceNumber: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status && status !== 'all') whereClause.status = status;

    const invoices = await Invoice.findAll({
      where: whereClause,
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ invoices: invoices.map(serialize), total: invoices.length });
  } catch (error) {
    console.error('Get invoices error:', error);
    return res.status(500).json({ message: 'Server error while fetching invoices' });
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { client, amount, status, issuedDate, dueDate, quoteId, assignedToId } = req.body;
    if (!client) return res.status(400).json({ message: 'Client is required' });

    const invoice = await Invoice.create({
      invoiceNumber: await generateInvoiceNumber(),
      client,
      amount: amount || 0,
      status: status || 'pending',
      issuedDate: issuedDate || null,
      dueDate: dueDate || null,
      quoteId: quoteId || null,
      assignedToId: assignedToId || null,
    });

    return res.status(201).json({ message: 'Invoice created successfully', invoice: serialize(invoice) });
  } catch (error) {
    console.error('Create invoice error:', error);
    return res.status(500).json({ message: 'Server error while creating invoice' });
  }
};

export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const { client, amount, status, issuedDate, dueDate, quoteId, assignedToId } = req.body;
    await invoice.update({
      client: client ?? invoice.client,
      amount: amount ?? invoice.amount,
      status: status ?? invoice.status,
      issuedDate: issuedDate ?? invoice.issuedDate,
      dueDate: dueDate ?? invoice.dueDate,
      quoteId: quoteId ?? invoice.quoteId,
      assignedToId: assignedToId ?? invoice.assignedToId,
    });

    await invoice.reload({ include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }] });
    return res.json({ message: 'Invoice updated successfully', invoice: serialize(invoice) });
  } catch (error) {
    console.error('Update invoice error:', error);
    return res.status(500).json({ message: 'Server error while updating invoice' });
  }
};

export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    await invoice.destroy();
    return res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
