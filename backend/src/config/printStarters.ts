import { DocType, TemplatePurpose } from './documentTemplateFields';

// Built-in layouts, written in the same {{field}} syntax users edit. They are
// both the fallback print format (when no default print template exists for a
// document type) and the starting point offered by "New Template", so what
// someone customises always begins from what they were already printing.

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 13px; margin: 0; }
  .doc { padding: 8px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 24px; }
  .header h1 { margin: 0 0 4px; color: #168eea; font-size: 26px; }
  .logo { max-height: 60px; max-width: 200px; margin-bottom: 8px; }
  .meta { text-align: right; color: #475569; line-height: 1.6; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
  .parties > div { width: 48%; line-height: 1.5; }
  .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 4px; font-weight: bold; }
  .pre { white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; }
  .items th { background: #168eea; color: #fff; text-align: left; padding: 8px; font-size: 12px; }
  .items td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .num { text-align: right; }
  .totals { width: 320px; margin: 16px 0 0 auto; }
  .totals td { padding: 5px 8px; }
  .grand td { font-weight: bold; font-size: 15px; border-top: 2px solid #168eea; }
  .words { margin-top: 6px; text-align: right; font-style: italic; color: #475569; }
  .terms { margin-top: 28px; color: #475569; font-size: 12px; }
  .sign { margin-top: 48px; display: flex; justify-content: flex-end; }
  .sign div { border-top: 1px solid #94a3b8; padding-top: 6px; width: 220px; text-align: center; color: #475569; }
  .details td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  .details td:first-child { width: 30%; color: #64748b; font-weight: bold; }
`;

const itemsBlock = `
  <table class="items">
    <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>
      {{#items}}<tr><td>{{index}}</td><td>{{item_name}}</td><td class="num">{{quantity}}</td><td>{{unit}}</td><td class="num">{{rate}}</td><td class="num">{{amount}}</td></tr>{{/items}}
      {{^items}}<tr><td colspan="6" style="text-align:center;color:#94a3b8">No items</td></tr>{{/items}}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">{{subtotal}}</td></tr>
    {{#discount_amount}}<tr><td>{{discount_label}}</td><td class="num">- {{discount_amount}}</td></tr>{{/discount_amount}}
    {{#shipping_charges}}<tr><td>Shipping</td><td class="num">{{shipping_charges}}</td></tr>{{/shipping_charges}}
    {{#taxes}}<tr><td>{{tax_name}} ({{tax_percentage}}%)</td><td class="num">{{tax_amount}}</td></tr>{{/taxes}}
    <tr class="grand"><td>Grand Total</td><td class="num">{{total_amount}}</td></tr>
  </table>
  {{#amount_in_words}}<div class="words">{{amount_in_words}}</div>{{/amount_in_words}}
`;

const partiesBlock = (toLabel: string) => `
  <div class="parties">
    <div>
      <p class="label">From</p>
      <strong>{{company_name}}</strong>
      {{#company_address}}<div class="pre">{{company_address}}</div>{{/company_address}}
      {{#company_phone}}<div>{{company_phone}}</div>{{/company_phone}}
      {{#company_email}}<div>{{company_email}}</div>{{/company_email}}
    </div>
    <div>
      <p class="label">${toLabel}</p>
      <strong>{{client_name}}</strong>
      {{#customer_address}}<div class="pre">{{customer_address}}</div>{{/customer_address}}
      {{#customer_email}}<div>{{customer_email}}</div>{{/customer_email}}
      {{#customer_phone}}<div>{{customer_phone}}</div>{{/customer_phone}}
    </div>
  </div>
`;

const termsBlock = `
  {{#payment_terms}}<div class="terms"><p class="label">Payment Terms</p><div class="pre">{{payment_terms}}</div></div>{{/payment_terms}}
  {{#terms}}<div class="terms"><p class="label">Terms &amp; Conditions</p><div class="pre">{{terms}}</div></div>{{/terms}}
  <div class="sign"><div>Authorised Signatory<br/>{{company_name}}</div></div>
`;

const wrap = (body: string) => `<style>${BASE_CSS}</style>\n<div class="doc">${body}\n</div>`;

const PRINT_STARTERS: Record<DocType, string> = {
  quote: wrap(`
  <div class="header">
    <div>
      {{#company_logo}}<img class="logo" src="{{company_logo}}" alt="" />{{/company_logo}}
      <h1>Quotation</h1>
      <div>{{quote_number}}</div>
    </div>
    <div class="meta">
      <div>Date: {{quotation_date}}</div>
      {{#valid_until}}<div>Valid Until: {{valid_until}}</div>{{/valid_until}}
      {{#sales_person}}<div>Sales Person: {{sales_person}}</div>{{/sales_person}}
      <span class="badge">{{status}}</span>
    </div>
  </div>
  ${partiesBlock('Bill To')}
  ${itemsBlock}
  ${termsBlock}`),
  invoice: wrap(`
  <div class="header">
    <div>
      {{#company_logo}}<img class="logo" src="{{company_logo}}" alt="" />{{/company_logo}}
      <h1>Invoice</h1>
      <div>{{invoice_number}}</div>
    </div>
    <div class="meta">
      {{#issued_date}}<div>Date: {{issued_date}}</div>{{/issued_date}}
      {{#due_date}}<div>Due Date: {{due_date}}</div>{{/due_date}}
      {{#quote_number}}<div>Quote Ref: {{quote_number}}</div>{{/quote_number}}
      <span class="badge">{{status}}</span>
    </div>
  </div>
  ${partiesBlock('Bill To')}
  ${itemsBlock}
  <table class="totals">
    <tr><td>Amount Paid</td><td class="num">{{amount_paid}}</td></tr>
    <tr class="grand"><td>Amount Due</td><td class="num">{{amount_due}}</td></tr>
  </table>
  ${termsBlock}`),
  task: wrap(`
  <div class="header">
    <div><h1>Task</h1><div>{{company_name}}</div></div>
    <div class="meta"><div>Printed: {{print_date}}</div><span class="badge">{{status}}</span></div>
  </div>
  <table class="details">
    <tr><td>Title</td><td>{{task_title}}</td></tr>
    <tr><td>Type</td><td>{{task_type}}</td></tr>
    <tr><td>Priority</td><td>{{priority}}</td></tr>
    <tr><td>Due</td><td>{{due_date}} {{due_time}}</td></tr>
    <tr><td>Assigned To</td><td>{{assignee_name}}</td></tr>
    <tr><td>Related To</td><td>{{related_to}}</td></tr>
    <tr><td>Description</td><td class="pre">{{description}}</td></tr>
  </table>`),
  meeting: wrap(`
  <div class="header">
    <div><h1>Meeting</h1><div>{{company_name}}</div></div>
    <div class="meta"><div>Printed: {{print_date}}</div><span class="badge">{{status}}</span></div>
  </div>
  <table class="details">
    <tr><td>Title</td><td>{{meeting_title}}</td></tr>
    <tr><td>Client</td><td>{{client_name}}</td></tr>
    <tr><td>When</td><td>{{date}} {{time}}</td></tr>
    <tr><td>Duration</td><td>{{duration}}</td></tr>
    <tr><td>Type</td><td>{{meeting_type}}</td></tr>
    <tr><td>Organiser</td><td>{{assignee_name}}</td></tr>
    <tr><td>Attendee</td><td>{{customer_email}}</td></tr>
    <tr><td>Meeting Link</td><td>{{meet_link}}</td></tr>
    <tr><td>Notes</td><td class="pre">{{notes}}</td></tr>
  </table>`),
};

const EMAIL_STARTERS: Record<DocType, { subject: string; html: string }> = {
  quote: {
    subject: 'Quotation {{quote_number}} from {{company_name}}',
    html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
  <p>Hi {{client_name}},</p>
  <p>Please find attached <strong>{{quote_number}}</strong> for your review.</p>
  <p>Total: <strong>{{total_amount}}</strong><br/>
  Valid until: {{valid_until}}</p>
  <p>Thanks,<br/>{{company_name}}</p>
</div>`,
  },
  invoice: {
    subject: 'Invoice {{invoice_number}} from {{company_name}}',
    html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
  <p>Hi {{client_name}},</p>
  <p>Please find attached invoice <strong>{{invoice_number}}</strong>.</p>
  <p>Amount due: <strong>{{amount_due}}</strong><br/>
  Due date: {{due_date}}</p>
  <p>Thanks,<br/>{{company_name}}</p>
</div>`,
  },
  task: {
    subject: 'Task: {{task_title}}',
    html: `<p>Hi {{assignee_name}},</p>\n<p>You have a task due on {{due_date}}: <strong>{{task_title}}</strong>.</p>\n<p>{{description}}</p>`,
  },
  meeting: {
    subject: 'Meeting: {{meeting_title}} on {{date}}',
    html: `<p>Hi,</p>\n<p>This is to confirm <strong>{{meeting_title}}</strong> on {{date}} at {{time}} ({{duration}}).</p>\n{{#meet_link}}<p>Join: <a href="{{meet_link}}">{{meet_link}}</a></p>{{/meet_link}}\n<p>{{notes}}</p>`,
  },
};

export const getStarter = (docType: DocType, purpose: TemplatePurpose): { subject: string; htmlBody: string } =>
  purpose === 'print'
    ? { subject: '', htmlBody: PRINT_STARTERS[docType] }
    : { subject: EMAIL_STARTERS[docType].subject, htmlBody: EMAIL_STARTERS[docType].html };

export const getBuiltInPrintTemplate = (docType: DocType): string => PRINT_STARTERS[docType];
