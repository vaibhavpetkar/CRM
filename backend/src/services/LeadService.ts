import sequelize from '../config/database';
import { Transaction, Op } from 'sequelize';
import Lead from '../models/Lead';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import Contact from '../models/Contact';
import Company from '../models/Company';
import Deal from '../models/Deal';
import Attachment from '../models/Attachment';
import Task from '../models/Task';
import ActivityLog from '../models/ActivityLog';
import leadRepository from '../repositories/LeadRepository';
import { ListQueryParams } from '../repositories/BaseRepository';
import { generateCode } from '../utils/codeGenerator';
import { logActivity, getTimeline, diffFields, computeChanges } from './activityLogger';
import { sanitizeDateFields, sanitizeNumericFields } from '../utils/sanitize';
import { notifyUser } from '../utils/notificationService';
import { getOrSetCache } from '../utils/cache';
import { NotFoundError, ConflictError, ValidationError } from '../errors/AppError';

interface ProductInput {
  itemId?: number | null;
  productName: string;
  quantity?: number;
  unit?: string;
  expectedPrice?: number;
}

interface TaxInput {
  taxId?: number | null;
  taxType: string;
  percentage?: number;
}

export interface CreateLeadInput {
  [key: string]: unknown;
  firstName: string;
  lastName: string;
  email?: string | null;
  products?: ProductInput[];
  taxes?: TaxInput[];
}

// Fields whose changes are worth their own dedicated timeline entry beyond the
// generic "updated" one, because they represent a meaningful business event.
const STATUS_FIELD = 'status';
const ASSIGNEE_FIELD = 'assignedToId';

// Serializes a lead to match the shape the frontend already expects (see the
// original leadController), plus the new doctype fields/child tables.
const serializeLead = (lead: Lead) => {
  const plain: any = lead.toJSON ? lead.toJSON() : lead;
  return {
    ...plain,
    name: `${plain.firstName} ${plain.lastName}`,
    source: plain.leadSource,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
    qualifiedBy: plain.qualifiedBy ? `${plain.qualifiedBy.firstName} ${plain.qualifiedBy.lastName}` : null,
    lastContact: plain.lastContacted,
    salutation: plain.prefix,
    designation: plain.jobTitle,
    annualTurnover: plain.annualRevenue,
    address: plain.street,
    pincode: plain.zipCode,
  };
};

class LeadService {
  async list(params: ListQueryParams) {
    const result = await leadRepository.list(params);
    return {
      leads: result.rows.map(serializeLead),
      total: result.total,
      page: result.page,
      pages: result.pages,
    };
  }

  async getById(id: number | string) {
    const lead = await leadRepository.getByIdWithDetails(id);
    if (!lead) throw new NotFoundError('Lead', id);

    const [timeline, attachments] = await Promise.all([
      getTimeline('Lead', lead.id),
      Attachment.findAll({ where: { entityType: 'Lead', entityId: lead.id }, order: [['createdAt', 'DESC']] }),
    ]);

    return { ...serializeLead(lead), timeline, attachments };
  }

  // Task 2.6: called by the frontend before showing the "Add Lead" duplicate
  // warning popup. Returns the matching lead (serialized) if one exists, or
  // null. `excludeId` lets the edit form check without flagging itself.
  async checkDuplicate(email?: string | null, mobile?: string | null, excludeId?: number | string) {
    if (!email && !mobile) return { duplicate: null };
    const existing = await leadRepository.findDuplicate({ email, mobile }, excludeId);
    return { duplicate: existing ? serializeLead(existing) : null };
  }

