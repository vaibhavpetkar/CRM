import crypto from 'crypto';
import { Op, fn, col, where as sqlWhere } from 'sequelize';
import Call, { TERMINAL_CALL_STATUSES } from '../models/Call';
import Integration from '../models/Integration';
import Lead from '../models/Lead';
import User from '../models/User';
import leadService from './LeadService';
import { applyUpdate } from './callService';
import { takeNextAgent } from './leadRotation';
import { getVoiceProvider, providerKey } from './voice';
import { mapViCall, pick } from './voice/vi';
import { decryptViPayload, loadViSettings, viSwitchedOn, ViSettings } from './voice/viSettings';
import { formatIndianNumber, normalizeIndianNumber } from '../utils/indianPhone';
import { notifyUser } from '../utils/notificationService';
import { runUnscoped, runWithTenant } from '../tenancy/context';
import logger from '../utils/logger';

/**
 * Incoming calls (a buyer rings the company's Vi / Exotel number).
 *
 * The provider sends call events (ringing, answered, ended, recording) to
 * /api/webhooks/voice/incoming/<token>; the secret token identifies the
 * company. Each event is upserted into `calls` with direction 'inbound', so
 * incoming calls show in Call Tracking, Sales Activity and the green/red live
 * status next to outgoing ones. The caller is matched to a lead by mobile
 * (or a new "Incoming call" lead is created), and the call is given to the
 * sales person who answered, else the lead's owner, else whoever's turn it is.
 */

const PROVIDER = 'voice_inbound';
// Without a call id, events from the same caller this close together are one call.
const SAME_CALL_MS = 2 * 3600 * 1000;

interface InboundConfig {
  token: string | null;
  createLeads: boolean;
}

const parse = (raw?: string | null): InboundConfig => {
  try {
    const c = raw ? JSON.parse(raw) : {};
    return { token: typeof c.token === 'string' ? c.token : null, createLeads: c.createLeads !== false };
  } catch {
    return { token: null, createLeads: true };
  }
};

