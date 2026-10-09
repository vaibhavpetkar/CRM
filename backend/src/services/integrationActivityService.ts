import { Op } from 'sequelize';
import Lead from '../models/Lead';
import User from '../models/User';
import PortalLeadEvent from '../models/PortalLeadEvent';
import MetaLeadEvent from '../models/MetaLeadEvent';
import { PORTALS } from './portalLeadsService';
import { ValidationError } from '../errors/AppError';
import { startOfLocalDay, localDay } from '../utils/reportTime';

/**
 * Settings > Integrations > an app > Activity: the leads that app brought in.
 * Portals and Meta keep an event per lead they delivered (new or existing
 * lead, or failed), so the list is exactly what the API sent; incoming calls
 * are the leads they created.
 */

export interface ActivityRow {
  eventId: string;
  result: 'created' | 'duplicate' | 'failed' | 'processing';
  leadId: number | null;
  leadNumber: string | null;
  name: string | null;
  mobile: string | null;
  subSource: string | null;
  leadStatus: string | null;
  assignedTo: string | null;
  error: string | null;
  at: Date;
}

const fullName = (u: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || null : null;

type Base = { result: ActivityRow['result']; leadId: number | null; name: string | null; mobile: string | null; error: string | null; at: Date; eventId: string; subSource?: string | null };

const loadEvents = async (key: string, offset: number, limit: number): Promise<{ rows: Base[]; total: number }> => {
  if (PORTALS.some((p) => p.source === key)) {
    const { rows, count } = await PortalLeadEvent.findAndCountAll({ where: { source: key }, order: [['createdAt', 'DESC']], offset, limit });
    return {
      total: count,
      rows: rows.map((e) => ({ eventId: `p${e.id}`, result: e.status as ActivityRow['result'], leadId: e.leadId ?? null, name: e.name ?? null, mobile: e.mobile ?? null, error: e.error ?? null, at: e.createdAt })),
    };
  }
  if (key === 'meta') {
    const { rows, count } = await MetaLeadEvent.findAndCountAll({ order: [['createdAt', 'DESC']], offset, limit });
    return {
      total: count,
      rows: rows.map((e) => ({
        eventId: `m${e.id}`,
        result: e.status as ActivityRow['result'],
        leadId: e.leadId ?? null,
        name: e.name ?? null,
        mobile: null,
        error: e.error ?? null,
        at: e.createdAt,
        subSource: [e.campaignName, e.formName].filter(Boolean).join(' · ') || null,
      })),
    };
  }
  if (key === 'incoming-call') {
    const { rows, count } = await Lead.findAndCountAll({ where: { leadSource: 'incoming-call' }, order: [['createdAt', 'DESC']], offset, limit, attributes: ['id', 'firstName', 'lastName', 'mobile', 'createdAt'] });
    return {
      total: count,
      rows: rows.map((l) => ({ eventId: `l${l.id}`, result: 'created', leadId: l.id, name: fullName(l), mobile: l.mobile ?? null, error: null, at: l.createdAt as Date })),
    };
  }
  throw new ValidationError(`Unknown integration "${key}".`);
};

/** Leads an app created, counted by day window and by sub source. */
const createdLeadIds = async (key: string): Promise<number[] | null> => {
  if (PORTALS.some((p) => p.source === key)) {
    const events = await PortalLeadEvent.findAll({ where: { source: key, status: 'created', leadId: { [Op.ne]: null } } as any, attributes: ['leadId'] });
    return events.map((e) => e.leadId!) as number[];
  }
  if (key === 'meta') {
    const events = await MetaLeadEvent.findAll({ where: { status: 'created', leadId: { [Op.ne]: null } } as any, attributes: ['leadId'] });
    return events.map((e) => e.leadId!) as number[];
  }
  return null; // incoming-call: by leadSource
};

export const getIntegrationActivity = async (key: string, query: Record<string, unknown>) => {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(String(query.limit || 25), 10) || 25));
  const { rows, total } = await loadEvents(key, (page - 1) * limit, limit);

  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((id): id is number => !!id))];
  const leads = leadIds.length
    ? await Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'leadNumber', 'firstName', 'lastName', 'mobile', 'subSource', 'status', 'assignedToId'] })
    : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const userIds = [...new Set(leads.map((l) => l.assignedToId).filter((id): id is number => !!id))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'firstName', 'lastName'] }) : [];
  const userById = new Map(users.map((u) => [u.id, fullName(u)]));

  const items: ActivityRow[] = rows.map((r) => {
    const lead = r.leadId ? leadById.get(r.leadId) : undefined;
    return {
      eventId: r.eventId,
      result: r.result,
      leadId: lead ? lead.id : null, // deleted leads drop their link
      leadNumber: lead?.leadNumber ?? null,
      name: (lead && fullName(lead)) || r.name,
      mobile: lead?.mobile || r.mobile,
      subSource: lead?.subSource || r.subSource || null,
      leadStatus: lead?.status ?? null,
      assignedTo: lead?.assignedToId ? userById.get(lead.assignedToId) || null : null,
      error: r.error,
      at: r.at,
    };
  });

  // Totals over every lead this app created (not just this page).
  const ids = await createdLeadIds(key);
  const where: any = ids ? { id: ids.length ? ids : [0] } : { leadSource: key };
  const created = await Lead.findAll({ where, attributes: ['id', 'subSource', 'createdAt'], raw: true });
  const today = startOfLocalDay(localDay(new Date()));
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000);
  const count = (since: Date) => created.filter((l: any) => new Date(l.createdAt) >= since).length;
  const bySub = new Map<string, number>();
  for (const l of created as any[]) {
    const k = l.subSource || 'Not set';
    bySub.set(k, (bySub.get(k) || 0) + 1);
  }

  return {
    key,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    stats: { leads: created.length, today: count(today), last7Days: count(daysAgo(6)), last30Days: count(daysAgo(29)) },
    bySubSource: [...bySub.entries()].map(([subSource, leads]) => ({ subSource, leads })).sort((a, b) => b.leads - a.leads).slice(0, 12),
    items,
  };
};
