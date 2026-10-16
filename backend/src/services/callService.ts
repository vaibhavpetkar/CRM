import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import Call, { CallStatus, TERMINAL_CALL_STATUSES } from '../models/Call';
import Lead from '../models/Lead';
import Contact from '../models/Contact';
import User from '../models/User';
import { UPLOAD_DIR } from '../config/upload';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError';
import { runWithTenant } from '../tenancy/context';
import { logActivity } from './activityLogger';
import { getVoiceProvider, providerKey, CallUpdate, VoiceProvider, VoiceProviderError } from './voice';
import { formatIndianNumber, normalizeIndianNumber } from '../utils/indianPhone';
import logger from '../utils/logger';
import { assignCallerNumber, describeMyCallerNumber, hasCallerNumbers } from './callerNumbers';
import { viSwitchedOn } from './voice/viSettings';

export const RECORDINGS_DIR = path.join(UPLOAD_DIR, 'recordings');

// While the calling panel is open it polls every few seconds; we only ask the
// provider again after this long, so many open tabs can't hammer its API.
const POLL_EVERY_MS = 2000;
// A finished call's recording can take a minute to appear at the provider.
const RECORDING_RETRY_MS = 10000;

const isTerminal = (status: string) => (TERMINAL_CALL_STATUSES as string[]).includes(status);

/** Same rules as authorize(): super admins and '*' roles can do anything. */
export const userCan = (user: any, permission: string) => {
  if (user?.isSuperAdmin) return true;
  let perms: string[] = [];
  try {
    const raw = user?.role?.permissions;
    perms = typeof raw === 'string' ? JSON.parse(raw) : raw || [];
  } catch {
    perms = [];
  }
  return perms.includes('*') || perms.includes(permission);
};

