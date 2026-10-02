// Drag-and-drop print format builder: the layout model, the defaults every
// block starts with, and layoutToHtml(), which turns a layout into the same
// {{field}} HTML template the server prints with. The layout is saved next to
// the generated HTML (DocumentTemplate.layout) so the design can be reopened;
// printing only ever uses the generated HTML.

import { escapeHtml } from '@/lib/template-render';

export type BlockType =
  | 'heading'
  | 'text'
  | 'field'
  | 'image'
  | 'company'
  | 'customer'
  | 'docMeta'
  | 'items'
  | 'totals'
  | 'details'
  | 'terms'
  | 'signature'
  | 'divider'
  | 'spacer'
  | 'pageBreak'
  | 'html';

export interface BlockStyle {
  width: 100 | 75 | 66 | 50 | 33 | 25;
  align: 'left' | 'center' | 'right';
  fontSize: number; // px
  color: string;
  background: string;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  paddingY: number; // px
  paddingX: number; // px
  marginTop: number; // px
  borderWidth: number; // px
  borderColor: string;
  borderRadius: number; // px
}

export interface ItemColumn {
  key: string;
  label: string;
  visible: boolean;
  align: 'left' | 'center' | 'right';
  width: number; // %, 0 = auto
}

export interface Block {
  id: string;
  type: BlockType;
  style: BlockStyle;
  // Content props; which ones apply depends on the type.
  text?: string; // heading/text/signature/html
  level?: 1 | 2 | 3; // heading
  label?: string; // field/details title/customer title
  fieldKey?: string; // field
  src?: string; // image: url, data URI or {{company_logo}}
  imageHeight?: number; // image
  show?: Record<string, boolean>; // company/customer/totals/terms toggles
  fields?: { key: string; label: string }[]; // docMeta/details rows
  columns?: ItemColumn[]; // items
  headerBackground?: string; // items
  headerColor?: string; // items
  striped?: boolean; // items
  gridLines?: boolean; // items
  dividerStyle?: 'solid' | 'dashed' | 'dotted'; // divider
  height?: number; // spacer / divider thickness
}

export interface PageSettings {
  size: 'A4' | 'A5' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  accentColor: string;
  watermark: string; // supports {{fields}}, e.g. {{status}}
  borderAroundPage: boolean;
}

export interface PrintLayout {
  version: 1;
  page: PageSettings;
  blocks: Block[];
}

export const PAGE_SIZES_MM: Record<PageSettings['size'], [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [216, 279],
  Legal: [216, 356],
};

export const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
];

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  marginMm: 14,
  fontFamily: FONT_FAMILIES[0].value,
  fontSize: 13,
  textColor: '#1e293b',
  accentColor: '#168eea',
  watermark: '',
  borderAroundPage: false,
};

const baseStyle = (over: Partial<BlockStyle> = {}): BlockStyle => ({
  width: 100,
  align: 'left',
  fontSize: 0, // 0 = inherit page font size
  color: '',
  background: '',
  bold: false,
  italic: false,
  uppercase: false,
  paddingY: 4,
  paddingX: 0,
  marginTop: 0,
  borderWidth: 0,
  borderColor: '#e2e8f0',
  borderRadius: 0,
  ...over,
});

const uid = () => Math.random().toString(36).slice(2, 10);

export const BLOCK_LIBRARY: { type: BlockType; label: string; hint: string; docTypes?: string[] }[] = [
  { type: 'heading', label: 'Heading', hint: 'Title such as "Quotation"' },
  { type: 'text', label: 'Text', hint: 'Paragraph, can include {{fields}}' },
  { type: 'field', label: 'Single Field', hint: 'Label and one value' },
  { type: 'image', label: 'Image / Logo', hint: 'Upload, URL or company logo' },
  { type: 'company', label: 'Company Details', hint: 'Your name, address, contacts' },
  { type: 'customer', label: 'Customer Details', hint: 'Bill-to block', docTypes: ['quote', 'invoice'] },
  { type: 'docMeta', label: 'Document Info', hint: 'Number, dates, status' },
  { type: 'items', label: 'Items Table', hint: 'Child table of line items', docTypes: ['quote', 'invoice'] },
  { type: 'totals', label: 'Totals', hint: 'Subtotal, taxes, grand total', docTypes: ['quote', 'invoice'] },
  { type: 'details', label: 'Details Table', hint: 'Label / value rows' },
  { type: 'terms', label: 'Terms', hint: 'Payment terms and T&C', docTypes: ['quote', 'invoice'] },
  { type: 'signature', label: 'Signature', hint: 'Signatory line' },
  { type: 'divider', label: 'Divider', hint: 'Horizontal line' },
  { type: 'spacer', label: 'Spacer', hint: 'Empty vertical space' },
  { type: 'pageBreak', label: 'Page Break', hint: 'Start a new page' },
  { type: 'html', label: 'Custom HTML', hint: 'Anything else' },
];

