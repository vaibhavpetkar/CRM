import { Op, fn, col } from 'sequelize';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import SiteVisit, { SITE_VISIT_STATUSES, SiteVisitStatus } from '../models/SiteVisit';
import Lead from '../models/Lead';
import Contact from '../models/Contact';
import User from '../models/User';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError';
import { logActivity } from './activityLogger';
import { userCan } from './callService';
import { getTeamPresence, PresenceState } from './presenceService';
import { formatIndianNumber, normalizeIndianNumber } from '../utils/indianPhone';
import { localDay, startOfLocalDay } from '../utils/reportTime';

// Sales-team reporting for the real-estate CRM: calls and site visits per
// sales person, where leads come from, and the full call log (call
// tracking). Every query goes through the models, so it is company-scoped.

const MAX_RANGE_DAYS = 366;

export { localDay };

/** from/to as YYYY-MM-DD local days (inclusive) -> UTC instants. Defaults to today. */
export const parseRange = (from?: unknown, to?: unknown) => {
  const today = localDay(new Date());
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  let fromDay = day(from) || day(to) || today;
  let toDay = day(to) || fromDay;
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const start = startOfLocalDay(fromDay);
  const end = startOfLocalDay(toDay, true);
  if ((end.getTime() - start.getTime()) / 86400000 > MAX_RANGE_DAYS) throw new ValidationError(`Pick a range of ${MAX_RANGE_DAYS} days or less.`);
  return { fromDay, toDay, start, end };
};