const clientUrl = () => (process.env.VOICE_CALLBACK_BASE_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

const settingsRow = async () => {
  const [row] = await Integration.findOrCreate({ where: { provider: PROVIDER }, defaults: { provider: PROVIDER } });
  return row;
};

const serializeSettings = async (row: Integration) => {
  const config = parse(row.config);
  const since = new Date(Date.now() - 7 * 86400000);
  const received = await Call.count({ where: { direction: 'inbound', createdAt: { [Op.gte]: since } } as any });
  return {
    webhookUrl: config.token ? `${clientUrl()}/api/webhooks/voice/incoming/${config.token}` : null,
    createLeads: config.createLeads,
    lastCallAt: row.lastSyncAt,
    callsLast7Days: received,
    provider: (await viSwitchedOn()) ? 'vi' : providerKey(),
  };
};

/** Settings > Integrations > Incoming calls. Creates the token on first look. */
export const getIncomingSettings = async () => {
  const row = await settingsRow();
  const config = parse(row.config);
  if (!config.token) {
    await row.update({ config: JSON.stringify({ ...config, token: crypto.randomBytes(24).toString('hex') }), status: 'connected', isEnabled: true });
  }
  return serializeSettings(row);
};

export const saveIncomingSettings = async (input: { createLeads?: boolean; regenerate?: boolean }) => {
  const row = await settingsRow();
  const config = parse(row.config);
  if (input.createLeads !== undefined) config.createLeads = !!input.createLeads;
  if (input.regenerate || !config.token) config.token = crypto.randomBytes(24).toString('hex');
  await row.update({ config: JSON.stringify(config), status: 'connected', isEnabled: true });
  return serializeSettings(row);
};

// ─── Reading an event ───────────────────────────────────────────────────────

export interface InboundEvent {
  providerCallId: string | null;
  customer: string | null; // E.164 when it's an Indian number
  agent: string | null;
  did: string | null;
  isFinalReport: boolean; // carries a recording or an end time
}

const asNumber = (v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  return normalizeIndianNumber(s) || (s.replace(/\D/g, '').length >= 6 ? s.slice(0, 20) : null);
};

/** Who called, who picked up, on which company number, whatever the provider calls them. */
export const readInboundEvent = (body: Record<string, any>): InboundEvent => {
  const update = mapViCall(body);
  return {
    isFinalReport: !!(update.recordingUrl || update.endedAt),
    providerCallId: update.providerCallId || null,
    customer: asNumber(
      pick(body, ['caller', 'caller_number', 'callerNumber', 'caller_id_number', 'calling_number', 'customer_number', 'customerNumber', 'CallFrom', 'from', 'From', 'ani', 'source_number', 'msisdn', 'A PARTY NO'])
    ),
    agent: asNumber(
      pick(body, ['agent_number', 'agentNumber', 'agent', 'answered_by', 'answeredBy', 'DialWhomNumber', 'connected_to', 'receiver', 'receiver_number', 'destination_number', 'forwarded_to', 'B PARTY NO'])
    ),
    did: asNumber(pick(body, ['did', 'DID', 'did_number', 'virtual_number', 'called_number', 'dnis', 'CallTo', 'to', 'To'])),
  };
};

const last10 = (n: string) => n.replace(/\D/g, '').slice(-10);

/** The newest lead whose mobile / alternate mobile ends in these 10 digits, however it was typed. */
const findLeadByNumber = async (number: string) => {
  const digits = last10(number);
  if (digits.length < 10) return null;
  const like = { [Op.like]: `%${digits}` };
  return Lead.findOne({
    where: {
      [Op.or]: [
        sqlWhere(fn('regexp_replace', col('mobile'), '[^0-9]', '', 'g'), like),
        sqlWhere(fn('regexp_replace', col('alternateMobile'), '[^0-9]', '', 'g'), like),
      ],
    } as any,
    order: [['createdAt', 'DESC']],
  });
};

const findUserByNumber = async (number: string | null) => {
  if (!number) return null;
  const digits = last10(number);
  if (digits.length < 10) return null;
  return User.findOne({
    where: { isActive: true, [Op.and]: [sqlWhere(fn('regexp_replace', col('phone'), '[^0-9]', '', 'g'), { [Op.like]: `%${digits}` })] } as any,
    attributes: ['id', 'phone'],
  });
};

const fallbackUserId = async () => {
  const admin = await User.findOne({ where: { isActive: true, isSuperAdmin: true } as any, attributes: ['id'], order: [['id', 'ASC']] });
  if (admin) return admin.id;
  const anyone = await User.findOne({ where: { isActive: true } as any, attributes: ['id'], order: [['id', 'ASC']] });
  return anyone?.id ?? null;
};

const isTerminal = (s: string) => (TERMINAL_CALL_STATUSES as string[]).includes(s);

/** Finds this call (by the provider's id, else the caller's open call) or creates it. */
const upsertCall = async (event: InboundEvent, createLeads: boolean): Promise<Call | null> => {
  const provider = (await viSwitchedOn()) ? 'vi' : providerKey();
  let call: Call | null = null;
  if (event.providerCallId) {
    call = await Call.findOne({ where: { direction: 'inbound', providerCallId: event.providerCallId } as any });
  } else if (event.customer) {
    call = await Call.findOne({
      where: { direction: 'inbound', customerNumber: event.customer, createdAt: { [Op.gte]: new Date(Date.now() - SAME_CALL_MS) } } as any,
      order: [['createdAt', 'DESC']],
    });
    // After hang-up only a late report (recording, end time) belongs to that call;
    // anything else is the same buyer ringing again.
    if (call && isTerminal(call.status) && !event.isFinalReport) call = null;
  }

  const agent = await findUserByNumber(event.agent);
  if (call) {
    // The "answered" event is usually the first to say who picked up.
    if (agent && (!call.agentNumber || call.userId !== agent.id)) await call.update({ userId: agent.id, agentNumber: event.agent || call.agentNumber });
    return call;
  }

  if (!event.customer) return null; // nothing to match or call back
  let lead = await findLeadByNumber(event.customer);
  const userId = agent?.id ?? lead?.assignedToId ?? (await takeNextAgent({ force: true }).catch(() => null)) ?? (await fallbackUserId());
  if (!userId) return null;

  if (!lead && createLeads) {
    const national = last10(event.customer);
    lead = (await leadService.create(
      {
        firstName: 'Caller',
        lastName: national,
        mobile: national.length === 10 ? national : event.customer,
        leadSource: 'incoming-call',
        status: 'new',
        assignedToId: userId,
        sourceDetails: event.did ? `Called ${formatIndianNumber(event.did)}` : 'Incoming call',
        subSource: event.did ? formatIndianNumber(event.did) : null, // which company number they rang
        allowDuplicate: true,
      } as any,
      null
    )) as any;
  }

  return Call.create({
    direction: 'inbound',
    provider,
    providerCallId: event.providerCallId,
    callbackToken: crypto.randomBytes(24).toString('hex'),
    status: 'ringing',
    agentNumber: event.agent || '',
    customerNumber: event.customer,
    callerId: event.did,
    leadId: lead?.id ?? null,
    userId,
  });
};

/**
 * A report about one of our own click-to-call calls, sent to the company's
 * events URL (Vi CPaaS posts CTC status to one fixed URL) or read from the
 * Pull API: found by the reference we sent ("crm123") or Vi's call id.
 */
export const findOutboundCall = async (body: Record<string, any>): Promise<Call | null> => {
  const id = mapViCall(body).providerCallId;
  if (id) {
    const call = await Call.findOne({ where: { direction: { [Op.ne]: 'inbound' }, providerCallId: id } as any });
    if (call) return call;
  }
  // Vi echoes the reference_id we sent (our call's id) before it has given us its own call id.
  const ref = String(pick(body, ['reference_id', 'referenceId', 'reference', 'ref_id', 'refid']) ?? '');
  const m = ref.match(/^(?:crm)?(\d{1,12})$/i);
  if (!m) return null;
  const call = await Call.findByPk(Number(m[1]));
  return call && call.direction !== 'inbound' && call.provider === 'vi' ? call : null;
};

/** Does this call report say it was an incoming call? (null when it doesn't say) */
export const isInboundReport = (body: Record<string, any>): boolean | null => {
  const d = String(pick(body, ['direction', 'call_direction', 'callDirection', 'call_type', 'callType', 'CallType', 'calltype', 'Direction', 'type']) ?? '').trim();
  if (!d) return null;
  if (/out|obd|ctc|c2c|click|dial/i.test(d)) return false;
  if (/^(in|ib|ibd)$|inbound|incoming/i.test(d)) return true;
  return null;
};

/** Handles one call event for the current company. `body` is already decrypted. */
export const processCallEvent = async (body: Record<string, any>, createLeads: boolean, opts: { fromPull?: boolean; inbound?: boolean } = {}) => {
  // Status of a call we placed ourselves.
  const outbound = await findOutboundCall(body);
  if (outbound) {
    const provider = getVoiceProvider(outbound.provider) || getVoiceProvider('vi')!;
    await provider.prepare?.();
    await applyUpdate(outbound, mapViCall(body), provider);
    return { ok: true, callId: outbound.id, status: outbound.status, leadId: outbound.leadId, direction: 'outbound' as const };
  }
  // A pulled report of an outgoing call we don't know (placed outside the CRM) isn't a buyer calling in.
  if (opts.fromPull && (opts.inbound ?? isInboundReport(body)) !== true) return { ok: false, reason: 'Not an incoming call.' };

  const event = readInboundEvent(body);
  const call = await upsertCall(event, createLeads);
  if (!call) return { ok: false, reason: 'No caller number in the event.' };
  const before = call.status;
  const provider = getVoiceProvider(call.provider) || getVoiceProvider('vi')!;
  await provider.prepare?.();
  const update = mapViCall(body);
  if (!update.status && !isTerminal(call.status)) update.status = 'ringing';
  await applyUpdate(call, update, provider);

  // A missed incoming call is a buyer waiting: tell whoever owns it.
  if (!isTerminal(before) && isTerminal(call.status) && call.status !== 'completed') {
    await notifyUser({
      userId: call.userId,
      type: 'missed_call',
      title: `Missed call from ${formatIndianNumber(call.customerNumber)}`,
      message: 'Call them back from the lead page.',
      entityType: call.leadId ? 'Lead' : undefined,
      entityId: call.leadId ?? undefined,
      sendEmail: false,
    } as any).catch((err) => logger.warn(`[voice] Missed-call notice failed: ${err}`));
  }
  return { ok: true, callId: call.id, status: call.status, leadId: call.leadId, direction: 'inbound' as const };
};

/** The "Schema credential" Vi sends with its pushes, when one is saved: HTTP Basic, or username/password fields. */
export const viPushAllowed = (s: Pick<ViSettings, 'webhookUsername' | 'webhookPassword'>, authorization: string | undefined, body: Record<string, any>) => {
  if (!s.webhookUsername && !s.webhookPassword) return true;
  const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const basic = /^Basic\s+(.+)$/i.exec(authorization || '');
  if (basic) {
    const [u, ...rest] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
    if (same(u, s.webhookUsername) && same(rest.join(':'), s.webhookPassword)) return true;
  }
  const u = String(pick(body, ['username', 'user', 'userName', 'user_name']) ?? '');
  const p = String(pick(body, ['password', 'pass', 'pwd']) ?? '');
  return same(u, s.webhookUsername) && same(p, s.webhookPassword);
};

/** Webhook (public). Returns null when the token matches no company. */
export const receiveIncomingCall = async (token: string, rawBody: Record<string, any> | string, authorization?: string) => {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const row = await runUnscoped(() => Integration.findOne({ where: { provider: PROVIDER, config: { [Op.like]: `%"token":"${token}"%` } } }));
  const companyId = row?.get('companyId') as number | null | undefined;
  if (!row || !companyId) return null;
  const config = parse(row.config);
  if (config.token !== token) return null;

  return runWithTenant(companyId, async () => {
    const vi = await loadViSettings();
    const body = decryptViPayload(rawBody, vi);
    if (!viPushAllowed(vi, authorization, body)) return { ok: false, unauthorized: true, reason: 'Wrong username or password.' };
    const result = await processCallEvent(body, config.createLeads);
    if (result.ok) await row.update({ lastSyncAt: new Date() });
    return result;
  });
};

/** The company's incoming-call settings (token, createLeads), for the Pull API. */
export const inboundConfig = async () => parse((await settingsRow()).config);
