// Single source of truth for what {{field}} placeholders exist per document
// type — used by the template editor's field picker/preview, by the real
// render at send-time (QuoteService.sendEmail) and by every print format
// (utils/documentPrint.ts builds the real values with these same keys).
export type DocType = 'quote' | 'invoice' | 'task' | 'meeting';

// A template is either the email body sent with a document ("email") or the
// printable document itself ("print"). One default per docType + purpose.
export type TemplatePurpose = 'email' | 'print';
export const TEMPLATE_PURPOSES: { value: TemplatePurpose; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'print', label: 'Print Format' },
];

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'quote', label: 'Quote' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
];

export interface FieldDef {
  key: string; // used as {{key}}
  label: string;
  sample: string;
  group?: string;
}

/** A repeating child table, rendered with {{#key}} ... {{/key}}. */
export interface ListDef {
  key: string;
  label: string;
  fields: FieldDef[];
  sample: Record<string, string>[];
}

const COMPANY_FIELDS: FieldDef[] = [
  { key: 'company_name', label: 'Your Company Name', sample: 'Your Company', group: 'Company' },
  { key: 'company_address', label: 'Company Address', sample: '4th Floor, Tech Park, Pune 411001', group: 'Company' },
  { key: 'company_phone', label: 'Company Phone', sample: '+91 98765 43210', group: 'Company' },
  { key: 'company_email', label: 'Company Email', sample: 'sales@yourcompany.example', group: 'Company' },
  { key: 'company_website', label: 'Company Website', sample: 'www.yourcompany.example', group: 'Company' },
  { key: 'company_logo', label: 'Company Logo URL', sample: '', group: 'Company' },
  { key: 'print_date', label: 'Printed On', sample: '17 August 2026', group: 'Company' },
];

const CUSTOMER_FIELDS: FieldDef[] = [
  { key: 'client_name', label: 'Client Name', sample: 'Acme Retail Pvt Ltd', group: 'Customer' },
  { key: 'customer_email', label: 'Customer Email', sample: 'buyer@acme.example', group: 'Customer' },
  { key: 'customer_phone', label: 'Customer Phone', sample: '+91 91234 56789', group: 'Customer' },
  { key: 'customer_address', label: 'Customer Address', sample: '12 MG Road, Bengaluru 560001', group: 'Customer' },
];

const TOTAL_FIELDS: FieldDef[] = [
  { key: 'subtotal', label: 'Subtotal', sample: '₹40,000.00', group: 'Totals' },
  { key: 'discount_amount', label: 'Discount', sample: '₹2,000.00', group: 'Totals' },
  { key: 'discount_label', label: 'Discount Label', sample: 'Discount (5%)', group: 'Totals' },
  { key: 'shipping_charges', label: 'Shipping', sample: '₹1,500.00', group: 'Totals' },
  { key: 'tax_total', label: 'Tax Total', sample: '₹7,200.00', group: 'Totals' },
  { key: 'total_amount', label: 'Grand Total', sample: '₹46,700.00', group: 'Totals' },
  { key: 'amount_in_words', label: 'Amount in Words', sample: 'Forty-six thousand seven hundred only', group: 'Totals' },
  { key: 'items_table', label: 'Items Table (ready-made)', sample: '', group: 'Totals' },
  { key: 'totals_table', label: 'Totals Table (ready-made)', sample: '', group: 'Totals' },
];

const ITEM_LIST: ListDef = {
  key: 'items',
  label: 'Items',
  fields: [
    { key: 'index', label: 'Row #', sample: '1' },
    { key: 'item_name', label: 'Item Name', sample: 'Annual CRM Licence' },
    { key: 'quantity', label: 'Quantity', sample: '2' },
    { key: 'unit', label: 'Unit', sample: 'pcs' },
    { key: 'rate', label: 'Rate', sample: '₹15,000.00' },
    { key: 'amount', label: 'Amount', sample: '₹30,000.00' },
  ],
  sample: [
    { item_name: 'Annual CRM Licence', quantity: '2', unit: 'pcs', rate: '₹15,000.00', amount: '₹30,000.00' },
    { item_name: 'Onboarding & Training', quantity: '1', unit: 'job', rate: '₹10,000.00', amount: '₹10,000.00' },
  ],
};

const TAX_LIST: ListDef = {
  key: 'taxes',
  label: 'Taxes',
  fields: [
    { key: 'tax_name', label: 'Tax Name', sample: 'GST' },
    { key: 'tax_percentage', label: 'Tax %', sample: '18' },
    { key: 'tax_amount', label: 'Tax Amount', sample: '₹7,200.00' },
  ],
  sample: [{ tax_name: 'GST', tax_percentage: '18', tax_amount: '₹7,200.00' }],
};