const ITEM_COLUMNS: ItemColumn[] = [
  { key: 'index', label: '#', visible: true, align: 'left', width: 6 },
  { key: 'item_name', label: 'Item', visible: true, align: 'left', width: 0 },
  { key: 'quantity', label: 'Qty', visible: true, align: 'right', width: 10 },
  { key: 'unit', label: 'Unit', visible: true, align: 'left', width: 10 },
  { key: 'rate', label: 'Rate', visible: true, align: 'right', width: 16 },
  { key: 'amount', label: 'Amount', visible: true, align: 'right', width: 18 },
];

const META_FIELDS: Record<string, { key: string; label: string }[]> = {
  quote: [
    { key: 'quote_number', label: 'Quote No.' },
    { key: 'quotation_date', label: 'Date' },
    { key: 'valid_until', label: 'Valid Until' },
    { key: 'sales_person', label: 'Sales Person' },
  ],
  invoice: [
    { key: 'invoice_number', label: 'Invoice No.' },
    { key: 'issued_date', label: 'Date' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'quote_number', label: 'Quote Ref' },
  ],
  task: [
    { key: 'due_date', label: 'Due' },
    { key: 'print_date', label: 'Printed' },
  ],
  meeting: [
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
  ],
};

const DETAIL_FIELDS: Record<string, { key: string; label: string }[]> = {
  quote: [
    { key: 'client_name', label: 'Client' },
    { key: 'customer_email', label: 'Email' },
    { key: 'customer_phone', label: 'Phone' },
  ],
  invoice: [
    { key: 'client_name', label: 'Client' },
    { key: 'amount_paid', label: 'Amount Paid' },
    { key: 'amount_due', label: 'Amount Due' },
  ],
  task: [
    { key: 'task_title', label: 'Title' },
    { key: 'task_type', label: 'Type' },
    { key: 'priority', label: 'Priority' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'due_time', label: 'Due Time' },
    { key: 'assignee_name', label: 'Assigned To' },
    { key: 'related_to', label: 'Related To' },
    { key: 'description', label: 'Description' },
  ],
  meeting: [
    { key: 'meeting_title', label: 'Title' },
    { key: 'client_name', label: 'Client' },
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
    { key: 'duration', label: 'Duration' },
    { key: 'meeting_type', label: 'Type' },
    { key: 'assignee_name', label: 'Organiser' },
    { key: 'customer_email', label: 'Attendee' },
    { key: 'meet_link', label: 'Meeting Link' },
    { key: 'notes', label: 'Notes' },
  ],
};

const DOC_TITLES: Record<string, string> = { quote: 'Quotation', invoice: 'Invoice', task: 'Task', meeting: 'Meeting' };

