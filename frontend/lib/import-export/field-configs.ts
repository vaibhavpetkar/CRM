import type { ImportExportField } from './types';

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
  { key: 'status', label: 'Status', type: 'select', options: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] },
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

export const QUOTE_FIELDS: ImportExportField[] = [
  { key: 'deal', label: 'Deal', type: 'text' },
  { key: 'client', label: 'Client', required: true, type: 'text' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'accepted'] },
  { key: 'validUntil', label: 'Valid Until', type: 'date' },
];

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