export const MERGE_FIELDS: Record<DocType, FieldDef[]> = {
  quote: [
    { key: 'quote_number', label: 'Quote Number', sample: 'Q-2026-0142', group: 'Document' },
    { key: 'quotation_date', label: 'Quotation Date', sample: '17 August 2026', group: 'Document' },
    { key: 'valid_until', label: 'Valid Until', sample: '30 September 2026', group: 'Document' },
    { key: 'sent_date', label: 'Sent Date', sample: '17 August 2026', group: 'Document' },
    { key: 'status', label: 'Status', sample: 'sent', group: 'Document' },
    { key: 'revision_number', label: 'Revision', sample: '1', group: 'Document' },
    { key: 'sales_person', label: 'Sales Person', sample: 'Priya Sharma', group: 'Document' },
    { key: 'terms', label: 'Terms & Conditions', sample: 'Prices are exclusive of installation.', group: 'Document' },
    { key: 'payment_terms', label: 'Payment Terms', sample: '50% advance, balance on delivery.', group: 'Document' },
    ...CUSTOMER_FIELDS,
    ...COMPANY_FIELDS,
    ...TOTAL_FIELDS,
  ],
  invoice: [
    { key: 'invoice_number', label: 'Invoice Number', sample: 'INV-2026-0087', group: 'Document' },
    { key: 'issued_date', label: 'Issued Date', sample: '17 August 2026', group: 'Document' },
    { key: 'due_date', label: 'Due Date', sample: '5 September 2026', group: 'Document' },
    { key: 'status', label: 'Status', sample: 'pending', group: 'Document' },
    { key: 'quote_number', label: 'From Quote', sample: 'Q-2026-0142', group: 'Document' },
    { key: 'amount_paid', label: 'Amount Paid', sample: '₹28,200.00', group: 'Document' },
    { key: 'amount_due', label: 'Amount Due', sample: '₹18,500.00', group: 'Document' },
    { key: 'terms', label: 'Terms & Conditions', sample: 'Goods once sold will not be taken back.', group: 'Document' },
    { key: 'payment_terms', label: 'Payment Terms', sample: 'Due within 15 days.', group: 'Document' },
    ...CUSTOMER_FIELDS,
    ...COMPANY_FIELDS,
    ...TOTAL_FIELDS,
  ],
  task: [
    { key: 'task_title', label: 'Task Title', sample: 'Follow up with Acme on renewal', group: 'Document' },
    { key: 'task_type', label: 'Type', sample: 'call', group: 'Document' },
    { key: 'assignee_name', label: 'Assignee Name', sample: 'Priya Sharma', group: 'Document' },
    { key: 'due_date', label: 'Due Date', sample: '20 August 2026', group: 'Document' },
    { key: 'due_time', label: 'Due Time', sample: '11:00', group: 'Document' },
    { key: 'priority', label: 'Priority', sample: 'high', group: 'Document' },
    { key: 'status', label: 'Status', sample: 'pending', group: 'Document' },
    { key: 'related_to', label: 'Related To', sample: 'Acme Retail Pvt Ltd', group: 'Document' },
    { key: 'description', label: 'Description', sample: 'Confirm renewal terms before the quote expires.', group: 'Document' },
    ...COMPANY_FIELDS,
  ],
  meeting: [
    { key: 'meeting_title', label: 'Meeting Title', sample: 'Quarterly Review — Acme', group: 'Document' },
    { key: 'client_name', label: 'Client', sample: 'Acme Retail Pvt Ltd', group: 'Document' },
    { key: 'date', label: 'Date', sample: 'Thursday, 20 August 2026', group: 'Document' },
    { key: 'time', label: 'Time', sample: '3:00 PM', group: 'Document' },
    { key: 'duration', label: 'Duration', sample: '30 min', group: 'Document' },
    { key: 'meeting_type', label: 'Type', sample: 'video', group: 'Document' },
    { key: 'status', label: 'Status', sample: 'scheduled', group: 'Document' },
    { key: 'assignee_name', label: 'Organiser', sample: 'Priya Sharma', group: 'Document' },
    { key: 'customer_email', label: 'Attendee Email', sample: 'buyer@acme.example', group: 'Document' },
    { key: 'meet_link', label: 'Google Meet Link', sample: 'https://meet.google.com/abc-defg-hij', group: 'Document' },
    { key: 'notes', label: 'Notes', sample: 'Bring the updated renewal proposal.', group: 'Document' },
    ...COMPANY_FIELDS,
  ],
};

export const MERGE_LISTS: Record<DocType, ListDef[]> = {
  quote: [ITEM_LIST, TAX_LIST],
  invoice: [ITEM_LIST, TAX_LIST],
  task: [],
  meeting: [],
};

export const getSampleData = (docType: DocType): Record<string, unknown> => {
  const fields = MERGE_FIELDS[docType] || [];
  const data: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.sample]));
  for (const list of MERGE_LISTS[docType] || []) data[list.key] = list.sample;
  return data;
};