/** Every local day in the range, for charts with no gaps. */
const daysBetween = (fromDay: string, toDay: string) => {
  const out: string[] = [];
  for (let t = new Date(`${fromDay}T00:00:00Z`).getTime(); t <= new Date(`${toDay}T00:00:00Z`).getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

const fullName = (r?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) =>
  r ? `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.email || '' : '';

/** Managers (users:read) see the whole team; everyone else only themselves. */
const canSeeTeam = (user: any) => userCan(user, 'users:read');

const scopedUserId = (user: any, requested: unknown): number | null => {
  const id = Number(requested);
  const wanted = Number.isInteger(id) && id > 0 ? id : null;
  if (canSeeTeam(user)) return wanted;
  if (wanted && wanted !== user.id) throw new ForbiddenError('You can only see your own activity.');
  return user.id;
};

const MISSED: string[] = ['no-answer', 'busy', 'failed', 'canceled'];

// ─── Calls and visits per sales person ──────────────────────────────────────

export const getActivity = async (user: any, query: Record<string, unknown>, onlineUserIds: Set<number>) => {
  const { fromDay, toDay, start, end } = parseRange(query.from, query.to);
  const onlyUserId = scopedUserId(user, query.userId);
  const userWhere: any = { isActive: true };
  if (onlyUserId) userWhere.id = onlyUserId;

  const inRange = { [Op.gte]: start, [Op.lt]: end };
  const byUser = onlyUserId ? { userId: onlyUserId } : {};

  const [users, calls, visits, leads, presence] = await Promise.all([
    User.findAll({ where: userWhere, attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position'], order: [['firstName', 'ASC']] }),
    Call.findAll({ where: { ...byUser, createdAt: inRange } as any, attributes: ['userId', 'status', 'durationSeconds', 'createdAt'], raw: true }),
    SiteVisit.findAll({ where: { ...byUser, scheduledAt: inRange }, attributes: ['userId', 'status', 'scheduledAt'], raw: true }),
    Lead.findAll({
      where: { createdAt: inRange, ...(onlyUserId ? { assignedToId: onlyUserId } : {}) } as any,
      attributes: ['assignedToId', [fn('COUNT', col('id')), 'count']],
      group: ['assignedToId'],
      raw: true,
    }) as unknown as Promise<{ assignedToId: number | null; count: string }[]>,
    getTeamPresence(onlineUserIds),
  ]);

  const stateByUser = new Map<number, { state: PresenceState; since: Date | null; withName: string | null }>(
    presence.agents.map((a) => [a.userId, { state: a.state, since: a.since, withName: a.call?.withName || null }])
  );
  const leadsByUser = new Map(leads.map((l) => [Number(l.assignedToId), Number(l.count) || 0]));

  const blank = () => ({ calls: 0, connected: 0, missed: 0, talkSeconds: 0, visitsScheduled: 0, visitsCompleted: 0, visitsCancelled: 0 });
  const stats = new Map<number, ReturnType<typeof blank>>();
  const statFor = (id: number) => {
    if (!stats.has(id)) stats.set(id, blank());
    return stats.get(id)!;
  };
  const days = daysBetween(fromDay, toDay);
  const daily = new Map(days.map((d) => [d, { date: d, calls: 0, connected: 0, visits: 0 }]));

  for (const c of calls) {
    const s = statFor(Number(c.userId));
    s.calls += 1;
    if (c.status === 'completed') s.connected += 1;
    else if (MISSED.includes(c.status)) s.missed += 1;
    s.talkSeconds += Number(c.durationSeconds) || 0;
    const d = daily.get(localDay(new Date(c.createdAt as any)));
    if (d) {
      d.calls += 1;
      if (c.status === 'completed') d.connected += 1;
    }
  }
  for (const v of visits) {
    const s = statFor(Number(v.userId));
    if (v.status === 'completed') s.visitsCompleted += 1;
    else if (v.status === 'cancelled' || v.status === 'no-show') s.visitsCancelled += 1;
    else s.visitsScheduled += 1;
    const d = daily.get(localDay(new Date(v.scheduledAt as any)));
    if (d && (v.status === 'completed' || v.status === 'scheduled')) d.visits += 1;
  }

  const agents = users.map((u) => {
    const s = stats.get(u.id) || blank();
    const live = stateByUser.get(u.id);
    return {
      userId: u.id,
      name: fullName(u),
      department: u.department || null,
      position: u.position || null,
      state: live?.state || ('offline' as PresenceState),
      stateSince: live?.since || null,
      onCallWith: live?.state === 'on_call' ? live.withName : null,
      ...s,
      avgTalkSeconds: s.connected ? Math.round(s.talkSeconds / s.connected) : 0,
      leadsAssigned: leadsByUser.get(u.id) || 0,
    };
  });
  // Busiest first.
  agents.sort((a, b) => b.calls + b.visitsCompleted * 3 - (a.calls + a.visitsCompleted * 3) || a.name.localeCompare(b.name));

  const totals = agents.reduce(
    (t, a) => {
      t.calls += a.calls;
      t.connected += a.connected;
      t.missed += a.missed;
      t.talkSeconds += a.talkSeconds;
      t.visitsScheduled += a.visitsScheduled;
      t.visitsCompleted += a.visitsCompleted;
      t.leadsAssigned += a.leadsAssigned;
      return t;
    },
    { calls: 0, connected: 0, missed: 0, talkSeconds: 0, visitsScheduled: 0, visitsCompleted: 0, leadsAssigned: 0 }
  );

  return {
    from: fromDay,
    to: toDay,
    canSeeTeam: canSeeTeam(user),
    totals: { ...totals, onCall: agents.filter((a) => a.state === 'on_call').length, online: agents.filter((a) => a.state !== 'offline').length },
    agents,
    daily: [...daily.values()],
  };
};

// ─── Lead sources ───────────────────────────────────────────────────────────

const WON = ['converted'];
const QUALIFIED = ['qualified', 'converted'];

export const getLeadSources = async (query: Record<string, unknown>) => {
  const { fromDay, toDay, start, end } = parseRange(query.from, query.to);
  const rows = (await Lead.findAll({
    where: { createdAt: { [Op.gte]: start, [Op.lt]: end } } as any,
    attributes: ['leadSource', 'status', 'createdAt', 'assignedToId', 'isConverted'],
    raw: true,
  })) as unknown as { leadSource: string | null; status: string; createdAt: Date; assignedToId: number | null; isConverted: boolean }[];

  const days = daysBetween(fromDay, toDay);
  const sources = new Map<string, { source: string; total: number; qualified: number; converted: number; lost: number; unassigned: number; daily: Record<string, number> }>();
  const totalsByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));

  for (const r of rows) {
    const key = (r.leadSource || 'unknown').toLowerCase();
    if (!sources.has(key)) sources.set(key, { source: key, total: 0, qualified: 0, converted: 0, lost: 0, unassigned: 0, daily: {} });
    const s = sources.get(key)!;
    s.total += 1;
    if (QUALIFIED.includes(r.status) || r.isConverted) s.qualified += 1;
    if (WON.includes(r.status) || r.isConverted) s.converted += 1;
    if (r.status === 'lost') s.lost += 1;
    if (!r.assignedToId) s.unassigned += 1;
    const day = localDay(new Date(r.createdAt));
    s.daily[day] = (s.daily[day] || 0) + 1;
    if (day in totalsByDay) totalsByDay[day] += 1;
  }

  const bySource = [...sources.values()]
    .map((s) => ({
      ...s,
      share: rows.length ? Math.round((s.total / rows.length) * 1000) / 10 : 0,
      conversionRate: s.total ? Math.round((s.converted / s.total) * 1000) / 10 : 0,
      daily: days.map((d) => s.daily[d] || 0),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    from: fromDay,
    to: toDay,
    total: rows.length,
    days,
    bySource,
    daily: days.map((d) => ({ date: d, leads: totalsByDay[d] })),
  };
};

// ─── Call tracking (call log) ───────────────────────────────────────────────

export const listCallLog = async (user: any, query: Record<string, unknown>) => {
  const { fromDay, toDay, start, end } = parseRange(query.from, query.to);
  const onlyUserId = scopedUserId(user, query.userId);
  const where: any = { createdAt: { [Op.gte]: start, [Op.lt]: end } };
  if (onlyUserId) where.userId = onlyUserId;

  const status = String(query.status || '');
  if (status === 'connected') where.status = 'completed';
  else if (status === 'missed') where.status = { [Op.in]: MISSED };
  else if (status === 'live') where.status = { [Op.notIn]: TERMINAL_CALL_STATUSES };
  else if (status && status !== 'all') where.status = status;

  const number = normalizeIndianNumber(String(query.number || ''));
  if (number) where.customerNumber = number;

  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(query.limit || 50), 10) || 50));

  const { rows, count } = await Call.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit });

  const userIds = [...new Set(rows.map((c) => c.userId))];
  const leadIds = [...new Set(rows.map((c) => c.leadId).filter((id): id is number => !!id))];
  const contactIds = [...new Set(rows.map((c) => c.contactId).filter((id): id is number => !!id))];
  const [users, leads, contacts] = await Promise.all([
    userIds.length ? User.findAll({ where: { id: userIds }, attributes: ['id', 'firstName', 'lastName', 'email'] }) : [],
    leadIds.length ? Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'firstName', 'lastName', 'leadNumber', 'configuration', 'preferredLocation'] }) : [],
    contactIds.length ? Contact.findAll({ where: { id: contactIds }, attributes: ['id', 'firstName', 'lastName'] }) : [],
  ]);
  const userNames = new Map(users.map((u) => [u.id, fullName(u)]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const contactNames = new Map(contacts.map((c) => [c.id, fullName(c)]));

  return {
    from: fromDay,
    to: toDay,
    total: count,
    page,
    pages: Math.max(1, Math.ceil(count / limit)),
    calls: rows.map((c) => {
      const lead = c.leadId ? leadById.get(c.leadId) : null;
      return {
        id: c.id,
        provider: c.provider,
        status: c.status,
        isLive: !(TERMINAL_CALL_STATUSES as string[]).includes(c.status),
        userId: c.userId,
        agentName: userNames.get(c.userId) || null,
        leadId: c.leadId,
        contactId: c.contactId,
        withName: lead ? fullName(lead) : c.contactId ? contactNames.get(c.contactId) || null : null,
        leadNumber: lead?.leadNumber || null,
        requirement: lead ? [lead.configuration, lead.preferredLocation].filter(Boolean).join(' · ') || null : null,
        customerNumber: formatIndianNumber(c.customerNumber),
        callerId: c.callerId ? formatIndianNumber(c.callerId) : null,
        durationSeconds: c.durationSeconds,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        createdAt: c.createdAt,
        notes: c.notes || '',
        hasRecording: !!c.recordingFile || (c.status === 'completed' && !!c.recordingUrl),
        error: c.error,
      };
    }),
  };
};

// ─── Site visits ────────────────────────────────────────────────────────────

const serializeVisit = (v: SiteVisit, names: { agents: Map<number, string>; leads: Map<number, Lead> }) => {
  const lead = v.leadId ? names.leads.get(v.leadId) : null;
  return {
    id: v.id,
    leadId: v.leadId,
    leadName: lead ? fullName(lead) : null,
    leadNumber: lead?.leadNumber || null,
    leadMobile: lead?.mobile || null,
    userId: v.userId,
    agentName: names.agents.get(v.userId) || null,
    scheduledAt: v.scheduledAt,
    status: v.status,
    projectName: v.projectName || null,
    location: v.location || null,
    notes: v.notes || '',
    completedAt: v.completedAt,
    createdAt: v.createdAt,
  };
};

const lookups = async (visits: SiteVisit[]) => {
  const userIds = [...new Set(visits.map((v) => v.userId))];
  const leadIds = [...new Set(visits.map((v) => v.leadId).filter((id): id is number => !!id))];
  const [users, leads] = await Promise.all([
    userIds.length ? User.findAll({ where: { id: userIds }, attributes: ['id', 'firstName', 'lastName', 'email'] }) : [],
    leadIds.length ? Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'firstName', 'lastName', 'leadNumber', 'mobile'] }) : [],
  ]);
  return { agents: new Map(users.map((u) => [u.id, fullName(u)])), leads: new Map(leads.map((l) => [l.id, l])) };
};

export const listVisits = async (user: any, query: Record<string, unknown>) => {
  if (!userCan(user, 'leads:read')) throw new ForbiddenError();
  const where: any = {};
  const leadId = Number(query.leadId);
  if (Number.isInteger(leadId) && leadId > 0) {
    // A lead's own visits are visible to anyone who can see the lead.
    where.leadId = leadId;
    const userId = Number(query.userId);
    if (Number.isInteger(userId) && userId > 0) where.userId = userId;
  } else {
    const { start, end } = parseRange(query.from, query.to);
    where.scheduledAt = { [Op.gte]: start, [Op.lt]: end };
    const onlyUserId = scopedUserId(user, query.userId);
    if (onlyUserId) where.userId = onlyUserId;
  }
  const status = String(query.status || '');
  if ((SITE_VISIT_STATUSES as string[]).includes(status)) where.status = status;

  const visits = await SiteVisit.findAll({ where, order: [['scheduledAt', 'DESC']], limit: 500 });
  const names = await lookups(visits);
  return { visits: visits.map((v) => serializeVisit(v, names)) };
};

const validStatus = (value: unknown): SiteVisitStatus | undefined => {
  if (value === undefined) return undefined;
  if (!(SITE_VISIT_STATUSES as string[]).includes(String(value))) throw new ValidationError('Status must be scheduled, completed, cancelled or no-show.');
  return value as SiteVisitStatus;
};

const validDate = (value: unknown) => {
  const d = new Date(String(value || ''));
  if (!value || Number.isNaN(d.getTime())) throw new ValidationError('Pick the visit date and time.');
  return d;
};

const text = (value: unknown, max: number) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return String(value).slice(0, max);
};

/** Who the visit belongs to: managers can pick anyone active, others only themselves. */
const resolveAgent = async (user: any, requested: unknown) => {
  const id = Number(requested);
  if (!requested || !Number.isInteger(id) || id <= 0 || id === user.id) return user.id;
  if (!canSeeTeam(user)) throw new ForbiddenError('You can only log your own site visits.');
  const agent = await User.findOne({ where: { id, isActive: true }, attributes: ['id'] });
  if (!agent) throw new ValidationError('That sales person was not found.');
  return id;
};

const visitLabel = (v: SiteVisit) => `${v.projectName ? ` to ${v.projectName}` : ''}${v.location ? ` (${v.location})` : ''}`;

export const createVisit = async (user: any, body: Record<string, any>) => {
  if (!userCan(user, 'leads:update')) throw new ForbiddenError();
  const leadId = Number(body.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) throw new ValidationError('Choose the lead for this visit.');
  const lead = await Lead.findByPk(leadId, { attributes: ['id', 'projectName', 'preferredLocation'] });
  if (!lead) throw new NotFoundError('Lead', leadId);
  const status = validStatus(body.status) || 'scheduled';
  const visit = await SiteVisit.create({
    leadId,
    userId: await resolveAgent(user, body.userId),
    scheduledAt: validDate(body.scheduledAt),
    status,
    projectName: text(body.projectName, 255) ?? lead.projectName ?? null,
    location: text(body.location, 255) ?? lead.preferredLocation ?? null,
    notes: text(body.notes, 5000) ?? null,
    completedAt: status === 'completed' ? new Date() : null,
    createdById: user.id,
  });
  await logActivity({
    action: 'meeting_logged',
    entityType: 'Lead',
    entityId: leadId,
    performedById: user.id,
    details: `Site visit${visitLabel(visit)} ${status === 'completed' ? 'done' : 'scheduled'} for ${new Date(visit.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`,
  }).catch(() => {});
  return serializeVisit(visit, await lookups([visit]));
};

export const updateVisit = async (user: any, id: number, body: Record<string, any>) => {
  if (!userCan(user, 'leads:update')) throw new ForbiddenError();
  const visit = await SiteVisit.findByPk(id);
  if (!visit) throw new NotFoundError('Site visit', id);
  if (visit.userId !== user.id && !canSeeTeam(user)) throw new ForbiddenError('You can only change your own site visits.');
  const before = visit.status;
  const changes: Record<string, unknown> = {};
  const status = validStatus(body.status);
  if (status) {
    changes.status = status;
    changes.completedAt = status === 'completed' ? visit.completedAt || new Date() : null;
  }
  if (body.scheduledAt !== undefined) changes.scheduledAt = validDate(body.scheduledAt);
  if (body.userId !== undefined) changes.userId = await resolveAgent(user, body.userId);
  for (const [field, max] of [['projectName', 255], ['location', 255], ['notes', 5000]] as const) {
    const value = text(body[field], max);
    if (value !== undefined) changes[field] = value;
  }
  await visit.update(changes);
  if (status && status !== before && visit.leadId) {
    await logActivity({
      action: 'meeting_logged',
      entityType: 'Lead',
      entityId: visit.leadId,
      performedById: user.id,
      details: `Site visit${visitLabel(visit)} marked ${status}.${visit.notes ? ` Feedback: ${visit.notes.slice(0, 300)}` : ''}`,
    }).catch(() => {});
  }
  return serializeVisit(visit, await lookups([visit]));
};

export const deleteVisit = async (user: any, id: number) => {
  if (!userCan(user, 'leads:update')) throw new ForbiddenError();
  const visit = await SiteVisit.findByPk(id);
  if (!visit) throw new NotFoundError('Site visit', id);
  if (visit.userId !== user.id && !canSeeTeam(user)) throw new ForbiddenError('You can only remove your own site visits.');
  await visit.destroy();
  return { deleted: true };
};
