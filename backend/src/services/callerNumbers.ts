import { Op } from 'sequelize';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import CallerNumber from '../models/CallerNumber';
import User from '../models/User';
import Lead from '../models/Lead';
import Contact from '../models/Contact';
import { NotFoundError, ValidationError } from '../errors/AppError';
import { formatIndianNumber, normalizeIndianNumber } from '../utils/indianPhone';

/**
 * Which company number (caller ID) a sales person's call goes out from.
 *
 * Every click-to-call is its own bridged call at the provider, so any number
 * of team members can be on calls at the same time. Admins add the company's
 * virtual numbers here and either give one to a person (that person always
 * calls from it) or leave it in the shared pool. A pool number is picked per
 * call:
 *   1. one nobody is on a call from right now, so people calling at the same
 *      time show different numbers;
 *   2. among those, the number this customer was last called from, so they
 *      see a familiar number and can call it back;
 *   3. otherwise the least recently used.
 * When every pool number is busy the least recently used one is shared: an
 * ExoPhone can carry several calls at once.
 */

// A call stuck "ringing" this long (lost webhook, panel closed) no longer blocks its number.
const STALE_ACTIVE_CALL_MS = 2 * 3600 * 1000;

export type NumberLike = { id: number; number: string; userId?: number | null; lastUsedAt?: Date | null };

export interface NumberChoiceInput<T extends NumberLike> {
  numbers: T[]; // active numbers only
  userId: number;
  busyNumbers: Set<string>;
  lastNumberForCustomer: string | null;
}

const lastUsed = (n: { lastUsedAt?: Date | null }) => (n.lastUsedAt ? new Date(n.lastUsedAt).getTime() : 0);
const byLeastRecentlyUsed = <T extends { lastUsedAt?: Date | null; id: number }>(a: T, b: T) =>
  lastUsed(a) - lastUsed(b) || a.id - b.id;

/** The rules above, without the database, so they can be tested. */
export const chooseCallerNumber = <T extends NumberLike>(input: NumberChoiceInput<T>): T | null => {
  const mine = input.numbers.filter((n) => n.userId === input.userId);
  if (mine.length) return [...mine].sort(byLeastRecentlyUsed)[0];

  const pool = input.numbers.filter((n) => n.userId == null);
  if (!pool.length) return null;
  const free = pool.filter((n) => !input.busyNumbers.has(n.number));
  const candidates = free.length ? free : pool;
  const familiar = candidates.find((n) => n.number === input.lastNumberForCustomer);
  return familiar || [...candidates].sort(byLeastRecentlyUsed)[0];
};

/** Numbers someone is on a call from right now, with who. */
const activeCalls = () =>
  Call.findAll({
    where: {
      status: { [Op.notIn]: TERMINAL_CALL_STATUSES },
      callerId: { [Op.ne]: null },
      createdAt: { [Op.gt]: new Date(Date.now() - STALE_ACTIVE_CALL_MS) },
    } as any,
    attributes: ['id', 'callerId', 'userId', 'leadId', 'contactId', 'customerNumber', 'status', 'createdAt'],
  });

/**
 * Picks and reserves the caller ID for a new call. Returns null when the
 * company has no numbers in the CRM, so the provider's default is used.
 */
export const assignCallerNumber = async (userId: number, customerNumber: string): Promise<string | null> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const numbers = await CallerNumber.findAll({ where: { isActive: true } });
    if (!numbers.length) return null;

    const [busy, previous] = await Promise.all([
      activeCalls(),
      Call.findOne({ where: { customerNumber, callerId: { [Op.ne]: null } }, order: [['createdAt', 'DESC']], attributes: ['callerId'] }),
    ]);
    const choice = chooseCallerNumber({
      numbers,
      userId,
      busyNumbers: new Set(busy.map((c) => c.callerId as string)),
      lastNumberForCustomer: previous?.callerId || null,
    });
    if (!choice) {
      throw new ValidationError('No calling number is free for you. Ask your administrator to give you a number or add one to the shared pool.');
    }

    // Two people clicking at the same moment could pick the same free number;
    // only the one whose stamp lands first keeps it, the other picks again.
    const [won] = await CallerNumber.update(
      { lastUsedAt: new Date() },
      { where: { id: choice.id, lastUsedAt: choice.lastUsedAt ?? { [Op.is]: null } } as any }
    );
    if (won) return choice.number;
  }
  // Still contended after retries: share the number rather than fail the call.
  const fallback = await CallerNumber.findOne({ where: { isActive: true }, order: [['lastUsedAt', 'ASC']] });
  return fallback?.number || null;
};

