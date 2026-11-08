import { notifyLeadTeam, leadLabel } from '../utils/notificationService';
import { Op, fn, col } from 'sequelize';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import SiteVisit, { DONE_VISIT_STATUSES, SITE_VISIT_STATUSES, SiteVisitStatus } from '../models/SiteVisit';
import Lead from '../models/Lead';
import LeadFollowUp from '../models/LeadFollowUp';
import LeadNote from '../models/LeadNote';
import { notesActivity } from './leadNoteService';
import ActivityLog from '../models/ActivityLog';
import UserActiveDay from '../models/UserActiveDay';
import Contact from '../models/Contact';
import User from '../models/User';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError';
import { logActivity } from './activityLogger';
import { userCan } from './callService';
import { getTeamPresence, PresenceState } from './presenceService';
import { formatIndianNumber, normalizeIndianNumber } from '../utils/indianPhone';
import { localDay, startOfLocalDay } from '../utils/reportTime';
import { DEAD_LEAD_STATUSES, ENGAGED_LEAD_STATUSES } from '../validations/leadValidation';

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

/** People with sales:team see the whole team; everyone else only themselves. */
const canSeeTeam = (user: any) => userCan(user, 'sales:team');

const scopedUserId = (user: any, requested: unknown): number | null => {
  const id = Number(requested);
  const wanted = Number.isInteger(id) && id > 0 ? id : null;
  if (canSeeTeam(user)) return wanted;
  if (wanted && wanted !== user.id) throw new ForbiddenError('You can only see your own activity.');
  return user.id;
};

const MISSED: string[] = ['no-answer', 'busy', 'failed', 'canceled'];

// ─── Calls and visits per sales person ──────────────────────────────────────

/** Things a person did on leads (edits, status changes, notes, conversions). */
const leadWorkLogs = (start: Date, end: Date, onlyUserId: number | null) =>
  ActivityLog.findAll({
    where: {
      entityType: 'Lead',
      action: { [Op.ne]: 'deleted' },
      performedById: onlyUserId || { [Op.ne]: null },
      createdAt: { [Op.gte]: start, [Op.lt]: end },
    } as any,
    attributes: ['performedById', 'entityId', 'action', 'createdAt'],
    raw: true,
  }) as unknown as Promise<{ performedById: number; entityId: number; action: string; createdAt: Date }[]>;

/** Calls and distinct leads worked per person in one window (used for "today"). */
const todayWorkByUser = async (start: Date, end: Date, onlyUserId: number | null) => {
  const range = { [Op.gte]: start, [Op.lt]: end };
  const [calls, logs, followUps] = await Promise.all([
    Call.findAll({ where: { ...(onlyUserId ? { userId: onlyUserId } : {}), createdAt: range } as any, attributes: ['userId', 'leadId', 'status'], raw: true }),
    leadWorkLogs(start, end, onlyUserId),
    LeadFollowUp.findAll({ where: { createdAt: range, createdById: onlyUserId || { [Op.ne]: null } } as any, attributes: ['createdById', 'leadId'], raw: true }),
  ]);
  const out = new Map<number, { calls: number; connected: number; leadSet: Set<number>; leads: number }>();
  const get = (id: number) => {
    if (!out.has(id)) out.set(id, { calls: 0, connected: 0, leadSet: new Set(), leads: 0 });
    return out.get(id)!;
  };
  for (const c of calls as any[]) {
    const s = get(Number(c.userId));
    s.calls += 1;
    if (c.status === 'completed') s.connected += 1;
    if (c.leadId) s.leadSet.add(Number(c.leadId));
  }
  for (const l of logs) get(Number(l.performedById)).leadSet.add(Number(l.entityId));
  for (const f of followUps as any[]) get(Number(f.createdById)).leadSet.add(Number(f.leadId));
  for (const s of out.values()) s.leads = s.leadSet.size;
  return out;
};

/** Open leads per assignee whose next follow-up falls in `when`. */
const followUpCounts = async (when: Record<symbol, Date>, status: Record<symbol, string[]>, onlyUserId: number | null) => {
  const rows = (await Lead.findAll({
    where: { nextFollowUp: when, status, assignedToId: onlyUserId || { [Op.ne]: null } } as any,
    attributes: ['assignedToId', [fn('COUNT', col('id')), 'count']],
    group: ['assignedToId'],
    raw: true,
  })) as unknown as { assignedToId: number; count: string }[];
  return new Map(rows.map((r) => [Number(r.assignedToId), Number(r.count) || 0]));
};