const callbackBaseUrl = () =>
  (process.env.VOICE_CALLBACK_BASE_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

const formatDuration = (s?: number | null) => {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

const STATUS_LABEL: Record<string, string> = {
  completed: 'connected',
  busy: 'busy',
  'no-answer': 'not answered',
  failed: 'failed',
  canceled: 'cancelled',
};

// ─── Setup / config ─────────────────────────────────────────────────────────

/**
 * The provider this company calls through: Vi CPaaS when it is switched on in
 * Settings > Integrations, else the server's VOICE_PROVIDER.
 */
export const activeProvider = async (): Promise<VoiceProvider | null> => {
  const provider = (await viSwitchedOn()) ? getVoiceProvider('vi') : getVoiceProvider();
  await provider?.prepare?.();
  return provider;
};

export const getConfig = async (user: any) => {
  const provider = await activeProvider();
  const missingEnvVars = provider ? provider.missingEnvVars() : ['VOICE_PROVIDER'];
  // A caller ID comes from the numbers added in Settings, or the provider's default.
  const hasNumbers = await hasCallerNumbers();
  const hasCallerId = hasNumbers || !!provider?.defaultCallerId();
  if (provider && !hasCallerId && provider.key === 'exotel') missingEnvVars.push('EXOTEL_CALLER_ID');
  if (provider && !hasCallerId && provider.key === 'vi') missingEnvVars.push('VI_CALLER_ID');
  const agentNumber = normalizeIndianNumber(user?.phone);
  return {
    enabled: !!provider && missingEnvVars.length === 0,
    provider: provider?.key || providerKey(),
    providerLabel: provider?.label || providerKey(),
    // Variable names only (never values), and only to people who can fix them.
    missingEnvVars: userCan(user, 'integrations:manage') ? missingEnvVars : [],
    agentNumber: agentNumber ? formatIndianNumber(agentNumber) : null,
    callerNumber: hasNumbers ? await describeMyCallerNumber(user.id) : null,
    recording: true,
  };
};

const requireProvider = async (): Promise<VoiceProvider> => {
  const provider = await activeProvider();
  if (!provider) throw new AppError(`Unknown calling provider "${providerKey()}". Check VOICE_PROVIDER.`, 503);
  if (provider.missingEnvVars().length || (!provider.defaultCallerId() && !(await hasCallerNumbers()))) {
    throw new AppError('Calling is not set up yet. Ask your administrator to add the calling provider details.', 503);
  }
  return provider;
};

/** The user's own phone, which the provider rings first on every call. */
export const setMyNumber = async (user: any, phone: unknown) => {
  const agentNumber = normalizeIndianNumber(typeof phone === 'string' ? phone : '');
  if (!agentNumber) throw new ValidationError('Enter a valid Indian mobile number, e.g. 98765 43210.');
  await user.update({ phone: agentNumber });
  return await getConfig(user);
};

// ─── The record being called ────────────────────────────────────────────────

type Target = { leadId?: number | null; contactId?: number | null };

const loadTarget = async (user: any, target: Target, action: 'read' | 'update') => {
  if (target.leadId) {
    if (!userCan(user, `leads:${action}`)) throw new ForbiddenError();
    const lead = await Lead.findByPk(target.leadId);
    if (!lead) throw new NotFoundError('Lead', target.leadId);
    return {
      kind: 'Lead' as const,
      id: lead.id,
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      numbers: [lead.mobile, lead.alternateMobile, lead.phone],
    };
  }
  if (target.contactId) {
    if (!userCan(user, `contacts:${action}`)) throw new ForbiddenError();
    const contact = await Contact.findByPk(target.contactId);
    if (!contact) throw new NotFoundError('Contact', target.contactId);
    return {
      kind: 'Contact' as const,
      id: contact.id,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      numbers: [contact.phone],
    };
  }
  throw new ValidationError('Choose a lead or contact to call.');
};

// ─── Placing a call ─────────────────────────────────────────────────────────

export const startCall = async (user: any, input: Target & { number?: string }) => {
  const provider = await requireProvider();
  const target = await loadTarget(user, input, 'read');

  const customerNumber = normalizeIndianNumber(input.number);
  if (!customerNumber) throw new ValidationError('That is not a valid Indian phone number.');
  // Only numbers saved on the record can be dialled, so the API can't be used
  // to call (and bill) arbitrary numbers.
  if (!target.numbers.some((n) => normalizeIndianNumber(n) === customerNumber)) {
    throw new ValidationError(`That number is not saved on this ${target.kind.toLowerCase()}. Save it first, then call.`);
  }

  const agentNumber = normalizeIndianNumber(user.phone);
  if (!agentNumber) {
    throw new ValidationError('Add your own mobile number in your Profile first. The call rings your phone, then connects to the customer.');
  }

  // Each call is its own bridge at the provider, so team members can call at
  // the same time; this picks which company number the customer sees.
  const callerId = (await assignCallerNumber(user.id, customerNumber)) || normalizeIndianNumber(provider.defaultCallerId()) || null;

  const callbackToken = crypto.randomBytes(24).toString('hex');
  const call = await Call.create({
    provider: provider.key,
    callbackToken,
    status: 'queued',
    agentNumber,
    customerNumber,
    callerId,
    leadId: target.kind === 'Lead' ? target.id : null,
    contactId: target.kind === 'Contact' ? target.id : null,
    userId: user.id,
  });

  try {
    const placed = await provider.placeCall({
      agentNumber,
      customerNumber,
      callerId,
      statusCallbackUrl: `${callbackBaseUrl()}/api/webhooks/voice/${callbackToken}`,
      record: true,
      reference: String(call.id),
    });
    await call.update({
      providerCallId: placed.providerCallId,
      status: placed.status,
      callerId: callerId || normalizeIndianNumber(placed.callerId) || placed.callerId || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await call.update({ status: 'failed', error: message.slice(0, 500), endedAt: new Date() });
    logger.warn(`[voice] Call #${call.id} could not be placed: ${message}`);
    if (err instanceof VoiceProviderError) throw new AppError(message, err.status);
    throw err;
  }

  if (target.kind === 'Contact') await Contact.update({ lastContacted: new Date() }, { where: { id: target.id } });
  return serialize(call, { targetName: target.name });
};

// ─── Manual call log ────────────────────────────────────────────────────────

const MANUAL_OUTCOMES: CallStatus[] = ['completed', 'no-answer', 'busy'];

/**
 * Logs a call a sales person made or took on their own mobile, outside the
 * calling provider. It lands in Call Tracking, the activity reports and the
 * lead's timeline like any other call, marked as provider "manual".
 */
export const logManualCall = async (
  user: any,
  input: Target & { number?: string; direction?: string; status?: string; durationMinutes?: unknown; calledAt?: string; notes?: string }
) => {
  const target = input.leadId || input.contactId ? await loadTarget(user, input, 'read') : null;

  const typed = input.number ? normalizeIndianNumber(input.number) : null;
  if (input.number && !typed) throw new ValidationError('That is not a valid Indian phone number.');
  const customerNumber = typed || target?.numbers.map((n) => normalizeIndianNumber(n)).find(Boolean) || null;
  if (!customerNumber) throw new ValidationError('Enter the phone number you called, or pick a lead that has one.');

  const status = (MANUAL_OUTCOMES as string[]).includes(String(input.status)) ? (input.status as CallStatus) : 'completed';
  const minutes = Number(input.durationMinutes);
  const durationSeconds = status === 'completed' && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;

  const now = new Date();
  let startedAt = input.calledAt ? new Date(input.calledAt) : now;
  if (Number.isNaN(startedAt.getTime()) || startedAt > now) startedAt = now;
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  const call = await Call.create({
    provider: 'manual',
    direction: input.direction === 'inbound' ? 'inbound' : 'outbound',
    callbackToken: crypto.randomBytes(24).toString('hex'),
    status,
    agentNumber: normalizeIndianNumber(user.phone) || '',
    customerNumber,
    leadId: target?.kind === 'Lead' ? target.id : null,
    contactId: target?.kind === 'Contact' ? target.id : null,
    userId: user.id,
    notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 5000) : null,
    durationSeconds,
    startedAt,
    endedAt,
  });
  // Reports and Call Tracking count a call on the day it was created, so a
  // call logged after the fact is dated to when it actually happened.
  if (startedAt < now) {
    await Call.sequelize!.query('UPDATE calls SET "createdAt" = :at WHERE id = :id', { replacements: { at: startedAt, id: call.id } });
    (call as any).setDataValue('createdAt', startedAt);
  }

  await logCallActivity(call);
  if (target?.kind === 'Lead') await Lead.update({ lastContacted: startedAt }, { where: { id: target.id } });
  if (target?.kind === 'Contact') await Contact.update({ lastContacted: startedAt }, { where: { id: target.id } });
  return serialize(call, target ? { targetName: target.name } : {});
};

// ─── Status updates (webhook + polling) ─────────────────────────────────────

const recordingExtension = (contentType: string) =>
  contentType.includes('wav') ? '.wav' : contentType.includes('ogg') ? '.ogg' : '.mp3';

const saveRecording = async (call: Call, provider: VoiceProvider) => {
  if (!call.recordingUrl || call.recordingFile) return;
  try {
    const { data, contentType } = await provider.downloadRecording(call.recordingUrl);
    if (!data.length) throw new Error('empty file');
    await fs.promises.mkdir(RECORDINGS_DIR, { recursive: true });
    const file = `${crypto.randomBytes(16).toString('hex')}${recordingExtension(contentType)}`;
    await fs.promises.writeFile(path.join(RECORDINGS_DIR, file), data);
    await call.update({ recordingFile: file, recordingContentType: contentType });
  } catch (err) {
    // Kept on the provider; the next poll or a play request tries again.
    logger.warn(`[voice] Could not save the recording of call #${call.id}: ${(err as Error).message}`);
  }
};

const logCallActivity = async (call: Call) => {
  const target = call.leadId ? { entityType: 'Lead' as const, entityId: call.leadId } : call.contactId ? { entityType: 'Contact' as const, entityId: call.contactId } : null;
  if (!target) return;
  const outcome = STATUS_LABEL[call.status] || call.status;
  const talk = call.status === 'completed' ? `, talked ${formatDuration(call.durationSeconds)}` : '';
  await logActivity({
    action: 'call_logged',
    entityType: target.entityType,
    entityId: target.entityId,
    performedById: call.userId,
    details: `${call.direction === 'inbound' ? 'Incoming call from' : 'Call to'} ${formatIndianNumber(call.customerNumber)}: ${outcome}${talk}.`,
  });
};

/** Applies what the provider told us. Runs inside the call's company context. */
export const applyUpdate = async (call: Call, update: CallUpdate, provider: VoiceProvider) => {
  const changes: Partial<Call> = {};
  if (update.durationSeconds != null) changes.durationSeconds = update.durationSeconds;
  if (update.startedAt) changes.startedAt = update.startedAt;
  if (update.endedAt) changes.endedAt = update.endedAt;
  if (update.recordingUrl && !call.recordingUrl) changes.recordingUrl = update.recordingUrl;
  if (Object.keys(changes).length) await call.update(changes);

  if (update.status && update.status !== call.status && !isTerminal(call.status)) {
    if (isTerminal(update.status)) {
      // The webhook and a poll can land together: only the one that flips the
      // status logs the call on the timeline.
      const [won] = await Call.update(
        { status: update.status, endedAt: call.endedAt || update.endedAt || new Date() },
        { where: { id: call.id, status: { [Op.notIn]: TERMINAL_CALL_STATUSES } } }
      );
      await call.reload();
      if (won) await logCallActivity(call).catch((err) => logger.warn(`[voice] Activity log failed: ${err}`));
    } else {
      await call.update({ status: update.status });
    }
  }

  if (isTerminal(call.status)) await saveRecording(call, provider);
};

/** Asks the provider for news when the call is still going or its recording is missing. */
const refresh = async (call: Call) => {
  if (!call.providerCallId) return;
  const needsStatus = !isTerminal(call.status);
  const needsRecording = isTerminal(call.status) && call.status === 'completed' && !call.recordingFile;
  if (!needsStatus && !needsRecording) return;
  const wait = needsStatus ? POLL_EVERY_MS : RECORDING_RETRY_MS;
  if (call.lastPolledAt && Date.now() - new Date(call.lastPolledAt).getTime() < wait) return;
  // Give up asking for a recording a day after the call.
  if (!needsStatus && call.endedAt && Date.now() - new Date(call.endedAt).getTime() > 24 * 3600 * 1000) return;

  const provider = getVoiceProvider(call.provider);
  await provider?.prepare?.();
  if (!provider || provider.missingEnvVars().length) return;
  await call.update({ lastPolledAt: new Date() });
  try {
    if (needsRecording && call.recordingUrl) return await saveRecording(call, provider);
    await applyUpdate(call, await provider.getCall(call.providerCallId), provider);
  } catch (err) {
    logger.warn(`[voice] Status check for call #${call.id} failed: ${(err as Error).message}`);
  }
};

/** Webhook from the provider. The token in the URL identifies the call (no login). */
export const handleCallback = async (token: string, body: Record<string, any>) => {
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  // No request context here, so this lookup is unscoped; the token is the key.
  const call = await Call.findOne({ where: { callbackToken: token } });
  if (!call) return false;
  const provider = getVoiceProvider(call.provider);
  if (!provider) return false;
  const companyId = call.get('companyId') as number | null;
  const run = async () => {
    await provider.prepare?.(); // e.g. the company's AES key, to open an encrypted body
    const update = provider.parseCallback(body);
    if (update.providerCallId && call.providerCallId && update.providerCallId !== call.providerCallId) return false;
    await applyUpdate(call, update, provider);
    return true;
  };
  return companyId ? runWithTenant(companyId, run) : run();
};

// ─── Reading / notes ────────────────────────────────────────────────────────

const loadCall = async (user: any, id: number, action: 'read' | 'update') => {
  const call = await Call.findByPk(id);
  if (!call) throw new NotFoundError('Call', id);
  // An incoming call from someone who isn't a lead: theirs, or a manager's.
  if (!call.leadId && !call.contactId) {
    if (call.userId !== user.id && !userCan(user, 'users:read')) throw new ForbiddenError();
    return call;
  }
  await loadTarget(user, { leadId: call.leadId, contactId: call.contactId }, action === 'update' && call.userId === user.id ? 'read' : action);
  return call;
};

const serialize = (call: Call, extra: Record<string, any> = {}) => ({
  id: call.id,
  direction: call.direction || 'outbound',
  provider: call.provider,
  status: call.status as CallStatus,
  isActive: !isTerminal(call.status),
  customerNumber: formatIndianNumber(call.customerNumber),
  agentNumber: call.agentNumber ? formatIndianNumber(call.agentNumber) : '',
  callerId: call.callerId ? formatIndianNumber(call.callerId) : null,
  leadId: call.leadId,
  contactId: call.contactId,
  userId: call.userId,
  notes: call.notes || '',
  durationSeconds: call.durationSeconds,
  startedAt: call.startedAt,
  endedAt: call.endedAt,
  hasRecording: !!call.recordingFile,
  recordingPending: call.status === 'completed' && !!call.recordingUrl && !call.recordingFile,
  error: call.error,
  createdAt: call.createdAt,
  ...extra,
});

export const getCall = async (user: any, id: number) => {
  const call = await loadCall(user, id, 'read');
  await refresh(call);
  return serialize(call);
};

export const updateNotes = async (user: any, id: number, notes: unknown) => {
  if (typeof notes !== 'string') throw new ValidationError('Notes must be text.');
  if (notes.length > 20000) throw new ValidationError('Notes are too long (20,000 characters at most).');
  const call = await loadCall(user, id, 'update');
  await call.update({ notes });
  return serialize(call);
};

export const listCalls = async (user: any, target: Target) => {
  await loadTarget(user, target, 'read');
  const where = target.leadId ? { leadId: target.leadId } : { contactId: target.contactId };
  const calls = await Call.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  const userIds = [...new Set(calls.map((c) => c.userId))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'firstName', 'lastName'] }) : [];
  const names = new Map(users.map((u) => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim()]));
  return calls.map((c) => serialize(c, { calledBy: names.get(c.userId) || null }));
};

/** The saved recording file, fetching it from the provider first if needed. */
export const getRecording = async (user: any, id: number) => {
  const call = await loadCall(user, id, 'read');
  if (!call.recordingFile && call.recordingUrl) {
    const provider = getVoiceProvider(call.provider);
    if (provider) await saveRecording(call, provider);
  }
  if (!call.recordingFile) throw new NotFoundError('Recording');
  const file = path.join(RECORDINGS_DIR, path.basename(call.recordingFile));
  if (!fs.existsSync(file)) throw new NotFoundError('Recording');
  return { file, contentType: call.recordingContentType || 'audio/mpeg' };
};
