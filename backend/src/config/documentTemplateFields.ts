// Single source of truth for what {{field}} placeholders exist per document
// type — used both by the template editor's field picker/preview and by the
// real render at send-time (QuoteService.sendEmail today; the same
// renderTemplate() utility is ready for other doc types to adopt whenever
// their own send flow gets built).
export type DocType = 'quote' | 'invoice' | 'task' | 'meeting';

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'quote', label: 'Quote' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
];

interface FieldDef {
  key: string; // used as {{key}}
  label: string;
  sample: string;
}

export const MERGE_FIELDS: Record<DocType, FieldDef[]> = {
  quote: [
    { key: 'quote_number', label: 'Quote Number', sample: 'Q-2026-0142' },
    { key: 'client_name', label: 'Client Name', sample: 'Acme Retail Pvt Ltd' },
    { key: 'customer_email', label: 'Customer Email', sample: 'buyer@acme.example' },
    { key: 'company_name', label: 'Your Company Name', sample: 'Your Company' },
    { key: 'total_amount', label: 'Total Amount', sample: '₹48,500.00' },
    { key: 'valid_until', label: 'Valid Until', sample: '30 September 2026' },
    { key: 'sent_date', label: 'Sent Date', sample: '17 August 2026' },
    { key: 'status', label: 'Status', sample: 'sent' },
  ],
  invoice: [
    { key: 'invoice_number', label: 'Invoice Number', sample: 'INV-2026-0087' },
    { key: 'client_name', label: 'Client Name', sample: 'Acme Retail Pvt Ltd' },
    { key: 'customer_email', label: 'Customer Email', sample: 'buyer@acme.example' },
    { key: 'company_name', label: 'Your Company Name', sample: 'Your Company' },
    { key: 'total_amount', label: 'Total Amount', sample: '₹48,500.00' },
    { key: 'amount_due', label: 'Amount Due', sample: '₹18,500.00' },
    { key: 'due_date', label: 'Due Date', sample: '5 September 2026' },
    { key: 'status', label: 'Status', sample: 'partially_paid' },
  ],
  task: [
    { key: 'task_title', label: 'Task Title', sample: 'Follow up with Acme on renewal' },
    { key: 'assignee_name', label: 'Assignee Name', sample: 'Priya Sharma' },
    { key: 'due_date', label: 'Due Date', sample: '20 August 2026' },
    { key: 'priority', label: 'Priority', sample: 'high' },
    { key: 'description', label: 'Description', sample: 'Confirm renewal terms before the quote expires.' },
  ],
  meeting: [
    { key: 'meeting_title', label: 'Meeting Title', sample: 'Quarterly Review — Acme' },
    { key: 'date', label: 'Date', sample: 'Thursday, 20 August 2026' },
    { key: 'time', label: 'Time', sample: '3:00 PM' },
    { key: 'duration', label: 'Duration', sample: '30 min' },
    { key: 'meet_link', label: 'Google Meet Link', sample: 'https://meet.google.com/abc-defg-hij' },
    { key: 'notes', label: 'Notes', sample: 'Bring the updated renewal proposal.' },
  ],
};

export const getSampleData = (docType: DocType): Record<string, string> => {
  const fields = MERGE_FIELDS[docType] || [];
  return Object.fromEntries(fields.map((f) => [f.key, f.sample]));
};