export const getActivity = async (user: any, query: Record<string, unknown>, onlineUserIds: Set<number>) => {
  if (!userCan(user, 'sales:view')) throw new ForbiddenError();
  const { fromDay, toDay, start, end } = parseRange(query.from, query.to);
  const onlyUserId = scopedUserId(user, query.userId);
  const userWhere: any = { isActive: true };
  if (onlyUserId) userWhere.id = onlyUserId;

  const inRange = { [Op.gte]: start, [Op.lt]: end };
  const byUser = onlyUserId ? { userId: onlyUserId } : {};

  const today = localDay(new Date());
  const todayStart = startOfLocalDay(today);
  const todayEnd = startOfLocalDay(today, true);
  const now = new Date();
  const notClosed = { [Op.notIn]: [...DEAD_LEAD_STATUSES, ...WON] };

  const [users, calls, visits, leads, presence, logs, followUps, todayWork, overdue, dueToday, activeDays] = await Promise.all([
    User.findAll({ where: userWhere, attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position'], order: [['firstName', 'ASC']] }),
    Call.findAll({ where: { ...byUser, createdAt: inRange } as any, attributes: ['userId', 'leadId', 'status', 'direction', 'durationSeconds', 'createdAt'], raw: true }),
    SiteVisit.findAll({ where: { ...byUser, scheduledAt: inRange }, attributes: ['userId', 'leadId', 'status', 'scheduledAt'], raw: true }),
    Lead.findAll({
      where: { createdAt: inRange, ...(onlyUserId ? { assignedToId: onlyUserId } : {}) } as any,
      attributes: ['assignedToId', [fn('COUNT', col('id')), 'count']],
      group: ['assignedToId'],
      raw: true,
    }) as unknown as Promise<{ assignedToId: number | null; count: string }[]>,
    getTeamPresence(onlineUserIds),
    leadWorkLogs(start, end, onlyUserId),
    LeadFollowUp.findAll({
      where: { createdAt: inRange, createdById: onlyUserId || { [Op.ne]: null } } as any,
      attributes: ['createdById', 'leadId', 'createdAt'],
      raw: true,
    }),
    // "Today" numbers stay on the card whatever range is picked.
    fromDay === today && toDay === today ? null : todayWorkByUser(todayStart, todayEnd, onlyUserId),
    followUpCounts({ [Op.lt]: now }, notClosed, onlyUserId),
    followUpCounts({ [Op.gte]: now, [Op.lt]: todayEnd }, notClosed, onlyUserId),
    UserActiveDay.findAll({
      where: {
        [Op.or]: [{ day: { [Op.gte]: fromDay, [Op.lte]: toDay } }, { day: today }],
        ...(onlyUserId ? { userId: onlyUserId } : {}),
      } as any,
      attributes: ['userId', 'day', 'activeMinutes', 'firstSeenAt', 'lastSeenAt'],
      raw: true,
    }),
  ]);
  const active = new Map<number, { minutes: number; today: number; firstLogin: Date | null; lastSeen: Date | null }>();
  for (const r of activeDays as any[]) {
    const a = active.get(Number(r.userId)) || { minutes: 0, today: 0, firstLogin: null, lastSeen: null };
    if (r.day === today) a.today = Number(r.activeMinutes) || 0;
    active.set(Number(r.userId), a);
    if (r.day < fromDay || r.day > toDay) continue;
    a.minutes += Number(r.activeMinutes) || 0;
    const first = new Date(r.firstSeenAt);
    const last = new Date(r.lastSeenAt);
    if (!a.firstLogin || first < a.firstLogin) a.firstLogin = first;
    if (!a.lastSeen || last > a.lastSeen) a.lastSeen = last;
  }

  const stateByUser = new Map<number, { state: PresenceState; since: Date | null; withName: string | null }>(
    presence.agents.map((a) => [a.userId, { state: a.state, since: a.since, withName: a.call?.withName || null }])
  );
  const leadsByUser = new Map(leads.map((l) => [Number(l.assignedToId), Number(l.count) || 0]));

  const blank = () => ({
    calls: 0,
    incoming: 0,
    connected: 0,
    missed: 0,
    talkSeconds: 0,
    longestCallSeconds: 0,
    visitsScheduled: 0,
    visitsCompleted: 0,
    visitsCancelled: 0,
    followUpsDone: 0,
    notesWritten: 0,
    statusChanges: 0,
    conversions: 0,
    leadsCreated: 0,
    leadsUpdated: 0,
  });
  // Per person: the leads they touched, the leads they called, the days they
  // worked and their first/last action in the range.
  const work = new Map<number, { leads: Set<number>; called: Set<number>; days: Set<string>; first: number; last: number }>();
  const workFor = (id: number) => {
    if (!work.has(id)) work.set(id, { leads: new Set(), called: new Set(), days: new Set(), first: Infinity, last: 0 });
    return work.get(id)!;
  };
  const dailyLeads = new Map<string, Set<number>>();
  const touch = (userId: number, leadId: number | null | undefined, at: Date | string, opts: { called?: boolean; activity?: boolean } = {}) => {
    const w = workFor(userId);
    const day = localDay(new Date(at));
    if (leadId) {
      w.leads.add(Number(leadId));
      if (opts.called) w.called.add(Number(leadId));
      if (!dailyLeads.has(day)) dailyLeads.set(day, new Set());
      dailyLeads.get(day)!.add(Number(leadId));
    }
    if (opts.activity !== false) {
      const t = new Date(at).getTime();
      w.days.add(day);
      if (t < w.first) w.first = t;
      if (t > w.last) w.last = t;
    }
  };
  const stats = new Map<number, ReturnType<typeof blank>>();
  const statFor = (id: number) => {
    if (!stats.has(id)) stats.set(id, blank());
    return stats.get(id)!;
  };
  const days = daysBetween(fromDay, toDay);
  const daily = new Map(days.map((d) => [d, { date: d, calls: 0, connected: 0, visits: 0, leadsWorked: 0 }]));

  for (const c of calls) {
    const s = statFor(Number(c.userId));
    s.calls += 1;
    if ((c as any).direction === 'inbound') s.incoming += 1;
    if (c.status === 'completed') s.connected += 1;
    else if (MISSED.includes(c.status)) s.missed += 1;
    const secs = Number(c.durationSeconds) || 0;
    s.talkSeconds += secs;
    if (secs > s.longestCallSeconds) s.longestCallSeconds = secs;
    touch(Number(c.userId), (c as any).leadId, c.createdAt as any, { called: true });
    const d = daily.get(localDay(new Date(c.createdAt as any)));
    if (d) {
      d.calls += 1;
      if (c.status === 'completed') d.connected += 1;
    }
  }
  for (const v of visits) {
    const s = statFor(Number(v.userId));
    if (DONE_VISIT_STATUSES.includes(v.status as SiteVisitStatus)) s.visitsCompleted += 1;
    else if (v.status === 'cancelled' || v.status === 'no-show') s.visitsCancelled += 1;
    else s.visitsScheduled += 1;
    // A visit's lead counts as worked, but a visit booked for later is not
    // the person being active at that time.
    touch(Number(v.userId), (v as any).leadId, v.scheduledAt as any, { activity: false });
    const d = daily.get(localDay(new Date(v.scheduledAt as any)));
    if (d && (DONE_VISIT_STATUSES.includes(v.status as SiteVisitStatus) || v.status === 'scheduled')) d.visits += 1;
  }

  for (const f of followUps as any[]) {
    statFor(Number(f.createdById)).followUpsDone += 1;
    touch(Number(f.createdById), f.leadId, f.createdAt);
  }
  // Call notes, counted on the day written on them (imported ones too).
  const notes = (await LeadNote.findAll({
    where: { noteDate: { [Op.gte]: fromDay, [Op.lte]: toDay }, userId: onlyUserId || { [Op.ne]: null } } as any,
    attributes: ['userId', 'leadId', 'noteDate', 'source', 'createdAt'],
    raw: true,
  })) as unknown as { userId: number; leadId: number; noteDate: string; source: string; createdAt: Date }[];
  const notedLeads = new Map<number, Set<number>>();
  for (const n of notes) {
    statFor(Number(n.userId)).notesWritten += 1;
    if (!notedLeads.has(n.userId)) notedLeads.set(n.userId, new Set());
    notedLeads.get(n.userId)!.add(n.leadId);
    // A note typed in the CRM is work done at that moment; an imported one isn't.
    if (n.source === 'manual') touch(Number(n.userId), n.leadId, n.createdAt);
  }
  for (const l of logs) {
    const s = statFor(Number(l.performedById));
    if (l.action === 'status_changed') s.statusChanges += 1;
    if (l.action === 'converted') s.conversions += 1;
    if (l.action === 'created') s.leadsCreated += 1;
    if (l.action === 'updated') s.leadsUpdated += 1;
    touch(Number(l.performedById), l.entityId, l.createdAt);
  }
  for (const [day, set] of dailyLeads) {
    const d = daily.get(day);
    if (d) d.leadsWorked = set.size;
  }

  const rangeDays = days.length;
  const agents = users.map((u) => {
    const s = stats.get(u.id) || blank();
    const w = work.get(u.id);
    const live = stateByUser.get(u.id);
    const todayStats = todayWork ? todayWork.get(u.id) : null;
    const activeDays = w?.days.size || 0;
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
      connectRate: s.calls ? Math.round((s.connected / s.calls) * 100) : 0,
      leadsAssigned: leadsByUser.get(u.id) || 0,
      leadsWorked: w?.leads.size || 0,
      leadsCalled: w?.called.size || 0,
      leadsNoted: notedLeads.get(u.id)?.size || 0,
      activeDays,
      avgCallsPerDay: Math.round((s.calls / Math.max(1, activeDays || rangeDays)) * 10) / 10,
      firstActivityAt: w && Number.isFinite(w.first) ? new Date(w.first) : null,
      lastActivityAt: w && w.last ? new Date(w.last) : null,
      activeMinutes: active.get(u.id)?.minutes || 0,
      activeMinutesToday: active.get(u.id)?.today ?? 0,
      firstSeenAt: active.get(u.id)?.firstLogin || null,
      lastSeenAt: active.get(u.id)?.lastSeen || null,
      followUpsOverdue: overdue.get(u.id) || 0,
      followUpsDueToday: dueToday.get(u.id) || 0,
      // Same as the range numbers when the range is today.
      callsToday: todayStats ? todayStats.calls : s.calls,
      connectedToday: todayStats ? todayStats.connected : s.connected,
      leadsWorkedToday: todayStats ? todayStats.leads : w?.leads.size || 0,
    };
  });
  // Busiest first.
  agents.sort((a, b) => b.calls + b.visitsCompleted * 3 - (a.calls + a.visitsCompleted * 3) || a.name.localeCompare(b.name));

  const totals = agents.reduce(
    (t, a) => {
      t.calls += a.calls;
      t.incoming += a.incoming;
      t.connected += a.connected;
      t.missed += a.missed;
      t.talkSeconds += a.talkSeconds;
      t.visitsScheduled += a.visitsScheduled;
      t.visitsCompleted += a.visitsCompleted;
      t.leadsAssigned += a.leadsAssigned;
      t.followUpsDone += a.followUpsDone;
      t.notesWritten += a.notesWritten;
      t.followUpsOverdue += a.followUpsOverdue;
      t.statusChanges += a.statusChanges;
      t.conversions += a.conversions;
      t.callsToday += a.callsToday;
      t.leadsCreated += a.leadsCreated;
      t.leadsUpdated += a.leadsUpdated;
      t.activeMinutes += a.activeMinutes;
      return t;
    },
    {
      calls: 0,
      incoming: 0,
      connected: 0,
      missed: 0,
      talkSeconds: 0,
      visitsScheduled: 0,
      visitsCompleted: 0,
      leadsAssigned: 0,
      followUpsDone: 0,
      notesWritten: 0,
      followUpsOverdue: 0,
      statusChanges: 0,
      conversions: 0,
      callsToday: 0,
      leadsCreated: 0,
      leadsUpdated: 0,
      activeMinutes: 0,
    }
  );
  // Leads touched by anyone, counted once even when two people worked on one.
  const allLeads = new Set<number>();
  for (const w of work.values()) for (const id of w.leads) allLeads.add(id);

  return {
    from: fromDay,
    to: toDay,
    canSeeTeam: canSeeTeam(user),
    days: rangeDays,
    totals: {
      ...totals,
      leadsWorked: allLeads.size,
      avgTalkSeconds: totals.connected ? Math.round(totals.talkSeconds / totals.connected) : 0,
      onCall: agents.filter((a) => a.state === 'on_call').length, online: agents.filter((a) => a.state !== 'offline').length },
    agents,
    daily: [...daily.values()],
  };
};

/**
 * GET /api/sales/notes: call notes per sales person in the range, and with
 * ?person=u:<userId> or n:<NAME> that person's notes on each lead. People
 * without sales:team only see their own.
 */
export const getNotesActivity = async (user: any, query: Record<string, unknown>) => {
  const range = parseRange(query.from, query.to);
  const onlyUserId = scopedUserId(user, query.userId);
  let person = typeof query.person === 'string' && /^(u:\d+|n:.{1,100})$/.test(query.person) ? query.person : null;
  if (person && !canSeeTeam(user) && person !== `u:${user.id}`) throw new ForbiddenError('You can only see your own notes.');
  if (!person && !canSeeTeam(user)) person = `u:${user.id}`;
  return { canSeeTeam: canSeeTeam(user), ...(await notesActivity(range, onlyUserId, { listFor: person, limit: 1000 })) };
};

// ─── Lead sources ───────────────────────────────────────────────────────────

const WON = ['converted'];
const QUALIFIED = ENGAGED_LEAD_STATUSES;

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
    if (DEAD_LEAD_STATUSES.includes(r.status)) s.lost += 1;
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
  if (!userCan(user, 'sales:view')) throw new ForbiddenError();
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

  const direction = String(query.direction || '');
  if (direction === 'inbound' || direction === 'outbound') where.direction = direction;

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
        direction: c.direction || 'outbound',
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
  if (!userCan(user, 'site_visits:read')) throw new ForbiddenError();
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

  // The page shows the latest 500; Export asks for up to 10,000.
  const limit = Math.min(10000, Math.max(1, parseInt(String(query.limit || 500), 10) || 500));
  if (limit > 500 && !userCan(user, 'site_visits:export')) throw new ForbiddenError('You are not allowed to export site visits.');
  const visits = await SiteVisit.findAll({ where, order: [['scheduledAt', 'DESC']], limit });
  const names = await lookups(visits);
  return { visits: visits.map((v) => serializeVisit(v, names)) };
};

