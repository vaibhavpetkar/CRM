import sequelize from '../config/database';
import { Transaction } from 'sequelize';
import Quote from '../models/Quote';
import QuoteProduct from '../models/QuoteProduct';
import QuoteTax from '../models/QuoteTax';
import Lead from '../models/Lead';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import Deal from '../models/Deal';
import Invoice from '../models/Invoice';
import Company from '../models/Company';
import Contact from '../models/Contact';
import quoteRepository from '../repositories/QuoteRepository';
import { ListQueryParams } from '../repositories/BaseRepository';
import { generateCode } from '../utils/codeGenerator';
import { logActivity, getTimeline } from './activityLogger';
import { notifyUser } from '../utils/notificationService';
import { generateDocumentPdf, PrintableDocument } from '../utils/pdfGenerator';
import { renderPrintHtml } from '../utils/printFormat';
import { sendMailWithAttachment } from '../utils/mailer';
import { sanitizeDateFields } from '../utils/sanitize';
import path from 'path';
import crypto from 'crypto';
import { NotFoundError, ConflictError, ValidationError } from '../errors/AppError';

interface ProductInput {
  itemId?: number | null;
  productName: string;
  quantity?: number;
  unit?: string;
  rate?: number;
}

interface TaxInput {
  taxId?: number | null;
  taxType: string;
  percentage?: number;
}

const serializeQuote = (quote: Quote) => {
  const plain: any = quote.toJSON ? quote.toJSON() : quote;
  const discountAmount = computeDiscountAmount(Number(plain.subtotal), plain.discountType, Number(plain.discountValue));
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
    discountAmount,
    grandTotal: plain.amount, // `amount` is the persisted grand total; exposed under both names
  };
};

const computeDiscountAmount = (subtotal: number, discountType: string, discountValue: number): number => {
  if (!discountValue) return 0;
  return discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;
};

// Used when Company.quoteMessageTemplate hasn't been configured — a sensible
// default, not a permanently hardcoded message (Settings > Company lets any
// user override this). Supports the placeholders documented on the Company
// model's quoteMessageTemplate field.
const DEFAULT_SHARE_TEMPLATE = [
  'Hi {{customerName}},',
  '',
  'We\'ve prepared your quotation {{quoteNumber}} from {{companyName}}.',
  '',
  'Quote Value: {{quoteValue}}',
  '',
  'You can review it here:',
  '{{quoteLink}}',
  '',
  'If everything looks good, we can proceed with the next step and get started.',
  '',
  '{{companySocialLinks}}',
].join('\n');

const formatShareAmount = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

// Only the social links a company has actually configured are ever included
// — never fabricated placeholder URLs (Phase 10 requirement).
const buildSocialLinksBlock = (company: any): string => {
  const entries: Array<[string, string | null | undefined]> = [
    ['Website', company?.website],
    ['Instagram', company?.instagram],
    ['Facebook', company?.facebook],
    ['LinkedIn', company?.linkedin],
    ['YouTube', company?.youtube],
    ['X/Twitter', company?.twitter],
  ];
  const present = entries.filter(([, v]) => !!v);
  if (!present.length) return '';
  return present.map(([label, v]) => `${label}: ${v}`).join('\n');
};

class QuoteService {
  async list(params: ListQueryParams) {
    const result = await quoteRepository.list(params);
    return {
      quotes: result.rows.map(serializeQuote),
      total: result.total,
      page: result.page,
      pages: result.pages,
    };
  }

  async getById(id: number | string) {
    const quote = await quoteRepository.getByIdWithDetails(id);
    if (!quote) throw new NotFoundError('Quote', id);
    const timeline = await getTimeline('Quote', quote.id);
    return { ...serializeQuote(quote), timeline };
  }

