import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/upload';
import { formatMoney } from './format';

export interface DocumentLineItem {
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface DocumentTaxRow {
  label: string;
  percentage: number;
  amount: number;
}

export interface PrintableDocument {
  docType: 'Quotation' | 'Invoice';
  docNumber: string;
  docDate: string;
  validUntilOrDueDate?: { label: string; value: string } | null;
  companyName: string;
  companyAddress?: string | null;
  customerName: string;
  customerAddress?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  lineItems: DocumentLineItem[];
  subtotal: number;
  discountLabel?: string | null;
  discountAmount: number;
  shippingCharges: number;
  taxes: DocumentTaxRow[];
  taxTotal: number;
  grandTotal: number;
  terms?: string | null;
  paymentTerms?: string | null;
  currency: string;
  status: string;
}

/**
 * Renders a Quotation or Invoice as a PDF file on disk and returns its path.
 * Shared between the Quotation and Invoice modules so both documents look
 * consistent and any layout fix applies to both at once.
 */
export const generateDocumentPdf = (doc: PrintableDocument, outputFileName: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(UPLOAD_DIR, outputFileName);
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    pdf.pipe(stream);

    // ─── Header ───────────────────────────────────────────────────────────
    pdf.fontSize(20).text(doc.docType.toUpperCase(), { align: 'right' });
    pdf.fontSize(10).fillColor('#555').text(doc.docNumber, { align: 'right' });
    pdf.text(`Date: ${doc.docDate}`, { align: 'right' });
    if (doc.validUntilOrDueDate) {
      pdf.text(`${doc.validUntilOrDueDate.label}: ${doc.validUntilOrDueDate.value}`, { align: 'right' });
    }
    pdf.text(`Status: ${doc.status.toUpperCase()}`, { align: 'right' });
    pdf.fillColor('#000');
    pdf.moveDown(1.5);

    // ─── From / To ────────────────────────────────────────────────────────
    const columnTop = pdf.y;
    pdf.fontSize(11).text('From', 50, columnTop, { underline: true });
    pdf.fontSize(10).text(doc.companyName, 50, pdf.y + 2);
    if (doc.companyAddress) pdf.text(doc.companyAddress, 50, pdf.y, { width: 220 });

    pdf.fontSize(11).text('Bill To', 320, columnTop, { underline: true });
    pdf.fontSize(10).text(doc.customerName, 320, columnTop + 16, { width: 220 });
    if (doc.customerAddress) pdf.text(doc.customerAddress, 320, pdf.y, { width: 220 });
    if (doc.customerEmail) pdf.text(doc.customerEmail, 320, pdf.y, { width: 220 });
    if (doc.customerPhone) pdf.text(doc.customerPhone, 320, pdf.y, { width: 220 });

    pdf.moveDown(2);
    pdf.y = Math.max(pdf.y, columnTop + 100);

    // ─── Line items table ─────────────────────────────────────────────────
    const tableTop = pdf.y + 10;
    const cols = { name: 50, qty: 260, unit: 320, rate: 380, amount: 470 };
    pdf.fontSize(10).fillColor('#fff').rect(50, tableTop, 495, 20).fill('#168eea');
    pdf.fillColor('#fff');
    pdf.text('Item', cols.name + 5, tableTop + 5);
    pdf.text('Qty', cols.qty, tableTop + 5);
    pdf.text('Unit', cols.unit, tableTop + 5);
    pdf.text('Rate', cols.rate, tableTop + 5);
    pdf.text('Amount', cols.amount, tableTop + 5);
    pdf.fillColor('#000');

    let rowY = tableTop + 25;
    doc.lineItems.forEach((item, idx) => {
      if (idx % 2 === 1) {
        pdf.rect(50, rowY - 4, 495, 20).fill('#f5f7fa');
        pdf.fillColor('#000');
      }
      pdf.fontSize(9);
      pdf.text(item.name, cols.name + 5, rowY, { width: 200 });
      pdf.text(String(item.quantity), cols.qty, rowY);
      pdf.text(item.unit, cols.unit, rowY);
      pdf.text(formatMoney(item.rate, doc.currency), cols.rate, rowY);
      pdf.text(formatMoney(item.amount, doc.currency), cols.amount, rowY);
      rowY += 20;
    });

    pdf.y = rowY + 10;

    // ─── Totals ───────────────────────────────────────────────────────────
    const totalsX = 350;
    const writeTotalRow = (label: string, value: string, bold = false) => {
      pdf.fontSize(bold ? 11 : 10).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      pdf.text(label, totalsX, pdf.y, { width: 100 });
      pdf.text(value, totalsX + 100, pdf.y, { width: 95, align: 'right' });
      pdf.moveDown(0.4);
    };

    writeTotalRow('Subtotal', formatMoney(doc.subtotal, doc.currency));
    if (doc.discountAmount > 0) {
      writeTotalRow(doc.discountLabel || 'Discount', `- ${formatMoney(doc.discountAmount, doc.currency)}`);
    }
    if (doc.shippingCharges > 0) {
      writeTotalRow('Shipping', formatMoney(doc.shippingCharges, doc.currency));
    }
    doc.taxes.forEach((tax) => {
      writeTotalRow(`${tax.label} (${tax.percentage}%)`, formatMoney(tax.amount, doc.currency));
    });
    writeTotalRow('Grand Total', formatMoney(doc.grandTotal, doc.currency), true);
    pdf.font('Helvetica');

    // ─── Terms ────────────────────────────────────────────────────────────
    if (doc.paymentTerms || doc.terms) {
      pdf.moveDown(2);
      if (doc.paymentTerms) {
        pdf.fontSize(11).text('Payment Terms', 50, pdf.y, { underline: true });
        pdf.fontSize(9).text(doc.paymentTerms, 50, pdf.y + 2, { width: 495 });
        pdf.moveDown(1);
      }
      if (doc.terms) {
        pdf.fontSize(11).text('Terms & Conditions', 50, pdf.y, { underline: true });
        pdf.fontSize(9).text(doc.terms, 50, pdf.y + 2, { width: 495 });
      }
    }

    pdf.end();
    stream.on('finish', () => resolve(`/uploads/${outputFileName}`));
    stream.on('error', reject);
  });
};
