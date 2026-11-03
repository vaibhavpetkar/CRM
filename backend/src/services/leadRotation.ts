import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import Integration from '../models/Integration';
import User from '../models/User';
import Lead from '../models/Lead';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import { ValidationError } from '../errors/AppError';
import { currentCompanyId, runWithTenant, runUnscoped } from '../tenancy/context';
import { getOnlineUserIds } from '../realtime/presence';
import { normalizeIndianNumber } from '../utils/indianPhone';
import logger from '../utils/logger';

/**
 * Rotational calling: new leads (and incoming calls, through the provider's
 * routing URL) go to the sales team in turn, round robin. When "only
 * available agents" is on, anyone offline or already on a call is skipped;
 * if nobody is free the turn still moves on, so no lead is left unassigned.
 *
 * Settings live in the company's `integrations` row with provider
 * 'lead_rotation' (non-secret JSON config), so no new table is needed.
 */
const PROVIDER = 'lead_rotation';
// A call that never got its final status stops making its agent "busy" after this.
const STALE_CALL_MS = 4 * 3600 * 1000;

export interface RotationConfig {
  enabled: boolean;
  userIds: number[]; // the rotation order
  onlyAvailable: boolean;
  sources: string[]; // lead sources that rotate; empty = every source
  lastUserId: number | null;
  routingToken: string | null; // secret in the incoming-call routing URL
}

const DEFAULTS: RotationConfig = { enabled: false, userIds: [], onlyAvailable: true, sources: [], lastUserId: null, routingToken: null };