  async create(data: CreateLeadInput, userId?: number | null) {
    if (!data.firstName || !data.lastName) {
      throw new ValidationError('firstName and lastName are required');
    }

    data = sanitizeDateFields(data, ['date', 'lastContacted', 'nextFollowUp']);
    data = sanitizeNumericFields(data, [
      'noOfEmployees', 'leadOwnerId', 'assignedToId', 'qualifiedById',
      'latitude', 'longitude', 'value', 'score',
    ]);

    // '' is falsy but not null/undefined, so the `??` defaults below wouldn't
    // catch it — Sequelize's isEmail validator rejects an empty string even
    // though the column itself allows null, which showed up as a 422
    // "Validation failed" error whenever the email fields were left blank.
    if (data.email === '') data.email = null;
    if (data.secondaryEmail === '') data.secondaryEmail = null;

    // Task 2.6: duplicate detection by mobile OR email. Rather than a hard
    // block, the frontend calls `checkDuplicate` first and shows a warning
    // popup ("View Existing Lead" / "Continue Anyway" / "Cancel"). If the
    // user chooses to continue anyway, the request is resent with
    // `allowDuplicate: true` and creation proceeds normally.
    if (!data.allowDuplicate) {
      const existing = await leadRepository.findDuplicate({
        email: data.email as string | undefined,
        mobile: data.mobile as string | undefined,
      });
      if (existing) {
        throw new ConflictError('A lead with this email address or mobile number already exists');
      }
    }

    return sequelize.transaction(async (t) => {
      // Task 2.15: Series ID format is "LD-000001" — short "LD" prefix, flat
      // (non-year-scoped) 6-digit running number, auto-generated on create.
      const leadNumber = await generateCode('LEAD', 'LD', 6, false);

      const lead = await leadRepository.create(
        {
          leadNumber,
          date: data.date || new Date(),
          territory: data.territory ?? null,
          alternateMobile: data.alternateMobile ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          prefix: data.prefix ?? data.salutation ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          fax: data.fax ?? null,
          mobile: data.mobile ?? null,
          company: data.company ?? null,
          website: data.website ?? null,
          jobTitle: data.jobTitle ?? data.designation ?? null,
          leadSource: data.leadSource ?? data.source ?? 'website',
          status: data.status ?? 'new',
          industry: data.industry ?? null,
          noOfEmployees: data.noOfEmployees ?? null,
          annualRevenue: data.annualRevenue ?? data.annualTurnover ?? null,
          rating: data.rating ?? null,
          emailOptOut: data.emailOptOut ?? false,
          skypeId: data.skypeId ?? null,
          secondaryEmail: data.secondaryEmail ?? null,
          leadImage: data.leadImage ?? null,
          leadOwnerId: data.leadOwnerId ?? null,
          country: data.country ?? null,
          state: data.state ?? null,
          city: data.city ?? null,
          street: data.street ?? data.address ?? null,
          zipCode: data.zipCode ?? data.pincode ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          description: data.description ?? null,
          score: data.score ?? 0,
          value: data.value ?? null,
          notes: data.notes ?? null,
          assignedToId: data.assignedToId ?? null,
          sourceDetails: data.sourceDetails ?? null,
          lastContacted: data.lastContacted ?? null,
          nextFollowUp: data.nextFollowUp ?? null,
          interestedIn: data.interestedIn ?? null,
          interestedInServices: data.interestedInServices ?? null,
          interestedInProducts: data.interestedInProducts ?? null,
          timelineToPurchase: data.timelineToPurchase ?? null,
          qualifiedById: data.qualifiedById ?? null,
          meetingStatus: data.meetingStatus ?? null,
          createdById: userId ?? null,
          modifiedById: userId ?? null,
          isConverted: false,
        },
        t
      );

      await this.replaceProducts(lead.id, data.products || [], t);
      await this.replaceTaxes(lead.id, data.taxes || [], t);
      await this.recalculateTotals(lead.id, t);

      await logActivity(
        {
          action: 'created',
          entityType: 'Lead',
          entityId: lead.id,
          performedById: userId,
          details: `Lead ${lead.firstName} ${lead.lastName} was created.`,
        },
        t
      );

      const fullLead = await leadRepository.getByIdWithDetails(lead.id, t);

      if (lead.assignedToId && lead.assignedToId !== userId) {
        // Fire-and-forget outside the transaction boundary concerns — notification
        // failure shouldn't roll back lead creation, so we don't await inside `t`.
        notifyUser({
          userId: lead.assignedToId,
          type: 'lead_assigned',
          title: 'New lead assigned to you',
          message: `You've been assigned the lead ${lead.firstName} ${lead.lastName}${lead.company ? ` (${lead.company})` : ''}.`,
          entityType: 'Lead',
          entityId: lead.id,
        }).catch(() => {});
      }

      return serializeLead(fullLead!);
    });
  }

