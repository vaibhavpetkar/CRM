import type { ImportExportChildTable, ImportExportField } from './types';
import { CONFIGURATION_OPTIONS, LEAD_SOURCE_OPTIONS, LEAD_STATUS_VALUES, PROPERTY_TYPE_OPTIONS } from '../lead-options';

// Each list defines exactly the columns that matter for that module.
// To add import/export to another form (Deals, Quotes, Meetings, Tasks, ...),
// add a new `..._FIELDS` array here that mirrors that form's `emptyForm`,
// then drop <ImportExportButtons config={{ ... fields: MY_FIELDS ... }} /> on the page.

export const LEAD_FIELDS: ImportExportField[] = [
  // A single "Name" column ("Sonal A Dabhade") is split into first and last name on import.
  { key: 'name', label: 'Name', type: 'text', defaultExport: false, aliases: ['Full Name', 'Customer Name', 'Client Name', 'Lead Name', 'Buyer Name'] },
  { key: 'firstName', label: 'First Name', type: 'text' },
  { key: 'lastName', label: 'Last Name', type: 'text' },
  // "9822675337/ 9175444667": the second number goes to Alternate Mobile.
  { key: 'mobile', label: 'Mobile', required: true, type: 'mobile', splitInto: 'alternateMobile', aliases: ['Mobile No', 'Mobile Number', 'Phone No', 'Contact No', 'Contact Number', 'Number'] },
  { key: 'alternateMobile', label: 'Alternate Mobile', type: 'mobile', aliases: ['Alternate Number', 'Alt Mobile', 'Mobile 2', 'Other Number'] },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'text', defaultExport: false },
  { key: 'assignedTo', label: 'Sales Person', type: 'text', aliases: ['Executive Name', 'Executive', 'Sales Executive', 'Assigned To', 'Lead Owner', 'Owner', 'Handled By'] },
  { key: 'configuration', label: 'Requirement', type: 'select', options: CONFIGURATION_OPTIONS, aliases: ['Configuration', 'BHK', 'Flat Type', 'Unit Type'] },
  { key: 'propertyType', label: 'Property Type', type: 'select', options: PROPERTY_TYPE_OPTIONS },
  { key: 'projectName', label: 'Project', type: 'text', aliases: ['Project Name'] },
  { key: 'preferredLocation', label: 'Preferred Location', type: 'text', aliases: ['Location', 'Area'] },
  { key: 'budgetMin', label: 'Budget Min', type: 'number' },
  { key: 'budgetMax', label: 'Budget Max', type: 'number', aliases: ['Budget'] },
  { key: 'leadSource', label: 'Lead Source', type: 'select', options: LEAD_SOURCE_OPTIONS.map((o) => o.value), aliases: ['Source'] },
  { key: 'subSource', label: 'Sub Source', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: LEAD_STATUS_VALUES, aliases: ['Lead Status'] },
  // A date here means the visit happened: the lead shows on the Site Visits page.
  { key: 'siteVisitDate', label: 'Site Visit Date', type: 'date', defaultExport: false, aliases: ['Visit Date', 'SV Date', 'Site Visit Done Date'] },
  { key: 'date', label: 'Lead Date', type: 'date', defaultExport: false },
  { key: 'nextFollowUp', label: 'Next Follow Up', type: 'date', defaultExport: false, aliases: ['Follow Up Date'] },
  { key: 'company', label: 'Company', type: 'text', defaultExport: false },
  { key: 'jobTitle', label: 'Job Title', type: 'text', defaultExport: false },
  { key: 'industry', label: 'Industry', type: 'text', defaultExport: false },
  { key: 'territory', label: 'Territory', type: 'text', defaultExport: false },
  { key: 'noOfEmployees', label: 'No. of Employees', type: 'number', defaultExport: false },
  { key: 'annualRevenue', label: 'Annual Revenue', type: 'number', defaultExport: false },
  { key: 'rating', label: 'Rating', type: 'text', defaultExport: false },
  { key: 'website', label: 'Website', type: 'text', defaultExport: false },
  { key: 'country', label: 'Country', type: 'text', defaultExport: false },
  { key: 'state', label: 'State', type: 'text', defaultExport: false },
  { key: 'city', label: 'City', type: 'text', defaultExport: false },
  { key: 'street', label: 'Street', type: 'text', defaultExport: false },
  { key: 'zipCode', label: 'Zip Code', type: 'text', defaultExport: false },
  { key: 'score', label: 'Score', type: 'number', defaultExport: false },
  { key: 'value', label: 'Value', type: 'number', defaultExport: false },
  { key: 'leadNumber', label: 'Lead No', type: 'text', exportOnly: true },
  { key: 'createdAt', label: 'Created On', type: 'date', exportOnly: true },
  // "31/10/26- CNR (SS) 01/11/26- BUSY (SS) ..." -> one dated note each; the last sets status and sales person.
  {
    key: 'notes',
    label: 'Notes',
    type: 'text',
    aliases: ['Call Notes', 'Remark', 'Remarks', 'Call Remark', 'Call Remarks', 'Call Status', 'Calling Status', 'Feedback', 'Follow Up', 'Follow Ups', 'Call History', 'Note History', 'Comments'],
  },
];

export const CONTACT_FIELDS: ImportExportField[] = [
  { key: 'firstName', label: 'First Name', required: true, type: 'text' },
  { key: 'lastName', label: 'Last Name', required: true, type: 'text' },
  { key: 'email', label: 'Email', required: true, type: 'email' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'title', label: 'Job Title', type: 'text' },
  { key: 'leadSource', label: 'Lead Source', type: 'select', options: ['website', 'facebook', 'instagram', 'linkedin', 'referral', 'event', 'social-media', 'cold-call', 'email', 'other'] },
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
  { key: 'discountType', label: 'Discount Type', type: 'select', options: ['percentage', 'flat'], strict: true, defaultExport: false },
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