  /** Generates a new draft Quotation directly from a Lead, auto-pulling customer, address, products and taxes. */
  async createFromLead(leadId: number | string, userId?: number | null, overrides: Record<string, unknown> = {}) {
    const lead = await Lead.findByPk(leadId, { include: [{ model: LeadProduct, as: 'products' }, { model: LeadTax, as: 'taxes' }] });
    if (!lead) throw new NotFoundError('Lead', leadId);

    const leadPlain = lead.toJSON() as any;

    return this.create(
      {
        leadId: lead.id,
        client: lead.company || `${lead.firstName} ${lead.lastName}`,
        customerEmail: lead.email,
        customerPhone: lead.mobile || lead.phone,
        customerAddress: [lead.street, lead.city, lead.state, lead.country, lead.zipCode].filter(Boolean).join(', '),
        assignedToId: lead.assignedToId,
        products: (leadPlain.products || []).map((p: any) => ({
          itemId: p.itemId,
          productName: p.productName,
          quantity: p.quantity,
          unit: p.unit,
          rate: p.expectedPrice,
        })),
        taxes: (leadPlain.taxes || []).map((t: any) => ({ taxId: t.taxId, taxType: t.taxType, percentage: t.percentage })),
        ...overrides,
      },
      userId
    );
  }

  /** Generates a new draft Quotation directly from a Deal (Opportunity), auto-pulling customer/contact details. */
  async createFromDeal(dealId: number | string, userId?: number | null, overrides: Record<string, unknown> = {}) {
    const deal = await Deal.findByPk(dealId, {
      include: [
        { model: Contact, as: 'contact', required: false },
        { model: Company, as: 'account', required: false },
      ],
    });
    if (!deal) throw new NotFoundError('Deal', dealId);
    const dealPlain = deal.toJSON() as any;

    return this.create(
      {
        dealId: deal.id,
        leadId: deal.leadId,
        client: deal.client,
        // Pull the linked Contact/Company so the generated Quotation carries
        // real customer details — falls back to null (existing behavior)
        // when the Deal has no linked contact/account.
        customerEmail: dealPlain.contact?.email || dealPlain.account?.email || null,
        customerPhone: dealPlain.contact?.phone || dealPlain.account?.phone || null,
        customerAddress: dealPlain.account?.address || null,
        assignedToId: deal.assignedToId,
        products: [],
        taxes: [],
        ...overrides,
      },
      userId
    );
  }

  /**
   * Automation: when a Deal is saved in the 'prospecting' stage with a
   * positive value, auto-generate a matching draft Quotation — Quote amount
   * equals Deal value, added as a single editable line item — so the team
   * has something ready to send the prospect immediately.
   *
   * Duplicate-safe by design: it checks for any existing Quote already
   * linked to this Deal (whether created by this automation, by the
   * existing manual "Send Quotation" action, or otherwise) via the real
   * `Quote.dealId` relationship, and skips silently if one is found — so
   * re-saving or reloading the same Deal never creates a second Quote.
   */
  async autoCreateForProspectingDeal(deal: Deal, userId?: number | null) {
    if (deal.stage !== 'prospecting') return null;

    const value = Number(deal.value);
    if (!Number.isFinite(value) || value <= 0) return null;

    const existing = await Quote.findOne({ where: { dealId: deal.id } });
    if (existing) return null;

    return this.createFromDeal(deal.id, userId, {
      products: [
        {
          productName: `${deal.title} — Prospecting Value`,
          quantity: 1,
          unit: 'Nos',
          rate: value,
        },
      ],
    });
  }

