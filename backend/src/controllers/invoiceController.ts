import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Invoice from '../models/Invoice';
import Payment from '../models/Payment';
import User from '../models/User';
import Quote from '../models/Quote';
import InvoiceProduct from '../models/InvoiceProduct';
import InvoiceTax from '../models/InvoiceTax';
import sequelize from '../config/database';
import { generateCode } from '../utils/codeGenerator';
import { markOverdueInvoices, recalculateInvoiceStatus, toFiniteNonNegative } from '../utils/invoiceStatus';
import { recalculateInvoiceTotals, replaceInvoiceProducts, replaceInvoiceTaxes } from '../utils/invoiceLines';

const DETAIL_INCLUDE = [
  { model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false },
  { model: InvoiceProduct, as: 'products', required: false },
  { model: InvoiceTax, as: 'taxes', required: false },
  { model: Quote, attributes: ['id', 'quoteNumber'], as: 'quoteRef', required: false },
  { model: Payment, attributes: ['id', 'amount'], as: 'payments', required: false },
];

const serializeDetail = (invoice: any) => {
  const plain = serialize(invoice);
  const totalPaid = (plain.payments || []).reduce((sum: number, p: any) => sum + parseFloat(String(p.amount)), 0);
  delete plain.payments;
  return {
    ...plain,
    products: [...(plain.products || [])].sort((a: any, b: any) => a.id - b.id),
    taxes: [...(plain.taxes || [])].sort((a: any, b: any) => a.id - b.id),
    totalPaid,
    balanceDue: parseFloat(String(plain.amount)) - totalPaid,
  };
};

// Quotes use 'percentage' | 'fixed' (older rows say 'flat'); anything that
// isn't a percentage is a flat amount.
const normalizeDiscountType = (value: unknown) => (value && value !== 'percentage' ? 'fixed' : 'percentage');

const toNumberOr = (value: unknown, fallback: number) => {
  const num = toFiniteNonNegative(value);
  return num === null ? fallback : num;
};

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
 * Copies customer details (email, phone, address) from the quote.
 */
export const createInvoiceFromQuote = async (quote: {
  id: number;
  client: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  companyAddress?: string | null;
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
    customerEmail: quote.customerEmail || null,
    customerPhone: quote.customerPhone || null,
    customerAddress: quote.customerAddress || null,
    companyAddress: quote.companyAddress || null,
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

    // Lazily flip idle pending invoices that have passed their due date to
    // 'overdue' — previously status was only recomputed on payment events, so
    // unpaid past-due invoices stayed 'pending' forever and the Overdue filter
    // was empty for them.
    await markOverdueInvoices();

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

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id as string, { include: DETAIL_INCLUDE });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    return res.json(serializeDetail(invoice));
  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({ message: 'Server error while fetching invoice' });
  }
};

/**
 * Creates an invoice. Like a quotation it can carry line items (`products`),
 * `taxes`, discount and shipping — the grand total is then computed
 * server-side. Without line items, the hand-entered `amount` is used as-is
 * (the original lump-sum behaviour, kept for imports and simple invoices).
 */
export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { client, customerEmail, customerPhone, customerAddress, companyAddress, amount, status, issuedDate, dueDate, quoteId, assignedToId } = req.body;
    if (!client) return res.status(400).json({ message: 'Client is required' });

    const parsedAmount = amount !== undefined && amount !== '' ? toFiniteNonNegative(amount) : 0;
    if (parsedAmount === null) {
      return res.status(400).json({ message: 'Amount must be a valid non-negative number' });
    }

    const id = await sequelize.transaction(async (t) => {
      const invoice = await Invoice.create(
        {
          invoiceNumber: await generateInvoiceNumber(),
          client,
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
          customerAddress: customerAddress || null,
          companyAddress: companyAddress || null,
          amount: parsedAmount,
          discountType: normalizeDiscountType(req.body.discountType),
          discountValue: toNumberOr(req.body.discountValue, 0),
          shippingCharges: toNumberOr(req.body.shippingCharges, 0),
          terms: req.body.terms || null,
          paymentTerms: req.body.paymentTerms || null,
          notes: req.body.notes || null,
          status: status || 'draft',
          issuedDate: issuedDate || null,
          dueDate: dueDate || null,
          quoteId: quoteId || null,
          assignedToId: assignedToId || null,
        },
        { transaction: t }
      );
      if (Array.isArray(req.body.products)) await replaceInvoiceProducts(invoice.id, req.body.products, t);
      if (Array.isArray(req.body.taxes)) await replaceInvoiceTaxes(invoice.id, req.body.taxes, t);
      await recalculateInvoiceTotals(invoice.id, t);
      return invoice.id;
    });

    const invoice = await Invoice.findByPk(id, { include: DETAIL_INCLUDE });
    return res.status(201).json({ message: 'Invoice created successfully', invoice: serializeDetail(invoice) });
  } catch (error) {
    console.error('Create invoice error:', error);
    return res.status(500).json({ message: 'Server error while creating invoice' });
  }
};

