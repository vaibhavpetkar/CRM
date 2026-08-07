import { PrintableDocument } from './pdfGenerator';
import { formatMoney } from './format';

/**
 * Renders the same document data the PDF generator uses as clean, printable
 * HTML (browser "Print" / "Save as PDF" friendly) — this is the "Print Format"
 * the frontend can open in a new tab.
 */
export const renderPrintHtml = (doc: PrintableDocument): string => {
  const rows = doc.lineItems
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td>${formatMoney(item.rate, doc.currency)}</td>
        <td>${formatMoney(item.amount, doc.currency)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${doc.docType} ${escapeHtml(doc.docNumber)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1e293b; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .header h1 { margin: 0; color: #168eea; }
  .meta { text-align: right; font-size: 13px; color: #475569; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .parties div { width: 48%; }
  .parties h3 { font-size: 13px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #168eea; color: #fff; text-align: left; padding: 8px; font-size: 13px; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .totals { width: 300px; margin-left: auto; margin-top: 16px; }
  .totals td { border: none; }
  .grand-total td { font-weight: bold; font-size: 15px; border-top: 2px solid #168eea; }
  .terms { margin-top: 32px; font-size: 12px; color: #475569; }
  .status-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; background: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: bold; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${doc.docType}</h1>
      <div>${escapeHtml(doc.docNumber)}</div>
    </div>
    <div class="meta">
      <div>Date: ${escapeHtml(doc.docDate)}</div>
      ${doc.validUntilOrDueDate ? `<div>${escapeHtml(doc.validUntilOrDueDate.label)}: ${escapeHtml(doc.validUntilOrDueDate.value)}</div>` : ''}
      <div class="status-badge">${escapeHtml(doc.status.toUpperCase())}</div>
    </div>
  </div>

  <div class="parties">
    <div>
      <h3>From</h3>
      <div>${escapeHtml(doc.companyName)}</div>
      ${doc.companyAddress ? `<div>${escapeHtml(doc.companyAddress)}</div>` : ''}
    </div>
    <div>
      <h3>Bill To</h3>
      <div>${escapeHtml(doc.customerName)}</div>
      ${doc.customerAddress ? `<div>${escapeHtml(doc.customerAddress)}</div>` : ''}
      ${doc.customerEmail ? `<div>${escapeHtml(doc.customerEmail)}</div>` : ''}
      ${doc.customerPhone ? `<div>${escapeHtml(doc.customerPhone)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td>${formatMoney(doc.subtotal, doc.currency)}</td></tr>
    ${doc.discountAmount > 0 ? `<tr><td>${escapeHtml(doc.discountLabel || 'Discount')}</td><td>- ${formatMoney(doc.discountAmount, doc.currency)}</td></tr>` : ''}
    ${doc.shippingCharges > 0 ? `<tr><td>Shipping</td><td>${formatMoney(doc.shippingCharges, doc.currency)}</td></tr>` : ''}
    ${doc.taxes.map((t) => `<tr><td>${escapeHtml(t.label)} (${t.percentage}%)</td><td>${formatMoney(t.amount, doc.currency)}</td></tr>`).join('')}
    <tr class="grand-total"><td>Grand Total</td><td>${formatMoney(doc.grandTotal, doc.currency)}</td></tr>
  </table>

  ${
    doc.paymentTerms || doc.terms
      ? `<div class="terms">
    ${doc.paymentTerms ? `<h3>Payment Terms</h3><p>${escapeHtml(doc.paymentTerms)}</p>` : ''}
    ${doc.terms ? `<h3>Terms &amp; Conditions</h3><p>${escapeHtml(doc.terms)}</p>` : ''}
  </div>`
      : ''
  }
</body>
</html>`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
