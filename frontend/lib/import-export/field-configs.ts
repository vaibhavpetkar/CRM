import type { ImportExportChildTable, ImportExportField } from './types';

// Each list defines exactly the columns that matter for that module.
// To add import/export to another form (Deals, Quotes, Meetings, Tasks, ...),
// add a new `..._FIELDS` array here that mirrors that form's `emptyForm`,
// then drop <ImportExportButtons config={{ ... fields: MY_FIELDS ... }} /> on the page.

export const LEAD_FIELDS: ImportExportField[] = [
  { key: 'firstName', label: 'First Name', required: true, type: 'text' },
  { key: 'lastName', label: 'Last Name', required: true, type: 'text' },
  { key: 'email', label: 'Email', required: true, type: 'email' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'mobile', label: 'Mobile', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'jobTitle', label: 'Job Title', type: 'text' },
  { key: 'leadSource', label: 'Lead Source', type: 'select', options: ['website', 'linkedin', 'referral', 'event', 'social-media', 'cold-call', 'email', 'other'] },
  { key: 'status', label: 'Status', type: 'select', options: ['new', 'contacted', 'working', 'qualified', 'unqualified', 'converted', 'lost'] },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'noOfEmployees', label: 'No. of Employees', type: 'number', defaultExport: false },
  { key: 'annualRevenue', label: 'Annual Revenue', type: 'number', defaultExport: false },
  { key: 'rating', label: 'Rating', type: 'text', defaultExport: false },
  { key: 'website', label: 'Website', type: 'text', defaultExport: false },
  { key: 'country', label: 'Country', type: 'text', defaultExport: false },
  { key: 'state', label: 'State', type: 'text', defaultExport: false },
  { key: 'city', label: 'City', type: 'text', defaultExport: false },
  { key: 'street', label: 'Street', type: 'text', defaultExport: false },
  { key: 'zipCode', label: 'Zip Code', type: 'text', defaultExport: false },
  { key: 'score', label: 'Score', type: 'number' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'text', defaultExport: false },
];

export const CONTACT_FIELDS: ImportExportField[] = [
  { key: 'firstName', label: 'First Name', required: true, type: 'text' },
  { key: 'lastName', label: 'Last Name', required: true, type: 'text' },
  { key: 'email', label: 'Email', required: true, type: 'email' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'title', label: 'Job Title', type: 'text' },
  { key: 'leadSource', label: 'Lead Source', type: 'select', options: ['website', 'linkedin', 'referral', 'event', 'social-media', 'cold-call', 'email', 'other'] },
];

export const DEAL_FIELDS: ImportExportField[] = [
  { key: 'title', label: 'Deal Title', required: true, type: 'text' },
  { key: 'client', label: 'Client', required: true, type: 'text' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'stage', label: 'Stage', type: 'select', options: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'] },
  { key: 'probability', label: 'Probability (%)', type: 'number' },
  { key: 'expectedClose', label: 'Expected Close', type: 'date' },
];

// Quote No ties a quote's item lines together on import. It is not reused:
// every imported quote gets a fresh number from the server. Totals and status
// are computed server-side (imports always start as drafts), so they are
// export-only.
export const QUOTE_FIELDS: ImportExportField[] = [
  { key: 'quoteNumber', label: 'Quote No', type: 'text' },
  { key: 'quotationDate', label: 'Quotation Date', type: 'date' },
  { key: 'client', label: 'Client', required: true, type: 'text' },
  { key: 'customerEmail', label: 'Customer Email', type: 'email' },
  { key: 'customerPhone', label: 'Customer Phone', type: 'text', defaultExport: false },
  { key: 'customerAddress', label: 'Customer Address', type: 'text', defaultExport: false },
  { key: 'validUntil', label: 'Valid Until', type: 'date' },
  { key: 'discountType', label: 'Discount Type', type: 'select', options: ['percentage', 'flat'], defaultExport: false },
  { key: 'discountValue', label: 'Discount Value', type: 'number', defaultExport: false },
  { key: 'shippingCharges', label: 'Shipping Charges', type: 'number', defaultExport: false },
  { key: 'terms', label: 'Terms', type: 'text', defaultExport: false },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'text', defaultExport: false },
  { key: 'amount', label: 'Amount', type: 'number', exportOnly: true },
  { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded'], exportOnly: true },
];

export const QUOTE_ITEMS_TABLE: ImportExportChildTable = {
  key: 'products',
  label: 'Items',
  fields: [
    { key: 'productName', label: 'Item Name', required: true, type: 'text' },
    { key: 'quantity', label: 'Item Quantity', type: 'number' },
    { key: 'unit', label: 'Item Unit', type: 'text' },
    { key: 'rate', label: 'Item Rate', type: 'number' },
    { key: 'amount', label: 'Item Amount', type: 'number', exportOnly: true },
  ],
};

export const MEETING_FIELDS: ImportExportField[] = [
  { key: 'title', label: 'Title', required: true, type: 'text' },
  { key: 'client', label: 'Client', type: 'text' },
  { key: 'date', label: 'Date', required: true, type: 'date' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'duration', label: 'Duration', type: 'text' },
  { key: 'type', label: 'Type', type: 'select', options: ['video', 'in-person', 'phone'] },
  { key: 'status', label: 'Status', type: 'select', options: ['scheduled', 'completed'] },
];

export const INVOICE_FIELDS: ImportExportField[] = [
  { key: 'client', label: 'Client', required: true, type: 'text' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['pending', 'paid', 'overdue'] },
  { key: 'issuedDate', label: 'Issued Date', type: 'date' },
  { key: 'dueDate', label: 'Due Date', type: 'date' },
];