export function createBlock(type: BlockType, docType: string): Block {
  const block: Block = { id: uid(), type, style: baseStyle() };
  switch (type) {
    case 'heading':
      return { ...block, text: DOC_TITLES[docType] || 'Title', level: 1, style: baseStyle({ fontSize: 26, bold: true, color: '{{accent}}' }) };
    case 'text':
      return { ...block, text: 'Thank you for your business, {{client_name}}.' };
    case 'field':
      return { ...block, label: 'Status', fieldKey: 'status' };
    case 'image':
      return { ...block, src: '{{company_logo}}', imageHeight: 60 };
    case 'company':
      return { ...block, label: 'From', show: { title: true, name: true, address: true, phone: true, email: true, website: false } };
    case 'customer':
      return { ...block, label: 'Bill To', show: { title: true, name: true, address: true, email: true, phone: true } };
    case 'docMeta':
      return { ...block, fields: META_FIELDS[docType] || [], style: baseStyle({ align: 'right' }), show: { status: true } };
    case 'items':
      return { ...block, columns: ITEM_COLUMNS.map((c) => ({ ...c })), headerBackground: '{{accent}}', headerColor: '#ffffff', striped: false, gridLines: false, style: baseStyle({ marginTop: 12 }) };
    case 'totals':
      return {
        ...block,
        style: baseStyle({ width: 50, marginTop: 8 }),
        show: { subtotal: true, discount: true, shipping: true, taxes: true, taxTotal: false, grandTotal: true, words: true, paid: docType === 'invoice', due: docType === 'invoice' },
      };
    case 'details':
      return { ...block, label: '', fields: DETAIL_FIELDS[docType] || [] };
    case 'terms':
      return { ...block, show: { payment: true, terms: true }, style: baseStyle({ marginTop: 20, fontSize: 12, color: '#475569' }) };
    case 'signature':
      return { ...block, text: 'Authorised Signatory', label: '{{company_name}}', style: baseStyle({ width: 33, align: 'center', marginTop: 40 }) };
    case 'divider':
      return { ...block, height: 1, dividerStyle: 'solid', style: baseStyle({ color: '#cbd5e1', paddingY: 8 }) };
    case 'spacer':
      return { ...block, height: 24, style: baseStyle({ paddingY: 0 }) };
    case 'pageBreak':
      return block;
    case 'html':
      return { ...block, text: '<p>Custom content with {{fields}}</p>' };
  }
}

/** A sensible starting design per document type, close to the standard layout. */
export function defaultLayout(docType: string): PrintLayout {
  const b = (type: BlockType, patch: Partial<Block> = {}, style: Partial<BlockStyle> = {}) => {
    const block = createBlock(type, docType);
    return { ...block, ...patch, style: { ...block.style, ...style } };
  };
  const commercial = docType === 'quote' || docType === 'invoice';
  const blocks: Block[] = commercial
    ? [
        b('image', {}, { width: 50 }),
        b('docMeta', {}, { width: 50 }),
        b('heading'),
        b('company', {}, { width: 50, marginTop: 12 }),
        b('customer', {}, { width: 50, marginTop: 12 }),
        b('items'),
        b('spacer', {}, { width: 50 }),
        b('totals'),
        b('terms'),
        b('spacer', {}, { width: 66 }),
        b('signature'),
      ]
    : [b('heading', {}, { width: 50 }), b('docMeta', {}, { width: 50 }), b('divider'), b('details')];
  return { version: 1, page: { ...DEFAULT_PAGE }, blocks };
}

// ─── HTML generation ───────────────────────────────────────────────────────

