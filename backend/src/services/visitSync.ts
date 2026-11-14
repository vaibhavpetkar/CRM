import { Op, Transaction } from 'sequelize';
import Lead from '../models/Lead';
import SiteVisit, { SiteVisitStatus } from '../models/SiteVisit';
import { logActivity } from './activityLogger';
import { localDay, startOfLocalDay } from '../utils/reportTime';

// Keeps the Site Visits page and the leads' "Site Visit Done" / "Revisit Done"
// statuses telling the same story:
//  - a lead moved to one of those statuses (by a note, an import, the API)
//    gets the visit logged, unless one was already logged that day;
//  - a visit marked done on the Site Visits page moves its lead to the
//    matching status (never back from Booking Done / Converted).

/** Lead status <-> site visit status. */
export const VISIT_FOR_LEAD_STATUS: Record<string, SiteVisitStatus> = {
  'site-visit-done': 'completed',
  'revisit-done': 'revisit-done',
};
export const LEAD_STATUS_FOR_VISIT: Partial<Record<SiteVisitStatus, string>> = {
  completed: 'site-visit-done',
  'revisit-done': 'revisit-done',
};

// A lead already past the visit stage keeps its status when a visit is logged.
const LATER_STATUSES = ['booking-done', 'converted'];

/**
 * The lead now has a site-visit status: make sure the visit is on the Site
 * Visits page. Visits logged automatically are flagged, so the visit the
 * user logs from the popup right after replaces it instead of doubling it.
 */
export const ensureVisitForLeadStatus = async (
  lead: Pick<Lead, 'id' | 'assignedToId' | 'projectName' | 'preferredLocation'> & { createdById?: number | null },
  status: string | null | undefined,
  userId?: number | null,
  options: { transaction?: Transaction; day?: string; notes?: string | null } = {}
) => {
  const visitStatus = status ? VISIT_FOR_LEAD_STATUS[status] : undefined;
  if (!visitStatus) return null;
  const day = options.day || localDay(new Date());
  const existing = await SiteVisit.findOne({
    where: {
      leadId: lead.id,
      status: visitStatus,
      [Op.or]: [
        { scheduledAt: { [Op.gte]: startOfLocalDay(day), [Op.lt]: startOfLocalDay(day, true) } },
        { createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) } },
      ],
    } as any,
    attributes: ['id'],
    transaction: options.transaction,
  });
  if (existing) return null;
  const agentId = lead.assignedToId ?? userId ?? lead.createdById ?? null;
  if (!agentId) return null;
  const today = localDay(new Date());
  const at = day === today ? new Date() : new Date(`${day}T12:00:00+05:30`);
  return SiteVisit.create(
    {
      leadId: lead.id,
      userId: agentId,
      scheduledAt: at,
      status: visitStatus,
      projectName: lead.projectName ?? null,
      location: lead.preferredLocation ?? null,
      notes: options.notes ? String(options.notes).slice(0, 5000) : null,
      completedAt: at,
      createdById: userId ?? null,
      autoCreated: true,
    },
    { transaction: options.transaction }
  );
};

/**
 * A visit was logged for this lead from a popup a moment after the lead's
 * status was saved: the automatic visit made for that status is the same
 * visit, so it is returned to be filled in instead of adding another.
 */
export const findAutoVisit = async (leadId: number, status: SiteVisitStatus) =>
  SiteVisit.findOne({
    where: { leadId, status, autoCreated: true, createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) } } as any,
    order: [['createdAt', 'DESC']],
  });

/** A visit marked done: the lead moves to Site Visit Done / Revisit Done. */
export const syncLeadStatusFromVisit = async (leadId: number | null | undefined, visitStatus: SiteVisitStatus, userId?: number | null) => {
  const next = LEAD_STATUS_FOR_VISIT[visitStatus];
  if (!leadId || !next) return null;
  const lead = await Lead.findByPk(leadId);
  if (!lead || lead.status === next || LATER_STATUSES.includes(lead.status)) return null;
  // A first visit logged late doesn't undo a revisit.
  if (next === 'site-visit-done' && lead.status === 'revisit-done') return null;
  const before = lead.status;
  await lead.update({ status: next, modifiedById: userId ?? lead.modifiedById });
  await logActivity({
    action: 'status_changed',
    entityType: 'Lead',
    entityId: lead.id,
    performedById: userId ?? null,
    details: `Status: ${before} → ${next} (site visit marked done)`,
    changes: { status: { before, after: next } } as any,
  }).catch(() => {});
  return next;
};
