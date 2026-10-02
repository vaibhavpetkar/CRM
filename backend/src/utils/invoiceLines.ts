import { Transaction } from 'sequelize';
import Invoice from '../models/Invoice';
import InvoiceProduct from '../models/InvoiceProduct';
import InvoiceTax from '../models/InvoiceTax';
import QuoteProduct from '../models/QuoteProduct';
import QuoteTax from '../models/QuoteTax';

export interface InvoiceProductInput {
  itemId?: number | null;
  productName: string;
  quantity?: number;
  unit?: string;
  rate?: number;
}

export interface InvoiceTaxInput {
  taxId?: number | null;
  taxType: string;
  percentage?: number;
}

export const computeDiscountAmount = (subtotal: number, discountType: string, discountValue: number): number => {
  if (!discountValue) return 0;
  return discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;
};

export const replaceInvoiceProducts = async (invoiceId: number, products: InvoiceProductInput[], t: Transaction) => {
  await InvoiceProduct.destroy({ where: { invoiceId }, transaction: t });
  const rows = products.filter((p) => p && p.productName);
  if (!rows.length) return;
  await InvoiceProduct.bulkCreate(
    rows.map((p) => {
      const quantity = Number(p.quantity ?? 1) || 0;
      const rate = Number(p.rate ?? 0) || 0;
      return { invoiceId, itemId: p.itemId || null, productName: p.productName, quantity, unit: p.unit || 'Nos', rate, amount: quantity * rate };
    }),
    { transaction: t }
  );
};

export const replaceInvoiceTaxes = async (invoiceId: number, taxes: InvoiceTaxInput[], t: Transaction) => {
  await InvoiceTax.destroy({ where: { invoiceId }, transaction: t });
  const rows = taxes.filter((tx) => tx && tx.taxType);
  if (!rows.length) return;
  await InvoiceTax.bulkCreate(
    rows.map((tx) => ({ invoiceId, taxId: tx.taxId ?? null, taxType: tx.taxType, percentage: Number(tx.percentage ?? 0) || 0, amount: 0 })),
    { transaction: t }
  );
};

/**
 * Same math as QuoteService.recalculateTotals: subtotal -> discount -> tax on
 * the discounted subtotal -> + shipping. Only applies when the invoice has
 * line items; an invoice without any (legacy, or keyed in as a lump sum)
 * keeps its hand-entered amount.
 */
export const recalculateInvoiceTotals = async (invoiceId: number, t: Transaction) => {
  const invoice = await Invoice.findByPk(invoiceId, { transaction: t });
  if (!invoice) return;

  const products = await InvoiceProduct.findAll({ where: { invoiceId }, transaction: t });
  const taxes = await InvoiceTax.findAll({ where: { invoiceId }, transaction: t });
  if (!products.length) {
    for (const tax of taxes) await tax.update({ amount: 0 }, { transaction: t });
    await invoice.update({ subtotal: 0, taxTotal: 0 }, { transaction: t });
    return;
  }

  const subtotal = products.reduce((sum, p) => sum + Number(p.amount), 0);
  const discountAmount = computeDiscountAmount(subtotal, invoice.discountType, Number(invoice.discountValue));
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);

  let taxTotal = 0;
  for (const tax of taxes) {
    const amount = (discountedSubtotal * Number(tax.percentage)) / 100;
    taxTotal += amount;
    await tax.update({ amount }, { transaction: t });
  }

  const amount = discountedSubtotal + taxTotal + Number(invoice.shippingCharges);
  await invoice.update({ subtotal, taxTotal, amount }, { transaction: t });
};

/** Copies an approved quotation's items, taxes and commercials onto its invoice. */
export const copyQuoteLinesToInvoice = async (
  quote: { id: number; discountType: string; discountValue: number; shippingCharges: number; terms?: string | null; paymentTerms?: string | null },
  invoiceId: number,
  t: Transaction
) => {
  const [products, taxes] = await Promise.all([
    QuoteProduct.findAll({ where: { quoteId: quote.id }, transaction: t }),
    QuoteTax.findAll({ where: { quoteId: quote.id }, transaction: t }),
  ]);
  await Invoice.update(
    {
      discountType: quote.discountType && quote.discountType !== 'percentage' ? 'fixed' : 'percentage',
      discountValue: quote.discountValue,
      shippingCharges: quote.shippingCharges,
      terms: quote.terms ?? null,
      paymentTerms: quote.paymentTerms ?? null,
    },
    { where: { id: invoiceId }, transaction: t }
  );
  await replaceInvoiceProducts(invoiceId, products.map((p) => ({ itemId: p.itemId, productName: p.productName, quantity: Number(p.quantity), unit: p.unit, rate: Number(p.rate) })), t);
  await replaceInvoiceTaxes(invoiceId, taxes.map((tx) => ({ taxId: tx.taxId, taxType: tx.taxType, percentage: Number(tx.percentage) })), t);
  await recalculateInvoiceTotals(invoiceId, t);
};
