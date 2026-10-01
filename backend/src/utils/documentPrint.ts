import Company from '../models/Company';
import Quote from '../models/Quote';
import QuoteProduct from '../models/QuoteProduct';
import QuoteTax from '../models/QuoteTax';
import Invoice from '../models/Invoice';
import Payment from '../models/Payment';
import Task from '../models/Task';
import Meeting from '../models/Meeting';
import User from '../models/User';
import Lead from '../models/Lead';
import Deal from '../models/Deal';
import Contact from '../models/Contact';
import DocumentTemplate from '../models/DocumentTemplate';
import { DocType, getSampleData } from '../config/documentTemplateFields';
import { getBuiltInPrintTemplate } from '../config/printStarters';
import { renderTemplate, SafeHtml, escapeHtml } from './templateRenderer';
import { formatMoney } from './format';
import { NotFoundError } from '../errors/AppError';

// Turns a real record into the {{field}} data every Document Template uses,
// and renders a print format for it. This is the one place print output is
// produced, so the quote print view, the customer's public link, and the
// invoice/task/meeting prints all honour the default "Print Format" template
// set under Document Templates, falling back to the built-in layout.

type Data = Record<string, unknown>;

export const formatLongDate = (value?: Date | string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const fullName = (u?: { firstName?: string; lastName?: string } | null) =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const belowThousand = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
};