export const hasCallerNumbers = async () => (await CallerNumber.count({ where: { isActive: true } })) > 0;

/** The number this user will normally call from, for the calling panel. */
export const describeMyCallerNumber = async (userId: number) => {
  const mine = await CallerNumber.findOne({ where: { isActive: true, userId }, order: [['lastUsedAt', 'ASC']] });
  if (mine) return { mode: 'dedicated' as const, number: formatIndianNumber(mine.number) };
  const pool = await CallerNumber.count({ where: { isActive: true, userId: null } });
  return pool ? { mode: 'pool' as const, number: null, poolSize: pool } : null;
};

// ─── Admin: managing the numbers ────────────────────────────────────────────

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : null;

export const listCallerNumbers = async () => {
  const [numbers, busy] = await Promise.all([CallerNumber.findAll({ order: [['createdAt', 'ASC']] }), activeCalls()]);
  const userIds = [...new Set([...numbers.map((n) => n.userId), ...busy.map((c) => c.userId)].filter((id): id is number => !!id))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'firstName', 'lastName'] }) : [];
  const names = new Map(users.map((u) => [u.id, fullName(u)]));

  const leadIds = busy.map((c) => c.leadId).filter((id): id is number => !!id);
  const contactIds = busy.map((c) => c.contactId).filter((id): id is number => !!id);
  const [leads, contacts] = await Promise.all([
    leadIds.length ? Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'firstName', 'lastName'] }) : [],
    contactIds.length ? Contact.findAll({ where: { id: contactIds }, attributes: ['id', 'firstName', 'lastName'] }) : [],
  ]);
  const leadNames = new Map(leads.map((l) => [l.id, fullName(l)]));
  const contactNames = new Map(contacts.map((c) => [c.id, fullName(c)]));

  return numbers.map((n) => ({
    id: n.id,
    number: formatIndianNumber(n.number),
    label: n.label || '',
    userId: n.userId ?? null,
    assignedTo: n.userId ? names.get(n.userId) || null : null,
    isActive: n.isActive,
    lastUsedAt: n.lastUsedAt || null,
    liveCalls: busy
      .filter((c) => c.callerId === n.number)
      .map((c) => ({
        callId: c.id,
        status: c.status,
        by: names.get(c.userId) || null,
        to: (c.leadId && leadNames.get(c.leadId)) || (c.contactId && contactNames.get(c.contactId)) || formatIndianNumber(c.customerNumber),
        since: c.createdAt,
      })),
  }));
};

type NumberInput = { number?: unknown; label?: unknown; userId?: unknown; isActive?: unknown };

const cleanUserId = async (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Choose a valid team member.');
  // Scoped to the admin's company, so another company's user is "not found".
  if (!(await User.findByPk(id, { attributes: ['id'] }))) throw new NotFoundError('User', id);
  return id;
};

const cleanLabel = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Label must be text.');
  return value.trim().slice(0, 60) || null;
};

export const addCallerNumber = async (input: NumberInput) => {
  const number = normalizeIndianNumber(typeof input.number === 'string' ? input.number : '');
  if (!number) throw new ValidationError('Enter the virtual number as it appears in your calling provider, e.g. 080 4711 2345.');
  if (await CallerNumber.findOne({ where: { number } })) throw new ValidationError('That number is already added.');
  await CallerNumber.create({ number, label: cleanLabel(input.label), userId: await cleanUserId(input.userId), isActive: true });
  return listCallerNumbers();
};

export const updateCallerNumber = async (id: number, input: NumberInput) => {
  const row = await CallerNumber.findByPk(id);
  if (!row) throw new NotFoundError('Calling number', id);
  const changes: Partial<CallerNumber> = {};
  if ('label' in input) changes.label = cleanLabel(input.label);
  if ('userId' in input) changes.userId = await cleanUserId(input.userId);
  if ('isActive' in input) changes.isActive = !!input.isActive;
  await row.update(changes);
  return listCallerNumbers();
};

export const removeCallerNumber = async (id: number) => {
  const row = await CallerNumber.findByPk(id);
  if (!row) throw new NotFoundError('Calling number', id);
  // Past calls keep the number they were made from (calls.callerId is text).
  await row.destroy();
  return listCallerNumbers();
};