const attr = (v: string) => v.replace(/"/g, '&quot;');
const accentize = (v: string | undefined, page: PageSettings) => (v || '').replace(/\{\{accent\}\}/g, page.accentColor);

/** Escapes user-typed text but keeps {{field}} tokens so the server fills them in. */
const textWithFields = (text: string) => escapeHtml(text || '').replace(/\n/g, '<br/>');

const styleOf = (s: BlockStyle, page: PageSettings) => {
  const parts = [
    `text-align:${s.align}`,
    `padding:${s.paddingY}px ${s.paddingX}px`,
    s.marginTop ? `margin-top:${s.marginTop}px` : '',
    s.fontSize ? `font-size:${s.fontSize}px` : '',
    s.color ? `color:${accentize(s.color, page)}` : '',
    s.background ? `background:${accentize(s.background, page)}` : '',
    s.bold ? 'font-weight:bold' : '',
    s.italic ? 'font-style:italic' : '',
    s.uppercase ? 'text-transform:uppercase;letter-spacing:.03em' : '',
    s.borderWidth ? `border:${s.borderWidth}px solid ${accentize(s.borderColor, page)}` : '',
    s.borderRadius ? `border-radius:${s.borderRadius}px` : '',
  ];
  return parts.filter(Boolean).join(';');
};

const optionalLine = (key: string, inner: string) => `{{#${key}}}${inner}{{/${key}}}`;

function blockInner(block: Block, page: PageSettings, docType: string): string {
  const show = block.show || {};
  const titleStyle = `font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-weight:bold;margin:0 0 4px`;
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level || 1}`;
      return `<${tag} style="margin:0;font-size:inherit">${textWithFields(block.text || '')}</${tag}>`;
    }
    case 'text':
      return `<div>${textWithFields(block.text || '')}</div>`;
    case 'field':
      return `${block.label ? `<span style="color:#64748b">${escapeHtml(block.label)}:</span> ` : ''}{{${block.fieldKey || 'status'}}}`;
    case 'image': {
      const src = (block.src || '').trim();
      if (!src) return '';
      const img = `<img src="${attr(src)}" alt="" style="max-height:${block.imageHeight || 60}px;max-width:100%" />`;
      return src === '{{company_logo}}' ? optionalLine('company_logo', img) : img;
    }
    case 'company':
      return [
        show.title && block.label ? `<p style="${titleStyle}">${escapeHtml(block.label)}</p>` : '',
        show.name ? '<div style="font-weight:bold">{{company_name}}</div>' : '',
        show.address ? optionalLine('company_address', '<div style="white-space:pre-line">{{company_address}}</div>') : '',
        show.phone ? optionalLine('company_phone', '<div>{{company_phone}}</div>') : '',
        show.email ? optionalLine('company_email', '<div>{{company_email}}</div>') : '',
        show.website ? optionalLine('company_website', '<div>{{company_website}}</div>') : '',
      ].join('');
    case 'customer':
      return [
        show.title && block.label ? `<p style="${titleStyle}">${escapeHtml(block.label)}</p>` : '',
        show.name ? '<div style="font-weight:bold">{{client_name}}</div>' : '',
        show.address ? optionalLine('customer_address', '<div style="white-space:pre-line">{{customer_address}}</div>') : '',
        show.email ? optionalLine('customer_email', '<div>{{customer_email}}</div>') : '',
        show.phone ? optionalLine('customer_phone', '<div>{{customer_phone}}</div>') : '',
      ].join('');
    case 'docMeta':
      return [
        ...(block.fields || []).map((f) => optionalLine(f.key, `<div>${escapeHtml(f.label)}${f.label ? ': ' : ''}{{${f.key}}}</div>`)),
        show.status
          ? `<div style="margin-top:4px"><span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:bold;text-transform:uppercase">{{status}}</span></div>`
          : '',
      ].join('');
    case 'items': {
      const cols = (block.columns || []).filter((c) => c.visible);
      const headBg = accentize(block.headerBackground || page.accentColor, page);
      const grid = block.gridLines ? 'border:1px solid #cbd5e1;' : 'border-bottom:1px solid #e2e8f0;';
      const th = cols
        .map((c) => `<th style="background:${headBg};color:${block.headerColor || '#fff'};padding:7px 8px;text-align:${c.align};font-size:12px;${c.width ? `width:${c.width}%;` : ''}${block.gridLines ? 'border:1px solid #cbd5e1;' : ''}">${escapeHtml(c.label)}</th>`)
        .join('');
      const td = cols.map((c) => `<td style="padding:7px 8px;text-align:${c.align};vertical-align:top;${grid}">{{${c.key}}}</td>`).join('');
      // Striping needs per-row state the template language doesn't have, so it uses CSS on the generated class.
      const cls = `items-${block.id}`;
      const stripe = block.striped ? `<style>.${cls} tbody tr:nth-child(even) td{background:#f8fafc}</style>` : '';
      return `${stripe}<table class="${cls}" style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>{{#items}}<tr>${td}</tr>{{/items}}{{^items}}<tr><td colspan="${cols.length || 1}" style="padding:8px;text-align:center;color:#94a3b8">No items</td></tr>{{/items}}</tbody></table>`;
    }
    case 'totals': {
      const row = (label: string, value: string, bold = false) =>
        `<tr${bold ? ` style="font-weight:bold;font-size:1.1em"` : ''}><td style="padding:4px 8px;${bold ? `border-top:2px solid ${page.accentColor};` : ''}">${label}</td><td style="padding:4px 8px;text-align:right;${bold ? `border-top:2px solid ${page.accentColor};` : ''}">${value}</td></tr>`;
      const rows = [
        show.subtotal ? row('Subtotal', '{{subtotal}}') : '',
        show.discount ? optionalLine('discount_amount', row('{{discount_label}}', '- {{discount_amount}}')) : '',
        show.shipping ? optionalLine('shipping_charges', row('Shipping', '{{shipping_charges}}')) : '',
        show.taxes ? `{{#taxes}}${row('{{tax_name}} ({{tax_percentage}}%)', '{{tax_amount}}')}{{/taxes}}` : '',
        show.taxTotal ? row('Total Tax', '{{tax_total}}') : '',
        show.grandTotal ? row('Grand Total', '{{total_amount}}', true) : '',
        docType === 'invoice' && show.paid ? row('Amount Paid', '{{amount_paid}}') : '',
        docType === 'invoice' && show.due ? row('Amount Due', '{{amount_due}}', true) : '',
      ].join('');
      const words = show.words ? optionalLine('amount_in_words', '<div style="margin-top:4px;font-style:italic;color:#475569;text-align:right">{{amount_in_words}}</div>') : '';
      return `<table style="width:100%;border-collapse:collapse">${rows}</table>${words}`;
    }
    case 'details': {
      const rows = (block.fields || [])
        .map((f) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;width:30%;color:#64748b;font-weight:bold;vertical-align:top">${escapeHtml(f.label)}</td><td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;white-space:pre-line">{{${f.key}}}</td></tr>`)
        .join('');
      return `${block.label ? `<p style="${titleStyle}">${escapeHtml(block.label)}</p>` : ''}<table style="width:100%;border-collapse:collapse">${rows}</table>`;
    }
    case 'terms':
      return [
        show.payment ? optionalLine('payment_terms', `<p style="${titleStyle}">Payment Terms</p><div style="white-space:pre-line;margin-bottom:10px">{{payment_terms}}</div>`) : '',
        show.terms ? optionalLine('terms', `<p style="${titleStyle}">Terms &amp; Conditions</p><div style="white-space:pre-line">{{terms}}</div>`) : '',
      ].join('');
    case 'signature':
      return `<div style="border-top:1px solid #94a3b8;padding-top:6px">${textWithFields(block.text || '')}${block.label ? `<br/>${textWithFields(block.label)}` : ''}</div>`;
    case 'divider':
      return `<hr style="border:0;border-top:${block.height || 1}px ${block.dividerStyle || 'solid'} ${accentize(block.style.color, page) || '#cbd5e1'};margin:0" />`;
    case 'spacer':
      return `<div style="height:${block.height || 24}px"></div>`;
    case 'pageBreak':
      return '';
    case 'html':
      return block.text || '';
  }
}