  async update(id: number | string, data: Record<string, unknown>, userId?: number | null) {
    const lead = await leadRepository.findById(id);
    if (!lead) throw new NotFoundError('Lead', id);

    data = sanitizeDateFields(data, ['date', 'lastContacted', 'nextFollowUp']);
    data = sanitizeNumericFields(data, [
      'noOfEmployees', 'leadOwnerId', 'assignedToId', 'qualifiedById',
      'latitude', 'longitude', 'value', 'score',
    ]);

    if (data.email === '') data.email = null;
    if (data.secondaryEmail === '') data.secondaryEmail = null;

    // Case-insensitive duplicate check (email column has no unique index).
    const normalizedEmail = data.email && data.email !== lead.email
      ? String(data.email).toLowerCase()
      : null;
    if (normalizedEmail && normalizedEmail !== String(lead.email).toLowerCase()) {
      const existing = await leadRepository.findByEmail(normalizedEmail);
      if (existing) throw new ConflictError('Lead with this email already exists');
    }

    const before = lead.toJSON() as unknown as Record<string, unknown>;

    return sequelize.transaction(async (t) => {
      // Explicit whitelist — NEVER spread the raw request body into the row.
      // This blocks clients from forging internal fields (leadNumber, isConverted,
      // convertedAt, convertedToDealId) or clobbering computed totals
      // (subtotal/taxTotal/grandTotal) via update.
      const updatable = {
        date: data.date ?? lead.date,
        territory: data.territory !== undefined ? data.territory : lead.territory,
        firstName: data.firstName !== undefined ? data.firstName : lead.firstName,
        lastName: data.lastName !== undefined ? data.lastName : lead.lastName,
        prefix: data.prefix !== undefined ? data.prefix : (data.salutation !== undefined ? data.salutation : lead.prefix),
        email: data.email !== undefined ? data.email : lead.email,
        phone: data.phone !== undefined ? data.phone : lead.phone,
        fax: data.fax !== undefined ? data.fax : lead.fax,
        mobile: data.mobile !== undefined ? data.mobile : lead.mobile,
        alternateMobile: data.alternateMobile !== undefined ? data.alternateMobile : lead.alternateMobile,
        company: data.company !== undefined ? data.company : lead.company,
        website: data.website !== undefined ? data.website : lead.website,
        jobTitle: data.jobTitle !== undefined ? data.jobTitle : (data.designation !== undefined ? data.designation : lead.jobTitle),
        leadSource: data.leadSource !== undefined ? data.leadSource : (data.source !== undefined ? data.source : lead.leadSource),
        status: data.status !== undefined ? data.status : lead.status,
        industry: data.industry !== undefined ? data.industry : lead.industry,
        noOfEmployees: data.noOfEmployees !== undefined ? data.noOfEmployees : lead.noOfEmployees,
        annualRevenue: data.annualRevenue !== undefined ? data.annualRevenue : (data.annualTurnover !== undefined ? data.annualTurnover : lead.annualRevenue),
        rating: data.rating !== undefined ? data.rating : lead.rating,
        emailOptOut: data.emailOptOut !== undefined ? data.emailOptOut : lead.emailOptOut,
        skypeId: data.skypeId !== undefined ? data.skypeId : lead.skypeId,
        secondaryEmail: data.secondaryEmail !== undefined ? data.secondaryEmail : lead.secondaryEmail,
        leadImage: data.leadImage !== undefined ? data.leadImage : lead.leadImage,
        leadOwnerId: data.leadOwnerId !== undefined ? data.leadOwnerId : lead.leadOwnerId,
        country: data.country !== undefined ? data.country : lead.country,
        state: data.state !== undefined ? data.state : lead.state,
        city: data.city !== undefined ? data.city : lead.city,
        street: data.street !== undefined ? data.street : (data.address !== undefined ? data.address : lead.street),
        zipCode: data.zipCode !== undefined ? data.zipCode : (data.pincode !== undefined ? data.pincode : lead.zipCode),
        latitude: data.latitude !== undefined ? data.latitude : lead.latitude,
        longitude: data.longitude !== undefined ? data.longitude : lead.longitude,
        description: data.description !== undefined ? data.description : lead.description,
        score: data.score !== undefined ? data.score : lead.score,
        value: data.value !== undefined ? data.value : lead.value,
        notes: data.notes !== undefined ? data.notes : lead.notes,
        assignedToId: data.assignedToId !== undefined ? data.assignedToId : lead.assignedToId,
        sourceDetails: data.sourceDetails !== undefined ? data.sourceDetails : lead.sourceDetails,
        lastContacted: data.lastContacted !== undefined ? data.lastContacted : lead.lastContacted,
        nextFollowUp: data.nextFollowUp !== undefined ? data.nextFollowUp : lead.nextFollowUp,
        interestedIn: data.interestedIn !== undefined ? data.interestedIn : lead.interestedIn,
        interestedInServices: data.interestedInServices !== undefined ? data.interestedInServices : lead.interestedInServices,
        interestedInProducts: data.interestedInProducts !== undefined ? data.interestedInProducts : lead.interestedInProducts,
        timelineToPurchase: data.timelineToPurchase !== undefined ? data.timelineToPurchase : lead.timelineToPurchase,
        qualifiedById: data.qualifiedById !== undefined ? data.qualifiedById : lead.qualifiedById,
        meetingStatus: data.meetingStatus !== undefined ? data.meetingStatus : lead.meetingStatus,
        modifiedById: userId ?? lead.modifiedById,
      };

      await leadRepository.update(lead, updatable, t);

      if (data.products !== undefined) {
        await this.replaceProducts(lead.id, (data.products as ProductInput[]) || [], t);
      }
      if (data.taxes !== undefined) {
        await this.replaceTaxes(lead.id, (data.taxes as TaxInput[]) || [], t);
      }
      if (data.products !== undefined || data.taxes !== undefined) {
        await this.recalculateTotals(lead.id, t);
      }

      const after = lead.toJSON() as unknown as Record<string, unknown>;

      // Fields eligible for the timeline diff + revert. Deliberately excludes
      // internal bookkeeping (id/timestamps/modifiedById) and the child tables
      // (products/taxes), which are handled separately and aren't revertable
      // via a simple field-value swap.
      const REVERTABLE_FIELDS = [
        'firstName', 'lastName', 'email', 'secondaryEmail', 'phone', 'mobile', 'alternateMobile',
        'company', 'website', 'jobTitle', 'prefix', 'industry', 'annualRevenue', 'leadSource',
        'sourceDetails', 'territory', 'status', 'score', 'value', 'notes',
        'street', 'city', 'state', 'zipCode', 'country', 'assignedToId', 'leadOwnerId',
        'nextFollowUp', 'lastContacted', 'interestedIn', 'interestedInServices', 'interestedInProducts', 'timelineToPurchase', 'qualifiedById', 'meetingStatus',
      ];
      const fieldChanges = computeChanges(before, after, REVERTABLE_FIELDS);

      await logActivity(
        {
          action: 'updated',
          entityType: 'Lead',
          entityId: lead.id,
          performedById: userId,
          details: Object.keys(fieldChanges).length > 0
            ? `Updated: ${diffFields(before, after, Object.keys(fieldChanges))}`
            : `Lead ${lead.firstName} ${lead.lastName} was updated.`,
          changes: Object.keys(fieldChanges).length > 0 ? fieldChanges : null,
        },
        t
      );

      if (before[STATUS_FIELD] !== after[STATUS_FIELD]) {
        await logActivity(
          {
            action: 'status_changed',
            entityType: 'Lead',
            entityId: lead.id,
            performedById: userId,
            details: diffFields(before, after, [STATUS_FIELD]),
          },
          t
        );
      }

      if (before[ASSIGNEE_FIELD] !== after[ASSIGNEE_FIELD] && after[ASSIGNEE_FIELD]) {
        await logActivity(
          {
            action: 'assigned',
            entityType: 'Lead',
            entityId: lead.id,
            performedById: userId,
            details: `Assigned to user #${after[ASSIGNEE_FIELD]}`,
          },
          t
        );

        if (after[ASSIGNEE_FIELD] !== userId) {
          notifyUser({
            userId: after[ASSIGNEE_FIELD] as number,
            type: 'lead_assigned',
            title: 'Lead assigned to you',
            message: `You've been assigned the lead ${lead.firstName} ${lead.lastName}${lead.company ? ` (${lead.company})` : ''}.`,
            entityType: 'Lead',
            entityId: lead.id,
          }).catch(() => {});
        }
      }

      // Auto-create a follow-up task whenever the Next Follow-up date is set or
      // changed. Assigned to the lead owner (falls back to the assignee if no
      // owner is set) so they're reminded to actually make the follow-up contact.
      // If a pending follow-up task already exists for this lead, update it in
      // place instead of stacking duplicate reminders on every re-save.
      const nextFollowUpChanged =
        String(before.nextFollowUp ?? '') !== String(after.nextFollowUp ?? '');

      if (nextFollowUpChanged) {
        const ownerId = (after.leadOwnerId ?? after.assignedToId) as number | null;
        const existingTask = after.nextFollowUp
          ? await Task.findOne({
              where: {
                leadId: lead.id,
                status: 'pending',
                title: { [Op.iLike]: `Follow up with ${lead.firstName} ${lead.lastName}%` },
              },
              transaction: t,
            })
          : null;

        if (existingTask) {
          await existingTask.update(
            { dueDate: after.nextFollowUp as Date, assignedToId: ownerId || existingTask.assignedToId },
            { transaction: t }
          );
        } else if (after.nextFollowUp && ownerId) {
          const task = await Task.create(
            {
              title: `Follow up with ${lead.firstName} ${lead.lastName}${lead.company ? ` (${lead.company})` : ''}`,
              type: 'call',
              priority: 'medium',
              status: 'pending',
              dueDate: after.nextFollowUp as Date,
              relatedTo: `Lead: ${lead.leadNumber}`,
              description: `Auto-created follow-up task for lead ${lead.leadNumber}.`,
              assignedToId: ownerId,
              leadId: lead.id,
            },
            { transaction: t }
          );

          await logActivity(
            {
              action: 'created',
              entityType: 'Task',
              entityId: task.id,
              performedById: userId,
              details: `Follow-up task "${task.title}" auto-created from Lead ${lead.leadNumber}'s Next Follow-up date.`,
            },
            t
          );

          if (ownerId !== userId) {
            notifyUser({
              userId: ownerId,
              type: 'task_assigned',
              title: 'Follow-up task assigned to you',
              message: `A follow-up task was created for lead ${lead.firstName} ${lead.lastName}, due ${new Date(after.nextFollowUp as Date).toLocaleDateString()}.`,
              entityType: 'Task',
              entityId: task.id,
            }).catch(() => {});
          }
        }
      }

      const fullLead = await leadRepository.getByIdWithDetails(lead.id, t);
      return serializeLead(fullLead!);
    });
  }