const validStatus = (value: unknown): SiteVisitStatus | undefined => {
  if (value === undefined) return undefined;
  if (!(SITE_VISIT_STATUSES as string[]).includes(String(value))) throw new ValidationError(`Status must be one of: ${SITE_VISIT_STATUSES.join(', ')}.`);
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
  if (!userCan(user, 'site_visits:create')) throw new ForbiddenError();
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
    completedAt: DONE_VISIT_STATUSES.includes(status as SiteVisitStatus) ? new Date() : null,
    createdById: user.id,
  });
  await logActivity({
    action: 'meeting_logged',
    entityType: 'Lead',
    entityId: leadId,
    performedById: user.id,
    details: `Site visit${visitLabel(visit)} ${status === 'revisit-done' ? 'revisit done' : status === 'completed' ? 'done' : 'scheduled'} for ${new Date(visit.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`,
  }).catch(() => {});
  if (status === 'scheduled') {
    const full = await Lead.findByPk(leadId, { attributes: ['firstName', 'lastName', 'mobile', 'leadNumber'] });
    const when = new Date(visit.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const name = full ? leadLabel(full) : `lead #${leadId}`;
    await notifyLeadTeam({
      type: 'site_visit',
      title: 'Site visit scheduled',
      message: `Site visit${visitLabel(visit)} with ${name} on ${when}.`,
      leadId,
      people: [visit.userId],
      personalTitle: 'Site visit scheduled for you',
      actorId: user.id,
    });
  }
  return serializeVisit(visit, await lookups([visit]));
};