const parse = (raw?: string | null): RotationConfig => {
  try {
    const c = raw ? JSON.parse(raw) : {};
    return {
      enabled: !!c.enabled,
      userIds: Array.isArray(c.userIds) ? c.userIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [],
      onlyAvailable: c.onlyAvailable !== false,
      sources: Array.isArray(c.sources) ? c.sources.map(String).filter(Boolean) : [],
      lastUserId: Number.isInteger(c.lastUserId) ? c.lastUserId : null,
      routingToken: typeof c.routingToken === 'string' ? c.routingToken : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

/**
 * Whose turn it is: the first person after `lastUserId` in the rotation order
 * who is eligible, wrapping round. With nobody eligible it's simply the next
 * person in order. Pure, so it can be tested.
 */
export const chooseNextAgent = (order: number[], lastUserId: number | null, isEligible: (id: number) => boolean): number | null => {
  if (!order.length) return null;
  const start = lastUserId != null && order.includes(lastUserId) ? order.indexOf(lastUserId) + 1 : 0;
  const rotated = order.map((_, i) => order[(start + i) % order.length]);
  return rotated.find(isEligible) ?? rotated[0];
};

/** Who is on a live call right now (company-scoped). */
const busyUserIds = async () => {
  const calls = await Call.findAll({
    where: { status: { [Op.notIn]: TERMINAL_CALL_STATUSES }, createdAt: { [Op.gte]: new Date(Date.now() - STALE_CALL_MS) } } as any,
    attributes: ['userId'],
  });
  return new Set(calls.map((c) => c.userId));
};

/** Users who can be in the rotation: active members of this company. */
const activeUserIds = async (ids: number[]) => {
  if (!ids.length) return new Set<number>();
  const users = await User.findAll({ where: { id: ids, isActive: true }, attributes: ['id'] });
  return new Set(users.map((u) => u.id));
};

const findRow = () => Integration.findOne({ where: { provider: PROVIDER } });

export const getRotationSettings = async () => {
  const row = await findRow();
  const config = parse(row?.config);
  return { ...config, routingPath: config.routingToken ? `/api/webhooks/voice/rotation/${config.routingToken}` : null };
};

export const saveRotationSettings = async (input: Partial<RotationConfig>, userId?: number) => {
  const [row] = await Integration.findOrCreate({ where: { provider: PROVIDER }, defaults: { provider: PROVIDER } });
  const current = parse(row.config);
  const next: RotationConfig = { ...current };
  if (input.enabled !== undefined) next.enabled = !!input.enabled;
  if (input.onlyAvailable !== undefined) next.onlyAvailable = !!input.onlyAvailable;
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) throw new ValidationError('Sources must be a list.');
    next.sources = input.sources.map((s) => String(s).trim()).filter(Boolean).slice(0, 50);
  }
  if (input.userIds !== undefined) {
    if (!Array.isArray(input.userIds)) throw new ValidationError('Choose the sales people for the rotation.');
    const ids = [...new Set(input.userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const valid = await activeUserIds(ids);
    next.userIds = ids.filter((id) => valid.has(id));
  }
  if (next.enabled && !next.userIds.length) throw new ValidationError('Add at least one sales person to the rotation before turning it on.');
  if (!next.routingToken) next.routingToken = crypto.randomBytes(24).toString('hex');
  await row.update({
    config: JSON.stringify(next),
    isEnabled: next.enabled,
    status: next.enabled ? 'connected' : 'not_configured',
    connectedById: userId ?? row.connectedById ?? null,
    connectedAt: row.connectedAt || new Date(),
  });
  return getRotationSettings();
};

/**
 * Takes the next turn and remembers it. The row is locked so two leads
 * arriving together go to two different people. Returns null when rotation
 * is off (or doesn't apply to this source).
 */
export const takeNextAgent = async (opts: { source?: string | null; force?: boolean } = {}): Promise<number | null> => {
  const companyId = currentCompanyId();
  if (companyId == null) return null;
  return sequelize.transaction(async (transaction) => {
    const row = await Integration.findOne({ where: { provider: PROVIDER }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return null;
    const config = parse(row.config);
    if (!config.enabled && !opts.force) return null;
    if (opts.source && config.sources.length) {
      const key = String(opts.source).toLowerCase();
      if (!config.sources.some((s) => s.toLowerCase() === key)) return null;
    }
    const active = await activeUserIds(config.userIds);
    const order = config.userIds.filter((id) => active.has(id));
    if (!order.length) return null;

    let eligible: (id: number) => boolean = () => true;
    if (config.onlyAvailable) {
      const [online, busy] = await Promise.all([getOnlineUserIds(companyId), busyUserIds()]);
      eligible = (id) => online.has(id) && !busy.has(id);
    }
    const next = chooseNextAgent(order, config.lastUserId, eligible);
    if (next == null) return null;
    await row.update({ config: JSON.stringify({ ...config, lastUserId: next }), lastSyncAt: new Date() }, { transaction });
    return next;
  });
};

/** Used by lead creation: never lets a rotation problem block a new lead. */
export const assigneeForNewLead = async (source?: string | null): Promise<number | null> => {
  try {
    return await takeNextAgent({ source });
  } catch (err) {
    logger.warn(`[rotation] Could not pick a sales person for a new lead: ${(err as Error).message}`);
    return null;
  }
};

/** Hands every unassigned open lead out in turn ("Distribute unassigned leads now"). */
export const distributeUnassigned = async (limit = 500) => {
  const settings = await getRotationSettings();
  if (!settings.userIds.length) throw new ValidationError('Add sales people to the rotation first.');
  const leads = await Lead.findAll({
    where: { assignedToId: null, isConverted: false, status: { [Op.notIn]: ['converted', 'lost', 'unqualified'] } },
    order: [['createdAt', 'ASC']],
    limit,
    attributes: ['id'],
  });
  const counts = new Map<number, number>();
  for (const lead of leads) {
    const userId = await takeNextAgent({ force: true });
    if (!userId) break;
    await Lead.update({ assignedToId: userId }, { where: { id: lead.id } });
    counts.set(userId, (counts.get(userId) || 0) + 1);
  }
  return { assigned: [...counts.values()].reduce((a, b) => a + b, 0), byUser: Object.fromEntries(counts) };
};

/**
 * Incoming-call routing for the provider (public, the token is the key):
 * returns whose turn it is, then the rest of the team as fallbacks, as
 * phone numbers. Shaped for Exotel's Connect applet "dynamic URL"; other
 * providers can ask for ?format=text to get just the first number.
 */
export const routeIncomingCall = async (token: string) => {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const row = await runUnscoped(() =>
    Integration.findOne({ where: { provider: PROVIDER, config: { [Op.like]: `%"routingToken":"${token}"%` } } })
  );
  const companyId = row?.get('companyId') as number | null | undefined;
  if (!row || !companyId) return null;
  return runWithTenant(companyId, async () => {
    const config = parse(row.config);
    if (config.routingToken !== token) return null;
    const first = await takeNextAgent({ force: true });
    const order = first ? [first, ...config.userIds.filter((id) => id !== first)] : config.userIds;
    const users = await User.findAll({ where: { id: order, isActive: true }, attributes: ['id', 'phone'] });
    const phoneById = new Map(users.map((u) => [u.id, normalizeIndianNumber(u.phone)]));
    const numbers = order.map((id) => phoneById.get(id)).filter((n): n is string => !!n);
    return { userId: first, numbers };
  });
};