export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id as string);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const { client, customerEmail, customerPhone, customerAddress, companyAddress, amount, status, issuedDate, dueDate, quoteId, assignedToId } = req.body;

    const parsedAmount = amount !== undefined && amount !== '' ? toFiniteNonNegative(amount) : null;
    if (amount !== undefined && parsedAmount === null) {
      return res.status(400).json({ message: 'Amount must be a valid non-negative number' });
    }

    await sequelize.transaction(async (t) => {
      await invoice.update(
        {
          client: client ?? invoice.client,
          customerEmail: customerEmail !== undefined ? customerEmail : invoice.customerEmail,
          customerPhone: customerPhone !== undefined ? customerPhone : invoice.customerPhone,
          customerAddress: customerAddress !== undefined ? customerAddress : invoice.customerAddress,
          companyAddress: companyAddress !== undefined ? companyAddress : invoice.companyAddress,
          amount: parsedAmount !== null ? parsedAmount : invoice.amount,
          discountType: req.body.discountType !== undefined ? normalizeDiscountType(req.body.discountType) : invoice.discountType,
          discountValue: req.body.discountValue !== undefined ? toNumberOr(req.body.discountValue, 0) : invoice.discountValue,
          shippingCharges: req.body.shippingCharges !== undefined ? toNumberOr(req.body.shippingCharges, 0) : invoice.shippingCharges,
          terms: req.body.terms !== undefined ? req.body.terms : invoice.terms,
          paymentTerms: req.body.paymentTerms !== undefined ? req.body.paymentTerms : invoice.paymentTerms,
          notes: req.body.notes !== undefined ? req.body.notes : invoice.notes,
          status: status ?? invoice.status,
          // '' from a cleared date input would be an invalid DATEONLY
          issuedDate: issuedDate !== undefined ? issuedDate || null : invoice.issuedDate,
          dueDate: dueDate !== undefined ? dueDate || null : invoice.dueDate,
          quoteId: quoteId !== undefined ? quoteId || null : invoice.quoteId,
          assignedToId: assignedToId !== undefined ? assignedToId : invoice.assignedToId,
        },
        { transaction: t }
      );
      if (Array.isArray(req.body.products)) await replaceInvoiceProducts(invoice.id, req.body.products, t);
      if (Array.isArray(req.body.taxes)) await replaceInvoiceTaxes(invoice.id, req.body.taxes, t);
      await recalculateInvoiceTotals(invoice.id, t);
    });

    // Amount/dueDate edits can make the stored status stale (e.g. raising the
    // amount above recorded payments, or extending an overdue invoice's due
    // date). Recompute it — draft/cancelled are preserved by the helper.
    await recalculateInvoiceStatus(invoice.id);

    const updated = await Invoice.findByPk(invoice.id, { include: DETAIL_INCLUDE });
    return res.json({ message: 'Invoice updated successfully', invoice: serializeDetail(updated) });
  } catch (error) {
    console.error('Update invoice error:', error);
    return res.status(500).json({ message: 'Server error while updating invoice' });
  }
};

export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const linkedPayments = await Payment.count({ where: { invoiceId: invoice.id } });
    if (linkedPayments > 0) {
      return res.status(409).json({ message: 'Cannot delete this invoice because it has recorded payments.' });
    }

    await invoice.destroy();
    return res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