  async delete(id: number | string, userId?: number | null) {
    const lead = await leadRepository.findById(id);
    if (!lead) throw new NotFoundError('Lead', id);

    await leadRepository.delete(lead);

    await logActivity({
      action: 'deleted',
      entityType: 'Lead',
      entityId: lead.id,
      performedById: userId,
      details: `Lead ${lead.firstName} ${lead.lastName} was deleted (soft delete).`,
    });
  }

  /**
   * Converts a Lead into a Contact (always), and optionally a Company and a Deal —
   * the standard "lead conversion" workflow.
   */
  async convert(
    id: number | string,
    options: { createDeal?: boolean; dealTitle?: string; dealValue?: number; createCompany?: boolean },
    userId?: number | null
  ) {
    return sequelize.transaction(async (t) => {
      const lead = await Lead.findByPk(id, { transaction: t });
      if (!lead) throw new NotFoundError('Lead', id);
      if (lead.isConverted) throw new ConflictError('Lead has already been converted');

      const { createDeal = true, dealTitle, dealValue, createCompany = true } = options;

      let company: Company | null = null;
      if (createCompany && lead.company) {
        const [foundCompany] = await Company.findOrCreate({
          where: { name: lead.company },
          defaults: { name: lead.company, website: lead.website || undefined, isActive: true },
          transaction: t,
        });
        company = foundCompany;
      }

      const contact = await Contact.create(
        {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email || null,
          phone: lead.phone || lead.mobile || null,
          company: lead.company || null,
          jobTitle: lead.jobTitle || null,
          leadSource: lead.leadSource || null,
          notes: lead.notes || null,
          assignedToId: lead.assignedToId || null,
          leadId: lead.id,
          lastContacted: lead.lastContacted || null,
          isActive: true,
        },
        { transaction: t }
      );

      let deal: Deal | null = null;
      if (createDeal) {
        deal = await Deal.create(
          {
            title: dealTitle || `${lead.company || `${lead.firstName} ${lead.lastName}`} Deal`,
            client: lead.company || `${lead.firstName} ${lead.lastName}`,
            value: dealValue ?? lead.value ?? lead.grandTotal ?? 0,
            currency: 'INR',
            stage: 'prospecting',
            probability: 10,
            leadId: lead.id,
            contactId: contact.id,
            accountId: company?.id || null,
            assignedToId: lead.assignedToId || null,
            source: lead.leadSource || null,
            isActive: true,
          },
          { transaction: t }
        );
      }

      await lead.update(
        {
          isConverted: true,
          convertedAt: new Date(),
          convertedToContactId: contact.id,
          convertedToAccountId: company?.id || null,
          convertedToDealId: deal?.id || null,
          status: 'converted',
          modifiedById: userId ?? lead.modifiedById,
        },
        { transaction: t }
      );

      await logActivity(
        {
          action: 'converted',
          entityType: 'Lead',
          entityId: lead.id,
          performedById: userId,
          details: `Lead ${lead.firstName} ${lead.lastName} was converted to Contact #${contact.id}${company ? ` and Company #${company.id}` : ''}${deal ? ` and Deal #${deal.id}` : ''}.`,
        },
        t
      );

      if (deal) {
        await logActivity(
          {
            action: 'deal_created',
            entityType: 'Lead',
            entityId: lead.id,
            performedById: userId,
            details: `Deal #${deal.id} created from this lead.`,
          },
          t
        );
      }

      return {
        contact: contact.toJSON(),
        company: company ? company.toJSON() : null,
        deal: deal ? deal.toJSON() : null,
        lead: serializeLead(lead),
      };
    });
  }