  async create(data: Record<string, any>, userId?: number | null) {
    if (!data.client) throw new ValidationError('client is required');
    data = sanitizeDateFields(data, ['quotationDate', 'validUntil']);

    return sequelize.transaction(async (t) => {
      const quoteNumber = await generateCode('QUOTE', 'QTN', 5, true);
      const publicToken = crypto.randomBytes(24).toString('hex');

      const quote = await quoteRepository.create(
        {
          quoteNumber,
          quotationDate: data.quotationDate || new Date(),
          status: 'draft',
          leadId: data.leadId ?? null,
          dealId: data.dealId ?? null,
          client: data.client,
          customerEmail: data.customerEmail ?? null,
          customerPhone: data.customerPhone ?? null,
          customerAddress: data.customerAddress ?? null,
          discountType: data.discountType || 'percentage',
          discountValue: data.discountValue ?? 0,
          shippingCharges: data.shippingCharges ?? 0,
          terms: data.terms ?? null,
          paymentTerms: data.paymentTerms ?? null,
          assignedToId: data.assignedToId ?? null,
          salesPersonId: data.assignedToId ?? null,
          validUntil: data.validUntil ?? null,
          createdById: userId ?? null,
          publicToken,
        },
        t
      );

      await this.replaceProducts(quote.id, data.products || [], t);
      await this.replaceTaxes(quote.id, data.taxes || [], t);
      await this.recalculateTotals(quote.id, t);

      await logActivity(
        { action: 'created', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quoteNumber} was created.` },
        t
      );
      if (data.leadId) {
        await logActivity(
          { action: 'quotation_created', entityType: 'Lead', entityId: data.leadId, performedById: userId, details: `Quotation ${quoteNumber} was generated from this lead.` },
          t
        );
      }
      if (data.dealId) {
        await logActivity(
          { action: 'quotation_created', entityType: 'Deal', entityId: data.dealId, performedById: userId, details: `Quotation ${quoteNumber} was generated from this deal.` },
          t
        );
      }

      const full = await quoteRepository.getByIdWithDetails(quote.id, t);
      return serializeQuote(full!);
    });
  }

  async update(id: number | string, data: Record<string, any>, userId?: number | null) {
    const quote = await quoteRepository.findById(id);
    if (!quote) throw new NotFoundError('Quote', id);
    if (quote.status === 'accepted') throw new ConflictError('Accepted quotations cannot be edited directly — create a revision instead');
    data = sanitizeDateFields(data, ['quotationDate', 'validUntil']);

    return sequelize.transaction(async (t) => {
      // Explicit whitelist — never spread the raw body. This blocks callers from
      // writing computed totals (subtotal/taxTotal/amount), status, revision
      // numbers, approval fields, or quote numbers directly via update.
      const updatable: Record<string, any> = {
        leadId: data.leadId !== undefined ? data.leadId : quote.leadId,
        dealId: data.dealId !== undefined ? data.dealId : quote.dealId,
        client: data.client !== undefined ? data.client : quote.client,
        customerEmail: data.customerEmail !== undefined ? data.customerEmail : quote.customerEmail,
        customerPhone: data.customerPhone !== undefined ? data.customerPhone : quote.customerPhone,
        customerAddress: data.customerAddress !== undefined ? data.customerAddress : quote.customerAddress,
        discountType: data.discountType !== undefined ? data.discountType : quote.discountType,
        discountValue: data.discountValue !== undefined ? data.discountValue : quote.discountValue,
        shippingCharges: data.shippingCharges !== undefined ? data.shippingCharges : quote.shippingCharges,
        terms: data.terms !== undefined ? data.terms : quote.terms,
        paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : quote.paymentTerms,
        assignedToId: data.assignedToId !== undefined ? data.assignedToId : quote.assignedToId,
        salesPersonId: data.assignedToId !== undefined ? data.assignedToId : quote.salesPersonId,
        validUntil: data.validUntil !== undefined ? data.validUntil : quote.validUntil,
        // quotationDate is NOT NULL — sanitize turns '' into null, so fall back
        // to the existing value instead of writing null and 500ing.
        quotationDate: data.quotationDate !== undefined && data.quotationDate !== null ? data.quotationDate : quote.quotationDate,
      };

      await quoteRepository.update(quote, updatable, t);

      if (data.products !== undefined) await this.replaceProducts(quote.id, data.products || [], t);
      if (data.taxes !== undefined) await this.replaceTaxes(quote.id, data.taxes || [], t);
      if (data.products !== undefined || data.taxes !== undefined || data.discountType !== undefined || data.discountValue !== undefined || data.shippingCharges !== undefined) {
        await this.recalculateTotals(quote.id, t);
      }

      await logActivity({ action: 'updated', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quote.quoteNumber} was updated.` }, t);

      const full = await quoteRepository.getByIdWithDetails(quote.id, t);
      return serializeQuote(full!);
    });
  }

  async delete(id: number | string, userId?: number | null) {
    const quote = await quoteRepository.findById(id);
    if (!quote) throw new NotFoundError('Quote', id);
    await quoteRepository.delete(quote);
    await logActivity({ action: 'deleted' as any, entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quote.quoteNumber} was deleted.` });
  }

  async generatePdf(id: number | string) {
    const quote = await quoteRepository.getByIdWithDetails(id);
    if (!quote) throw new NotFoundError('Quote', id);

    const doc = await this.buildPrintableDocument(quote);
    const fileName = `quote-${quote.quoteNumber}-v${quote.revisionNumber}.pdf`;
    const pdfPath = await generateDocumentPdf(doc, fileName);

    await quote.update({ pdfPath });
    return pdfPath;
  }

  async getPrintHtml(id: number | string): Promise<string> {
    const quote = await quoteRepository.getByIdWithDetails(id);
    if (!quote) throw new NotFoundError('Quote', id);
    const doc = await this.buildPrintableDocument(quote);
    return renderPrintHtml(doc);
  }

  /**
   * Customer-facing view: looked up by the opaque `publicToken`, never the
   * internal numeric id, and mounted on a route with no auth middleware
   * (Phase 4: real public route instead of exposing an internal one). Reuses
   * the same rendering as the authenticated print view so both stay in sync.
   */
  async getPublicPrintHtml(token: string): Promise<string> {
    const quote = await Quote.findOne({ where: { publicToken: token } });
    if (!quote) throw new NotFoundError('Quote', token);
    const full = await quoteRepository.getByIdWithDetails(quote.id);
    const doc = await this.buildPrintableDocument(full!);
    return renderPrintHtml(doc);
  }

  /**
   * Builds the strategic share message (Phase 8) plus the dynamic public
   * Quote link (Phase 4/9) for the WhatsApp/email "Send Quote" flow. Backfills
   * a `publicToken` for quotes created before this existed, so nothing that
   * was working before breaks.
   */
  async getShareContent(id: number | string) {
    const quote = await Quote.findByPk(id);
    if (!quote) throw new NotFoundError('Quote', id);

    if (!quote.publicToken) {
      await quote.update({ publicToken: crypto.randomBytes(24).toString('hex') });
    }

    const company = await Company.findOne({ order: [['id', 'ASC']] });
    const baseUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const quoteLink = `${baseUrl}/api/quotes/public/${quote.publicToken}`;

    const template = (company?.quoteMessageTemplate && company.quoteMessageTemplate.trim()) || DEFAULT_SHARE_TEMPLATE;
    const message = template
      .replace(/\{\{\s*customerName\s*\}\}/g, quote.client || 'there')
      .replace(/\{\{\s*quoteNumber\s*\}\}/g, quote.quoteNumber)
      .replace(/\{\{\s*quoteValue\s*\}\}/g, formatShareAmount(Number(quote.amount), company?.currency || 'INR'))
      .replace(/\{\{\s*quoteLink\s*\}\}/g, quoteLink)
      .replace(/\{\{\s*companyName\s*\}\}/g, company?.name || 'our team')
      .replace(/\{\{\s*companySocialLinks\s*\}\}/g, buildSocialLinksBlock(company))
      // Collapse a leftover blank line if companySocialLinks resolved empty.
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      message,
      quoteLink,
      customerPhone: quote.customerPhone || null,
      customerEmail: quote.customerEmail || null,
      quoteNumber: quote.quoteNumber,
    };
  }

  async sendEmail(id: number | string, toEmail: string | undefined, userId?: number | null) {
    const quote = await quoteRepository.getByIdWithDetails(id);
    if (!quote) throw new NotFoundError('Quote', id);

    const recipient = toEmail || quote.customerEmail;
    if (!recipient) throw new ValidationError("No recipient email available — pass one or set the quote's customerEmail");

    const pdfPath = await this.generatePdf(id);
    const absolutePath = path.join(__dirname, '../../', pdfPath);

    const sent = await sendMailWithAttachment(
      recipient,
      `Quotation ${quote.quoteNumber} from ${await this.getCompanyName()}`,
      `<p>Hi,</p><p>Please find attached Quotation <strong>${quote.quoteNumber}</strong> for your review.</p>`,
      { filename: `${quote.quoteNumber}.pdf`, path: absolutePath }
    );

    // Only transition draft -> sent (and stamp sentAt) when the email actually
    // went out. If SMTP is unavailable, keep the quote as a draft so it remains
    // editable and isn't shown as delivered.
    if (sent) {
      if (quote.status === 'draft') {
        await quote.update({ status: 'sent', sentAt: new Date() });
      } else {
        await quote.update({ sentAt: new Date() });
      }
    }

    await logActivity({ action: 'email_sent', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation emailed to ${recipient}${sent ? '' : ' (SMTP not configured — logged only)'}` });

    return { sent, recipient };
  }

  /** Creates a new revision of a quotation, preserving the original as history. */
  async createRevision(id: number | string, userId?: number | null) {
    const original = await quoteRepository.getByIdWithDetails(id);
    if (!original) throw new NotFoundError('Quote', id);

    return sequelize.transaction(async (t) => {
      const rootId = original.revisionOf || original.id;
      const quoteNumber = await generateCode('QUOTE', 'QTN', 5, true);

      const revision = await quoteRepository.create(
        {
          quoteNumber,
          quotationDate: new Date(),
          status: 'draft',
          leadId: original.leadId,
          dealId: original.dealId,
          client: original.client,
          customerEmail: original.customerEmail,
          customerPhone: original.customerPhone,
          customerAddress: original.customerAddress,
          discountType: original.discountType,
          discountValue: original.discountValue,
          shippingCharges: original.shippingCharges,
          terms: original.terms,
          paymentTerms: original.paymentTerms,
          assignedToId: original.assignedToId,
          salesPersonId: original.salesPersonId,
          // A fresh revision shouldn't inherit a stale expiry — give it a fresh
          // 30-day window so it isn't born already expired.
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revisionOf: rootId,
          revisionNumber: original.revisionNumber + 1,
          createdById: userId ?? null,
        },
        t
      );

      const products = (original as any).products || [];
      const taxes = (original as any).taxes || [];
      await this.replaceProducts(
        revision.id,
        products.map((p: any) => ({ itemId: p.itemId, productName: p.productName, quantity: p.quantity, unit: p.unit, rate: p.rate })),
        t
      );
      await this.replaceTaxes(revision.id, taxes.map((tx: any) => ({ taxId: tx.taxId, taxType: tx.taxType, percentage: tx.percentage })), t);
      await this.recalculateTotals(revision.id, t);

      // Mark the previous version superseded so it can't keep being approved /
      // accepted and spawn stale invoices. The accepted guard below was a bug —
      // an accepted quote that gets revised would live on forever as approvable.
      if (original.status !== 'rejected') {
        await original.update({ status: 'superseded' }, { transaction: t });
      }

      await logActivity({ action: 'updated', entityType: 'Quote', entityId: revision.id, performedById: userId, details: `Created as revision ${revision.revisionNumber} of ${original.quoteNumber}.` }, t);

      const full = await quoteRepository.getByIdWithDetails(revision.id, t);
      return serializeQuote(full!);
    });
  }

  async reject(id: number | string, userId?: number | null) {
    const quote = await quoteRepository.findById(id);
    if (!quote) throw new NotFoundError('Quote', id);
    if (quote.status === 'accepted') throw new ConflictError('An accepted quotation cannot be rejected');

    await quote.update({ status: 'rejected', rejectedAt: new Date() });
    await logActivity({ action: 'status_changed', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quote.quoteNumber} marked as rejected.` });

    return serializeQuote(quote);
  }

  /**
   * Accepts a Quotation and — per the standard conversion workflow — turns it
   * into a Deal: if the quote already has a linked Deal (it came from an
   * Opportunity), that Deal is updated and advanced; otherwise a new Deal is
   * created from the quote's customer/products/amount.
   */
  async accept(id: number | string, userId?: number | null) {
    return sequelize.transaction(async (t) => {
      // Row lock prevents two concurrent accepts from both passing the
      // status guard and creating duplicate deals.
      const quote = await Quote.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!quote) throw new NotFoundError('Quote', id);
      if (quote.status === 'accepted') throw new ConflictError('Quotation is already accepted');

      await quote.update({ status: 'accepted', acceptedAt: new Date() }, { transaction: t });

      let deal: Deal | null = null;
      if (quote.dealId) {
        deal = await Deal.findByPk(quote.dealId, { transaction: t });
        if (deal) {
          await deal.update(
            {
              value: quote.amount,
              stage: 'negotiation',
              probability: Math.max(deal.probability, 80),
              quoteId: quote.id,
            },
            { transaction: t }
          );
        }
      }

      if (!deal) {
        const expectedCloseDate = quote.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        deal = await Deal.create(
          {
            title: `${quote.client} — ${quote.quoteNumber}`,
            client: quote.client,
            value: quote.amount,
            currency: 'INR',
            stage: 'negotiation',
            probability: 80,
            leadId: quote.leadId || null,
            quoteId: quote.id,
            assignedToId: quote.assignedToId || null,
            expectedCloseDate,
            isActive: true,
          },
          { transaction: t }
        );
        await quote.update({ dealId: deal.id }, { transaction: t });
      }

      await logActivity({ action: 'status_changed', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quote.quoteNumber} accepted.` }, t);
      await logActivity({ action: 'deal_created', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Deal #${deal.id} created/updated from acceptance.` }, t);
      await logActivity({ action: 'deal_created', entityType: 'Deal', entityId: deal.id, performedById: userId, details: `Deal created/advanced from accepted Quotation ${quote.quoteNumber}.` }, t);
      if (quote.leadId) {
        await logActivity({ action: 'deal_created', entityType: 'Lead', entityId: quote.leadId, performedById: userId, details: `Deal #${deal.id} created from accepted Quotation ${quote.quoteNumber}.` }, t);
      }

      if (deal.assignedToId && deal.assignedToId !== userId) {
        notifyUser({
          userId: deal.assignedToId,
          type: 'deal_created',
          title: 'Deal ready from accepted quotation',
          message: `Quotation ${quote.quoteNumber} was accepted and turned into a deal.`,
          entityType: 'Deal',
          entityId: deal.id,
        }).catch(() => {});
      }

      return { quote: serializeQuote(quote), deal: deal.toJSON() };
    });
  }

  /**
   * Second step of the accept -> approve flow. A quote must already be
   * customer-accepted (status === 'accepted') before it can be approved by
   * the team; approval auto-generates the Invoice, using the same atomic
   * year-scoped numbering as everything else (INV-2026-00001).
   */
  async approve(id: number | string, userId?: number | null) {
    return sequelize.transaction(async (t) => {
      // Row lock: prevents two concurrent approves from both passing the
      // approvedAt guard and creating two invoices for the same quote.
      const quote = await Quote.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!quote) throw new NotFoundError('Quote', id);
      if (quote.status !== 'accepted') {
        throw new ConflictError('Only a customer-accepted quotation can be approved');
      }
      if (quote.approvedAt) {
        throw new ConflictError('Quotation has already been approved');
      }

      await quote.update({ approvedAt: new Date(), approvedById: userId ?? null }, { transaction: t });

      const invoiceNumber = await generateCode('INVOICE', 'INV', 5, true);
      const invoice = await Invoice.create(
        {
          invoiceNumber,
          client: quote.client,
          // Copy customer contact details from the quote so the generated
          // invoice carries the bill-to email/phone/address.
          customerEmail: quote.customerEmail || null,
          customerPhone: quote.customerPhone || null,
          customerAddress: quote.customerAddress || null,
          amount: quote.amount,
          status: 'pending',
          issuedDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          quoteId: quote.id,
          assignedToId: quote.assignedToId || null,
        },
        { transaction: t }
      );

      await logActivity(
        { action: 'invoice_created', entityType: 'Quote', entityId: quote.id, performedById: userId, details: `Quotation ${quote.quoteNumber} was approved; Invoice ${invoiceNumber} was auto-created.` },
        t
      );
      await logActivity(
        { action: 'created', entityType: 'Invoice', entityId: invoice.id, performedById: userId, details: `Invoice ${invoiceNumber} auto-created from approved Quotation ${quote.quoteNumber}.` },
        t
      );

      if (quote.assignedToId && quote.assignedToId !== userId) {
        notifyUser({
          userId: quote.assignedToId,
          type: 'invoice_created',
          title: 'Invoice ready',
          message: `Quotation ${quote.quoteNumber} was approved and Invoice ${invoiceNumber} was generated.`,
          entityType: 'Invoice',
          entityId: invoice.id,
        }).catch(() => {});
      }

      return { quote: serializeQuote(quote), invoice: invoice.toJSON() };
    });
  }

  async getTimeline(id: number | string) {
    const quote = await quoteRepository.findById(id);
    if (!quote) throw new NotFoundError('Quote', id);
    return getTimeline('Quote', quote.id);
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async replaceProducts(quoteId: number, products: ProductInput[], t: Transaction) {
    await QuoteProduct.destroy({ where: { quoteId }, transaction: t });
    if (!products.length) return;
    await QuoteProduct.bulkCreate(
      products.map((p) => {
        const quantity = p.quantity ?? 1;
        const rate = p.rate ?? 0;
        return { quoteId, itemId: p.itemId ?? null, productName: p.productName, quantity, unit: p.unit || 'Nos', rate, amount: Number(quantity) * Number(rate) };
      }),
      { transaction: t }
    );
  }

  private async replaceTaxes(quoteId: number, taxes: TaxInput[], t: Transaction) {
    await QuoteTax.destroy({ where: { quoteId }, transaction: t });
    if (!taxes.length) return;
    await QuoteTax.bulkCreate(
      taxes.map((tx) => ({ quoteId, taxId: tx.taxId ?? null, taxType: tx.taxType, percentage: tx.percentage ?? 0, amount: 0 })),
      { transaction: t }
    );
  }

  /** subtotal -> apply discount -> add shipping -> apply taxes on the discounted subtotal -> grand total. */
  private async recalculateTotals(quoteId: number, t: Transaction) {
    const quote = await Quote.findByPk(quoteId, { transaction: t });
    if (!quote) return;

    const products = await QuoteProduct.findAll({ where: { quoteId }, transaction: t });
    const subtotal = products.reduce((sum, p) => sum + Number(p.amount), 0);

    const discountAmount = computeDiscountAmount(subtotal, quote.discountType, Number(quote.discountValue));
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);

    const taxes = await QuoteTax.findAll({ where: { quoteId }, transaction: t });
    let taxTotal = 0;
    for (const tax of taxes) {
      const amount = (discountedSubtotal * Number(tax.percentage)) / 100;
      taxTotal += amount;
      await tax.update({ amount }, { transaction: t });
    }

    const grandTotal = discountedSubtotal + taxTotal + Number(quote.shippingCharges);

    await Quote.update({ subtotal, taxTotal, amount: grandTotal }, { where: { id: quoteId }, transaction: t });
  }

  private async getCompanyName(): Promise<string> {
    const company = await Company.findOne({ order: [['id', 'ASC']] });
    return company?.name || 'Our Company';
  }

  private async buildPrintableDocument(quote: Quote): Promise<PrintableDocument> {
    const company = await Company.findOne({ order: [['id', 'ASC']] });
    const plain: any = quote.toJSON();
    const discountAmount = computeDiscountAmount(Number(plain.subtotal), plain.discountType, Number(plain.discountValue));

    return {
      docType: 'Quotation',
      docNumber: quote.quoteNumber,
      docDate: new Date(quote.quotationDate).toLocaleDateString(),
      validUntilOrDueDate: quote.validUntil ? { label: 'Valid Until', value: new Date(quote.validUntil).toLocaleDateString() } : null,
      companyName: company?.name || 'Our Company',
      companyAddress: company?.address || null,
      customerName: quote.client,
      customerAddress: quote.customerAddress,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone,
      lineItems: (plain.products || []).map((p: any) => ({ name: p.productName, quantity: Number(p.quantity), unit: p.unit, rate: Number(p.rate), amount: Number(p.amount) })),
      subtotal: Number(plain.subtotal),
      discountLabel: plain.discountType === 'percentage' ? `Discount (${plain.discountValue}%)` : 'Discount',
      discountAmount,
      shippingCharges: Number(plain.shippingCharges),
      taxes: (plain.taxes || []).map((t: any) => ({ label: t.taxType, percentage: Number(t.percentage), amount: Number(t.amount) })),
      taxTotal: Number(plain.taxTotal),
      grandTotal: Number(plain.amount),
      terms: quote.terms,
      paymentTerms: quote.paymentTerms,
      currency: company?.currency || 'INR',
      status: quote.status,
    };
  }
}

export default new QuoteService();
