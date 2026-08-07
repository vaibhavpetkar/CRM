import { Transaction } from 'sequelize';
import ActivityLog from '../models/ActivityLog';

/**
 * The fixed vocabulary of timeline events. Keeping this as a union (rather
 * than a free-text string) means every module logs consistently and the
 * frontend timeline can render an icon/label per action without guessing.
 */
export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'converted'
  | 'status_changed'
  | 'assigned'
  | 'quotation_created'
  | 'deal_created'
  | 'invoice_created'
  | 'email_sent'
  | 'call_logged'
  | 'meeting_logged'
  | 'note_added'
  | 'attachment_added';

export type ActivityEntityType = 'Lead' | 'Deal' | 'Quote' | 'Invoice' | 'Contact' | 'Task';

interface LogActivityInput {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: number;
  performedById?: number | null;
  details?: string;
  changes?: Record<string, { before: unknown; after: unknown }> | null;
}

/**
 * Records one timeline entry. Used by every module's service layer so the
 * activity timeline (Created / Edited / Status changed / Assigned /
 * Quotation Created / Deal Created / Invoice Created / Email Sent / Call
 * Logged / Meeting Logged / ...) is populated automatically rather than
 * relying on each controller to remember to log it.
 */
export const logActivity = async (input: LogActivityInput, transaction?: Transaction) => {
  return ActivityLog.create(
    {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      performedById: input.performedById ?? null,
      details: input.details ?? null,
      changes: input.changes ?? null,
    },
    { transaction }
  );
};

/**
 * Computes a structured before/after diff over a whitelist of fields, e.g.
 * { status: { before: 'new', after: 'qualified' } }. Only fields that actually
 * changed are included. Pass the result both to logActivity's `changes` (for
 * revert support) and to diffFields/JSON.stringify for a human-readable summary.
 */
export const computeChanges = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { before: unknown; after: unknown }> => {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) {
    const oldVal = before[field] ?? null;
    const newVal = after[field] ?? null;
    if (oldVal !== newVal) {
      changes[field] = { before: oldVal, after: newVal };
    }
  }
  return changes;
};

/**
 * Fetches the full timeline for a single record, oldest first (chronological
 * reading order), for rendering the Activity Timeline UI.
 */
export const getTimeline = async (entityType: ActivityEntityType, entityId: number) => {
  return ActivityLog.findAll({
    where: { entityType, entityId },
    order: [['createdAt', 'ASC']],
  });
};

/**
 * Diffs the "before" and "after" state of a record against a whitelist of
 * fields and returns a human-readable summary, e.g. "status: new -> qualified".
 * Used to populate the `details` on an 'updated' timeline entry.
 */
export const diffFields = (before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): string => {
  const changes: string[] = [];
  for (const field of fields) {
    const oldVal = before[field];
    const newVal = after[field];
    if (oldVal !== newVal && newVal !== undefined) {
      changes.push(`${field}: ${oldVal ?? '—'} -> ${newVal ?? '—'}`);
    }
  }
  return changes.join(', ');
};
