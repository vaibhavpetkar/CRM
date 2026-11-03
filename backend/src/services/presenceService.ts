import { fn, col, Op } from 'sequelize';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import Lead from '../models/Lead';
import Contact from '../models/Contact';
import User from '../models/User';
import Role from '../models/Role';
import { formatIndianNumber } from '../utils/indianPhone';

// Live sales-team status for managers (Team page). Nothing is stored for it:
// each agent's state is worked out from two things we already have, whether
// they have the CRM open (a live socket, see realtime/presence.ts) and their
// calls in the `calls` table.
export type PresenceState = 'on_call' | 'after_call' | 'available' | 'offline';

// How long an agent stays in "After call work" once a call ends, to write
// notes and update the lead. Starting another call ends it early.
export const afterCallSeconds = () => {
  const n = Number(process.env.PRESENCE_AFTER_CALL_SECONDS);
  return Number.isFinite(n) && n >= 0 ? n : 120;
};

// A call that never got its final webhook or poll stops counting as live
// after this, so nobody shows "On call" forever.
const STALE_CALL_MS = 4 * 3600 * 1000;

export interface PresenceInput {
  online: boolean;
  activeCallSince?: Date | null; // when the agent's current call started, if any
  lastCallEndedAt?: Date | null; // when their most recent finished call ended
  now?: Date;
  afterCallSeconds?: number;
}

/** One agent's state. A live call wins over everything, then wrap-up time, then whether the CRM is open. */
export const derivePresence = (input: PresenceInput): { state: PresenceState; since: Date | null } => {
  const now = input.now || new Date();
  if (input.activeCallSince) return { state: 'on_call', since: input.activeCallSince };
  const window = (input.afterCallSeconds ?? afterCallSeconds()) * 1000;
  if (input.lastCallEndedAt && now.getTime() - input.lastCallEndedAt.getTime() < window) {
    return { state: 'after_call', since: input.lastCallEndedAt };
  }
  return { state: input.online ? 'available' : 'offline', since: null };
};

const STATE_ORDER: Record<PresenceState, number> = { on_call: 0, after_call: 1, available: 2, offline: 3 };

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Every active team member of the current company with their live state.
 * Runs inside the request's tenant context, so every query is company-scoped.
 */
export const getTeamPresence = async (onlineUserIds: Set<number>) => {
  const now = new Date();
  const acw = afterCallSeconds();

  const [users, liveCalls, recentCalls, todayTotals] = await Promise.all([
    User.findAll({
      where: { isActive: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position', 'lastLogin'],
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
    }),
    Call.findAll({
      where: { status: { [Op.notIn]: TERMINAL_CALL_STATUSES }, createdAt: { [Op.gte]: new Date(now.getTime() - STALE_CALL_MS) } } as any,
      order: [['createdAt', 'DESC']],
    }),
    Call.findAll({
      where: { status: { [Op.in]: TERMINAL_CALL_STATUSES }, endedAt: { [Op.gte]: new Date(now.getTime() - acw * 1000) } },
      attributes: ['userId', 'endedAt'],
      order: [['endedAt', 'DESC']],
    }),
    Call.findAll({
      where: { createdAt: { [Op.gte]: startOfToday() } } as any,
      attributes: [
        'userId',
        [fn('COUNT', col('id')), 'calls'],
        [fn('SUM', col('durationSeconds')), 'talkSeconds'],
      ],
      group: ['userId'],
      raw: true,
    }) as unknown as Promise<{ userId: number; calls: string; talkSeconds: string | null }[]>,
  ]);

  // Newest first, so the first one seen per agent is the one that counts.
  const liveByUser = new Map<number, Call>();
  for (const call of liveCalls) if (!liveByUser.has(call.userId)) liveByUser.set(call.userId, call);
  const endedByUser = new Map<number, Date>();
  for (const call of recentCalls) if (call.endedAt && !endedByUser.has(call.userId)) endedByUser.set(call.userId, new Date(call.endedAt));
  const totals = new Map(todayTotals.map((t) => [Number(t.userId), { calls: Number(t.calls) || 0, talkSeconds: Number(t.talkSeconds) || 0 }]));

  // Who each live call is with, for "On call with Priya Jadhav".
  const live = [...liveByUser.values()];
  const leadIds = live.map((c) => c.leadId).filter((id): id is number => !!id);
  const contactIds = live.map((c) => c.contactId).filter((id): id is number => !!id);
  const [leads, contacts] = await Promise.all([
    leadIds.length ? Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'firstName', 'lastName'] }) : [],
    contactIds.length ? Contact.findAll({ where: { id: contactIds }, attributes: ['id', 'firstName', 'lastName'] }) : [],
  ]);
  const fullName = (r: { firstName?: string | null; lastName?: string | null }) => `${r.firstName || ''} ${r.lastName || ''}`.trim();
  const leadNames = new Map(leads.map((l) => [l.id, fullName(l)]));
  const contactNames = new Map(contacts.map((c) => [c.id, fullName(c)]));

  const agents = users.map((user) => {
    const call = liveByUser.get(user.id);
    const { state, since } = derivePresence({
      online: onlineUserIds.has(user.id),
      // Timer starts when the customer picks up; until then it counts from dialling.
      activeCallSince: call ? new Date(call.startedAt || call.createdAt) : null,
      lastCallEndedAt: endedByUser.get(user.id) || null,
      now,
      afterCallSeconds: acw,
    });
    return {
      userId: user.id,
      name: fullName(user) || user.email,
      role: (user as any).role?.name || null,
      department: user.department || null,
      state,
      since,
      online: onlineUserIds.has(user.id),
      lastLogin: user.lastLogin || null,
      call: call
        ? {
            id: call.id,
            status: call.status,
            leadId: call.leadId || null,
            contactId: call.contactId || null,
            // The company number the customer sees (set per call by the calling-numbers feature).
            fromNumber: call.callerId ? formatIndianNumber(call.callerId) : null,
            withName: (call.leadId ? leadNames.get(call.leadId) : call.contactId ? contactNames.get(call.contactId) : null) || formatIndianNumber(call.customerNumber),
          }
        : null,
      today: totals.get(user.id) || { calls: 0, talkSeconds: 0 },
    };
  });

  agents.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name));

  const counts = { on_call: 0, after_call: 0, available: 0, offline: 0 } as Record<PresenceState, number>;
  for (const a of agents) counts[a.state] += 1;

  return { serverTime: now, afterCallSeconds: acw, counts, agents };
};