/** "46700.5" -> "Forty-six thousand seven hundred and 50/100 only". Uses lakh/crore for INR. */
export const amountInWords = (value: number, currency = 'INR'): string => {
  const whole = Math.floor(Math.abs(value || 0));
  const fraction = Math.round((Math.abs(value || 0) - whole) * 100);
  if (whole === 0 && fraction === 0) return 'Zero only';

  const scales: [number, string][] =
    currency === 'INR'
      ? [[10000000, 'crore'], [100000, 'lakh'], [1000, 'thousand']]
      : [[1000000000, 'billion'], [1000000, 'million'], [1000, 'thousand']];

  let rest = whole;
  const words: string[] = [];
  for (const [size, name] of scales) {
    if (rest >= size) {
      const count = Math.floor(rest / size);
      words.push(`${count >= 1000 ? amountInWords(count, currency).replace(/ only$/, '').toLowerCase() : belowThousand(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) words.push(belowThousand(rest));

  let text = words.join(' ') || 'zero';
  if (fraction) text += ` and ${fraction}/100`;
  text += ' only';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const getCompany = () => Company.findOne({ order: [['id', 'ASC']] });

// Only absolute or inline image sources work in a print window (uploads sit
// behind auth), so anything else is dropped rather than rendering a broken image.
const usableImageSrc = (src?: string | null) => (src && /^(https?:|data:image\/)/i.test(src) ? src : '');

const companyData = (company: Company | null): Data => ({
  company_name: company?.name || 'Our Company',
  company_address: company?.address || '',
  company_phone: company?.phone || '',
  company_email: company?.email || '',
  company_website: company?.website || '',
  company_logo: usableImageSrc(company?.logo),
  print_date: formatLongDate(new Date()),
});

/** Pre-rendered tables for templates that just want "the items here" without writing a loop. */
const withReadyMadeTables = (data: Data): Data => {
  const items = (data.items as Data[]) || [];
  const taxes = (data.taxes as Data[]) || [];
  const cell = (v: unknown, align = 'left') => `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:${align}">${escapeHtml(String(v ?? ''))}</td>`;
  const head = (v: string, align = 'left') => `<th style="padding:6px 8px;background:#168eea;color:#fff;text-align:${align};font-size:12px">${v}</th>`;

  const itemsTable = `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${head('#')}${head('Item')}${head('Qty', 'right')}${head('Unit')}${head('Rate', 'right')}${head('Amount', 'right')}</tr></thead><tbody>${items
    .map((it, i) => `<tr>${cell(i + 1)}${cell(it.item_name)}${cell(it.quantity, 'right')}${cell(it.unit)}${cell(it.rate, 'right')}${cell(it.amount, 'right')}</tr>`)
    .join('')}</tbody></table>`;

  const row = (label: unknown, value: unknown, bold = false) =>
    `<tr${bold ? ' style="font-weight:bold;border-top:2px solid #168eea"' : ''}><td style="padding:4px 8px">${escapeHtml(String(label))}</td><td style="padding:4px 8px;text-align:right">${escapeHtml(String(value))}</td></tr>`;
  const totalsTable = `<table style="width:320px;margin-left:auto;border-collapse:collapse;font-size:13px">${[
    row('Subtotal', data.subtotal),
    data.discount_amount ? row(data.discount_label || 'Discount', `- ${data.discount_amount}`) : '',
    data.shipping_charges ? row('Shipping', data.shipping_charges) : '',
    ...taxes.map((t) => row(`${t.tax_name} (${t.tax_percentage}%)`, t.tax_amount)),
    row('Grand Total', data.total_amount, true),
  ].join('')}</table>`;

  return { ...data, items_table: new SafeHtml(itemsTable), totals_table: new SafeHtml(totalsTable) };
};

const money = (value: unknown, currency: string) => formatMoney(Number(value) || 0, currency);
const moneyOrBlank = (value: unknown, currency: string) => (Number(value) ? money(value, currency) : '');

const quoteChildData = (products: any[], taxes: any[], currency: string) => ({
  items: products.map((p) => ({
    item_name: p.productName,
    quantity: String(Number(p.quantity)),
    unit: p.unit || '',
    rate: money(p.rate, currency),
    amount: money(p.amount, currency),
  })),
  taxes: taxes.map((t) => ({
    tax_name: t.taxType,
    tax_percentage: String(Number(t.percentage)),
    tax_amount: money(t.amount, currency),
  })),
});

export const buildQuoteData = async (quoteOrId: Quote | number | string): Promise<Data> => {
  const quote =
    quoteOrId instanceof Quote && (quoteOrId as any).products
      ? quoteOrId
      : await Quote.findByPk(quoteOrId instanceof Quote ? quoteOrId.id : quoteOrId, {
          include: [
            { model: QuoteProduct, as: 'products', required: false },
            { model: QuoteTax, as: 'taxes', required: false },
            { model: User, as: 'assignedTo', attributes: ['id', 'firstName', 'lastName'], required: false },
          ],
        });
  if (!quote) throw new NotFoundError('Quote', String(quoteOrId instanceof Quote ? quoteOrId.id : quoteOrId));

  const company = await getCompany();
  const currency = company?.currency || 'INR';
  const plain: any = quote.toJSON();
  const subtotal = Number(plain.subtotal) || 0;
  const discountValue = Number(plain.discountValue) || 0;
  const discountAmount = !discountValue ? 0 : plain.discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;

  return withReadyMadeTables({
    ...companyData(company),
    quote_number: plain.quoteNumber,
    quotation_date: formatLongDate(plain.quotationDate),
    valid_until: formatLongDate(plain.validUntil),
    sent_date: formatLongDate(plain.sentAt || new Date()),
    status: plain.status,
    revision_number: String(plain.revisionNumber ?? ''),
    sales_person: fullName(plain.assignedTo),
    terms: plain.terms || '',
    payment_terms: plain.paymentTerms || '',
    client_name: plain.client,
    customer_email: plain.customerEmail || '',
    customer_phone: plain.customerPhone || '',
    customer_address: plain.customerAddress || '',
    subtotal: money(subtotal, currency),
    discount_amount: moneyOrBlank(discountAmount, currency),
    discount_label: plain.discountType === 'percentage' ? `Discount (${discountValue}%)` : 'Discount',
    shipping_charges: moneyOrBlank(plain.shippingCharges, currency),
    tax_total: money(plain.taxTotal, currency),
    total_amount: money(plain.amount, currency),
    amount_in_words: amountInWords(Number(plain.amount), currency),
    ...quoteChildData(plain.products || [], plain.taxes || [], currency),
  });
};

export const buildInvoiceData = async (id: number | string): Promise<Data> => {
  const invoice = await Invoice.findByPk(id, {
    include: [
      {
        model: Quote,
        as: 'quoteRef',
        required: false,
        include: [
          { model: QuoteProduct, as: 'products', required: false },
          { model: QuoteTax, as: 'taxes', required: false },
        ],
      },
      { model: Payment, as: 'payments', required: false },
    ],
  });
  if (!invoice) throw new NotFoundError('Invoice', String(id));

  const company = await getCompany();
  const currency = company?.currency || 'INR';
  const plain: any = invoice.toJSON();
  const quote = plain.quoteRef;
  const total = Number(plain.amount) || 0;
  const paid = (plain.payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // Invoices carry their line items through the quote they were raised from.
  // A stand-alone invoice prints as a single line for its full amount.
  const child = quote
    ? quoteChildData(quote.products || [], quote.taxes || [], currency)
    : {
        items: [{ item_name: `Invoice ${plain.invoiceNumber}`, quantity: '1', unit: '', rate: money(total, currency), amount: money(total, currency) }],
        taxes: [],
      };
  const subtotal = quote ? Number(quote.subtotal) || 0 : total;
  const discountValue = quote ? Number(quote.discountValue) || 0 : 0;
  const discountAmount = !discountValue ? 0 : quote.discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;

  return withReadyMadeTables({
    ...companyData(company),
    company_address: plain.companyAddress || company?.address || '',
    invoice_number: plain.invoiceNumber,
    issued_date: formatLongDate(plain.issuedDate || plain.createdAt),
    due_date: formatLongDate(plain.dueDate),
    status: plain.status,
    quote_number: quote?.quoteNumber || '',
    terms: quote?.terms || '',
    payment_terms: quote?.paymentTerms || '',
    client_name: plain.client,
    customer_email: plain.customerEmail || '',
    customer_phone: plain.customerPhone || '',
    customer_address: plain.customerAddress || '',
    subtotal: money(subtotal, currency),
    discount_amount: moneyOrBlank(discountAmount, currency),
    discount_label: quote?.discountType === 'percentage' ? `Discount (${discountValue}%)` : 'Discount',
    shipping_charges: moneyOrBlank(quote?.shippingCharges, currency),
    tax_total: money(quote?.taxTotal, currency),
    total_amount: money(total, currency),
    amount_paid: money(paid, currency),
    amount_due: money(Math.max(total - paid, 0), currency),
    amount_in_words: amountInWords(total, currency),
    ...child,
  });
};

const relatedName = (plain: any) =>
  plain.relatedTo ||
  plain.deal?.title ||
  (plain.lead ? plain.lead.company || fullName(plain.lead) : '') ||
  (plain.contact ? fullName(plain.contact) : '') ||
  '';

const relationIncludes = [
  { model: User, as: 'assignedTo', attributes: ['id', 'firstName', 'lastName'], required: false },
  { model: Lead, as: 'lead', attributes: ['id', 'firstName', 'lastName', 'company'], required: false },
  { model: Deal, as: 'deal', attributes: ['id', 'title'], required: false },
  { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName'], required: false },
];

export const buildTaskData = async (id: number | string): Promise<Data> => {
  const task = await Task.findByPk(id, { include: relationIncludes });
  if (!task) throw new NotFoundError('Task', String(id));
  const plain: any = task.toJSON();
  return {
    ...companyData(await getCompany()),
    task_title: plain.title,
    task_type: plain.type || '',
    assignee_name: fullName(plain.assignedTo),
    due_date: formatLongDate(plain.dueDate),
    due_time: plain.dueTime || '',
    priority: plain.priority || '',
    status: plain.status || '',
    related_to: relatedName(plain),
    description: plain.description || '',
  };
};

export const buildMeetingData = async (id: number | string): Promise<Data> => {
  const meeting = await Meeting.findByPk(id, { include: relationIncludes });
  if (!meeting) throw new NotFoundError('Meeting', String(id));
  const plain: any = meeting.toJSON();
  return {
    ...companyData(await getCompany()),
    meeting_title: plain.title,
    client_name: plain.client || relatedName(plain),
    date: plain.date ? new Date(plain.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '',
    time: plain.time || '',
    duration: plain.duration || '',
    meeting_type: plain.type || '',
    status: plain.status || '',
    assignee_name: fullName(plain.assignedTo),
    customer_email: plain.customerEmail || '',
    meet_link: plain.meetLink || '',
    notes: plain.notes || '',
  };
};

export const buildDocumentData = (docType: DocType, id: number | string): Promise<Data> => {
  switch (docType) {
    case 'quote':
      return buildQuoteData(id);
    case 'invoice':
      return buildInvoiceData(id);
    case 'task':
      return buildTaskData(id);
    case 'meeting':
      return buildMeetingData(id);
  }
};

/** Sample data plus the ready-made tables, so editor previews match a real print. */
export const getPreviewData = (docType: DocType): Data => {
  const sample = getSampleData(docType);
  return docType === 'quote' || docType === 'invoice' ? withReadyMadeTables(sample) : sample;
};

const DOC_TITLES: Record<DocType, string> = { quote: 'Quotation', invoice: 'Invoice', task: 'Task', meeting: 'Meeting' };

/**
 * Wraps a rendered template body in a complete, print-ready page. Templates
 * that already contain their own <html> document are returned untouched.
 */
export const wrapPrintPage = (body: string, title: string, autoPrint = false): string => {
  const script = autoPrint ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)});</script>` : '';
  if (/<html[\s>]/i.test(body)) return autoPrint ? body.replace(/<\/body>/i, `${script}</body>`) : body;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff; }
  body { margin: 0; padding: 24px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
${body}
${script}
</body>
</html>`;
};

/** Picks the template to print with: an explicit one, else the default print format, else the built-in layout. */
export const resolvePrintTemplate = async (docType: DocType, templateId?: number | string | null): Promise<string> => {
  if (templateId) {
    const chosen = await DocumentTemplate.findByPk(templateId);
    if (!chosen || chosen.docType !== docType) throw new NotFoundError('Print format', String(templateId));
    return chosen.htmlBody;
  }
  const fallbackDefault = await DocumentTemplate.findOne({ where: { docType, purpose: 'print', isDefault: true } });
  return fallbackDefault?.htmlBody || getBuiltInPrintTemplate(docType);
};

export const renderDocumentPrint = async (
  docType: DocType,
  id: number | string,
  options: { templateId?: number | string | null; autoPrint?: boolean } = {}
): Promise<string> => {
  const data = await buildDocumentData(docType, id);
  const template = await resolvePrintTemplate(docType, options.templateId);
  const number = (data.quote_number && docType === 'quote' ? data.quote_number : data.invoice_number) || data.task_title || data.meeting_title || '';
  const body = renderTemplate(template, data, { escapeHtml: true });
  return wrapPrintPage(body, `${DOC_TITLES[docType]} ${number}`.trim(), options.autoPrint);
};