  async getStats() {
    return getOrSetCache('leads:stats', 30, async () => {
      const totalLeads = await Lead.count();

      const leadsByStatus = await Lead.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status'],
      });

      const leadsBySource = await Lead.findAll({
        attributes: ['leadSource', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['leadSource'],
      });

      const avgScoreResult = await Lead.findOne({
        attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'averageScore']],
      });

      const totalValueResult = await Lead.findOne({
        attributes: [[sequelize.fn('SUM', sequelize.col('value')), 'totalValue']],
      });

      return {
        totalLeads,
        leadsByStatus,
        leadsBySource,
        averageScore: parseFloat(String(avgScoreResult?.get('averageScore') ?? '0')),
        totalValue: parseFloat(String(totalValueResult?.get('totalValue') ?? '0')),
      };
    });
  }

  async getTimeline(id: number | string) {
    const lead = await leadRepository.findById(id);
    if (!lead) throw new NotFoundError('Lead', id);
    return getTimeline('Lead', lead.id);
  }

  /**
   * Reverts a single timeline entry: re-applies every field's `before` value
   * from that entry's stored diff, then logs a new 'updated' entry so the
   * revert itself is visible in the timeline (reverts are forward-only new
   * edits, not a history rewrite). An entry can only be reverted once.
   */
  async revert(id: number | string, logId: number | string, userId?: number | null) {
    const lead = await leadRepository.findById(id);
    if (!lead) throw new NotFoundError('Lead', id);

    const log = await ActivityLog.findOne({ where: { id: logId, entityType: 'Lead', entityId: lead.id } });
    if (!log) throw new NotFoundError('Activity log entry', logId);
    if (!log.changes || Object.keys(log.changes).length === 0) {
      throw new ValidationError('This activity entry has no field changes to revert.');
    }
    if (log.revertedAt) {
      throw new ConflictError('This change has already been reverted.');
    }

    return sequelize.transaction(async (t) => {
      const before = lead.toJSON() as unknown as Record<string, unknown>;

      // Only revert fields whose CURRENT value still matches the `after` value
      // stored in the diff. This prevents a stale revert from clobbering edits
      // that were made to the same field AFTER this timeline entry was logged.
      const current = lead.toJSON() as unknown as Record<string, unknown>;
      const revertValues: Record<string, unknown> = {};
      for (const [field, diff] of Object.entries(log.changes!)) {
        if (String(current[field] ?? null) === String(diff.after ?? null)) {
          revertValues[field] = diff.before;
        }
      }

      if (Object.keys(revertValues).length === 0) {
        throw new ConflictError('This change can no longer be reverted because the field has been edited again since.');
      }

      await leadRepository.update(lead, { ...revertValues, modifiedById: userId ?? lead.modifiedById }, t);
      await log.update({ revertedAt: new Date() }, { transaction: t });

      const after = lead.toJSON() as unknown as Record<string, unknown>;
      const fieldChanges = computeChanges(before, after, Object.keys(log.changes!));

      await logActivity(
        {
          action: 'updated',
          entityType: 'Lead',
          entityId: lead.id,
          performedById: userId,
          details: `Reverted change: ${diffFields(before, after, Object.keys(fieldChanges))}`,
          changes: Object.keys(fieldChanges).length > 0 ? fieldChanges : null,
        },
        t
      );

      return leadRepository.getByIdWithDetails(lead.id, t);
    });
  }

  // ─── Child-table helpers ────────────────────────────────────────────────────

  private async replaceProducts(leadId: number, products: ProductInput[], t: Transaction) {
    await LeadProduct.destroy({ where: { leadId }, transaction: t });
    if (!products.length) return;

    await LeadProduct.bulkCreate(
      products.map((p) => {
        const quantity = p.quantity ?? 1;
        const expectedPrice = p.expectedPrice ?? 0;
        return {
          leadId,
          itemId: p.itemId ?? null,
          productName: p.productName,
          quantity,
          unit: p.unit || 'Nos',
          expectedPrice,
          amount: Number(quantity) * Number(expectedPrice),
        };
      }),
      { transaction: t }
    );
  }

  private async replaceTaxes(leadId: number, taxes: TaxInput[], t: Transaction) {
    await LeadTax.destroy({ where: { leadId }, transaction: t });
    if (!taxes.length) return;

    // Amounts are computed in recalculateTotals() once the subtotal is known;
    // seed them at 0 here.
    await LeadTax.bulkCreate(
      taxes.map((tx) => ({
        leadId,
        taxId: tx.taxId ?? null,
        taxType: tx.taxType,
        percentage: tx.percentage ?? 0,
        amount: 0,
      })),
      { transaction: t }
    );
  }

  /**
   * Recomputes subtotal (sum of product line amounts), each tax row's amount
   * (subtotal * percentage / 100), taxTotal, and grandTotal — then persists
   * them onto the Lead. Called whenever products or taxes change.
   */
  private async recalculateTotals(leadId: number, t: Transaction) {
    const products = await LeadProduct.findAll({ where: { leadId }, transaction: t });
    const subtotal = products.reduce((sum, p) => sum + Number(p.amount), 0);

    const taxes = await LeadTax.findAll({ where: { leadId }, transaction: t });
    let taxTotal = 0;
    for (const tax of taxes) {
      const amount = (subtotal * Number(tax.percentage)) / 100;
      taxTotal += amount;
      await tax.update({ amount }, { transaction: t });
    }

    const grandTotal = subtotal + taxTotal;

    await Lead.update({ subtotal, taxTotal, grandTotal }, { where: { id: leadId }, transaction: t });
  }
}

export default new LeadService();
