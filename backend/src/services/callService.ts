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

export const RECORDINGS_DIR = path.join(UPLOAD_DIR, 'recordings');

// While the calling panel is open it polls every few seconds; we only ask the
// provider again after this long, so many open tabs can't hammer its API.
const POLL_EVERY_MS = 2000;
// A finished call's recording can take a minute to appear at the provider.
const RECORDING_RETRY_MS = 10000;

const isTerminal = (status: string) => (TERMINAL_CALL_STATUSES as string[]).includes(status);

/** Same rules as authorize(): super admins and '*' roles can do anything. */
const userCan = (user: any, permission: string) => {
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

export const getConfig = (user: any) => {
  const provider = getVoiceProvider();
  const missingEnvVars = provider ? provider.missingEnvVars() : [];
  const agentNumber = normalizeIndianNumber(user?.phone);
  return {
    enabled: !!provider && missingEnvVars.length === 0,
    provider: provider?.key || providerKey(),
    providerLabel: provider?.label || providerKey(),
    // Variable names only (never values), and only to people who can fix them.
    missingEnvVars: userCan(user, 'integrations:manage') ? (provider ? missingEnvVars : ['VOICE_PROVIDER']) : [],
    agentNumber: agentNumber ? formatIndianNumber(agentNumber) : null,
    recording: true,
  };
};

const requireProvider = (): VoiceProvider => {
  const provider = getVoiceProvider();
  if (!provider) throw new AppError(`Unknown calling provider "${providerKey()}". Check VOICE_PROVIDER.`, 503);
  if (provider.missingEnvVars().length) {
    throw new AppError('Calling is not set up yet. Ask your administrator to add the calling provider details.', 503);
  }
  return provider;
};

/** The user's own phone, which the provider rings first on every call. */
export const setMyNumber = async (user: any, phone: unknown) => {
  const agentNumber = normalizeIndianNumber(typeof phone === 'string' ? phone : '');
  if (!agentNumber) throw new ValidationError('Enter a valid Indian mobile number, e.g. 98765 43210.');
  await user.update({ phone: agentNumber });
  return getConfig(user);
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
  const provider = requireProvider();
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

  const callbackToken = crypto.randomBytes(24).toString('hex');
  const call = await Call.create({
    provider: provider.key,
    callbackToken,
    status: 'queued',
    agentNumber,
    customerNumber,
    leadId: target.kind === 'Lead' ? target.id : null,
    contactId: target.kind === 'Contact' ? target.id : null,
    userId: user.id,
  });

  try {
    const placed = await provider.placeCall({
      agentNumber,
      customerNumber,
      statusCallbackUrl: `${callbackBaseUrl()}/api/webhooks/voice/${callbackToken}`,
      record: true,
    });
    await call.update({ providerCallId: placed.providerCallId, status: placed.status, callerId: placed.callerId || null });
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
    details: `Call to ${formatIndianNumber(call.customerNumber)}: ${outcome}${talk}.`,
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
  const update = provider.parseCallback(body);
  if (update.providerCallId && call.providerCallId && update.providerCallId !== call.providerCallId) return false;
  const companyId = call.get('companyId') as number | null;
  const run = () => applyUpdate(call, update, provider);
  await (companyId ? runWithTenant(companyId, run) : run());
  return true;
};

// ─── Reading / notes ────────────────────────────────────────────────────────

const loadCall = async (user: any, id: number, action: 'read' | 'update') => {
  const call = await Call.findByPk(id);
  if (!call) throw new NotFoundError('Call', id);
  await loadTarget(user, { leadId: call.leadId, contactId: call.contactId }, action === 'update' && call.userId === user.id ? 'read' : action);
  return call;
};

const serialize = (call: Call, extra: Record<string, any> = {}) => ({
  id: call.id,
  provider: call.provider,
  status: call.status as CallStatus,
  isActive: !isTerminal(call.status),
  customerNumber: formatIndianNumber(call.customerNumber),
  agentNumber: formatIndianNumber(call.agentNumber),
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