/** One block without its width, for the builder canvas (which handles width and selection itself). */
export function blockPreviewHtml(block: Block, page: PageSettings, docType: string): string {
  if (block.type === 'pageBreak') return '';
  return `<div style="${styleOf(block.style, page)}">${blockInner(block, page, docType)}</div>`;
}

export const widthPercent = (w: BlockStyle['width']) => (w === 33 ? 33.333 : w === 66 ? 66.666 : w);

export function blockToHtml(block: Block, page: PageSettings, docType: string): string {
  if (block.type === 'pageBreak') return '<div style="flex-basis:100%;break-after:page;page-break-after:always;height:0"></div>';
  const width = widthPercent(block.style.width);
  return `<div class="pf-block" style="flex:0 0 ${width}%;max-width:${width}%;${styleOf(block.style, page)}">${blockInner(block, page, docType)}</div>`;
}

export function layoutToHtml(layout: PrintLayout, docType: string): string {
  const { page } = layout;
  const [w, h] = PAGE_SIZES_MM[page.size];
  const [pw, ph] = page.orientation === 'landscape' ? [h, w] : [w, h];
  const watermark = page.watermark.trim()
    ? `<div style="position:fixed;top:45%;left:0;right:0;text-align:center;font-size:96px;font-weight:bold;color:${page.accentColor};opacity:.08;transform:rotate(-30deg);pointer-events:none;z-index:0;text-transform:uppercase">${textWithFields(page.watermark)}</div>`
    : '';
  return `<style>
  @page { size: ${pw}mm ${ph}mm; margin: ${page.marginMm}mm; }
  .pf-page { font-family: ${page.fontFamily}; font-size: ${page.fontSize}px; color: ${page.textColor}; position: relative; ${page.borderAroundPage ? `border: 1px solid ${page.accentColor}; padding: 16px;` : ''} }
  .pf-page * { box-sizing: border-box; }
  .pf-flow { display: flex; flex-wrap: wrap; align-items: flex-start; position: relative; z-index: 1; }
  .pf-block { min-width: 0; }
  .pf-block p { margin: 0; }
</style>
<div class="pf-page">${watermark}<div class="pf-flow">
${layout.blocks.map((b) => blockToHtml(b, page, docType)).join('\n')}
</div></div>`;
}

export function parseLayout(raw: string | null | undefined): PrintLayout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.blocks)) return { version: 1, page: { ...DEFAULT_PAGE, ...parsed.page }, blocks: parsed.blocks };
  } catch {
    // fall through
  }
  return null;
}