export const updateVisit = async (user: any, id: number, body: Record<string, any>) => {
  if (!userCan(user, 'site_visits:update')) throw new ForbiddenError();
  const visit = await SiteVisit.findByPk(id);
  if (!visit) throw new NotFoundError('Site visit', id);
  if (visit.userId !== user.id && !canSeeTeam(user)) throw new ForbiddenError('You can only change your own site visits.');
  const before = visit.status;
  const changes: Record<string, unknown> = {};
  const status = validStatus(body.status);
  if (status) {
    changes.status = status;
    changes.completedAt = DONE_VISIT_STATUSES.includes(status as SiteVisitStatus) ? visit.completedAt || new Date() : null;
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
  if (!userCan(user, 'site_visits:delete')) throw new ForbiddenError();
  const visit = await SiteVisit.findByPk(id);
  if (!visit) throw new NotFoundError('Site visit', id);
  if (visit.userId !== user.id && !canSeeTeam(user)) throw new ForbiddenError('You can only remove your own site visits.');
  await visit.destroy();
  return { deleted: true };
};

// ─── Time active in the CRM ─────────────────────────────────────────────────

// Heartbeats arrive once a minute; closer ones (two open tabs) add nothing.
const MIN_HEARTBEAT_GAP_MS = 50 * 1000;

/** One minute of the person using the CRM. */
export const recordHeartbeat = async (user: any) => {
  const now = new Date();
  const day = localDay(now);
  const [row, created] = await UserActiveDay.findOrCreate({
    where: { userId: user.id, day },
    defaults: { userId: user.id, day, activeMinutes: 1, firstSeenAt: now, lastSeenAt: now },
  });
  if (!created && now.getTime() - new Date(row.lastSeenAt).getTime() >= MIN_HEARTBEAT_GAP_MS) {
    await row.update({ activeMinutes: row.activeMinutes + 1, lastSeenAt: now });
  }
  return { ok: true };
};
