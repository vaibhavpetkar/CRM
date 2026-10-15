import { Op } from 'sequelize';
import Integration from '../models/Integration';
import { ValidationError } from '../errors/AppError';
import { currentCompanyId, runUnscoped, runWithTenant } from '../tenancy/context';
import { buildViBody, fillTemplate, viRequest } from './voice/vi';
import {
  VI_PROVIDER_ROW,
  buildStoredConfig,
  clearViSettingsCache,
  decryptViPayload,
  describeForAdmin,
  fromRow,
  loadViSettings,
  ViSettings,
} from './voice/viSettings';
import { VoiceProviderError } from './voice';
import { getIncomingSettings, inboundConfig, processCallEvent } from './incomingCallService';
import logger from '../utils/logger';

/**
 * Settings > Integrations > Vi CPaaS: the company's own Vi CPaaS account for
 * two-way calling. Outgoing calls go out through the CTC API, Vi pushes call
 * events (outgoing status and incoming calls) to the company's call events
 * URL, and the Pull API is read every few minutes to catch anything a push
 * missed.
 */

const PULL_MINUTES = () => Math.max(1, Number(process.env.VI_PULL_MINUTES) || 5);
// The first pull looks this far back; later ones overlap the last by a few minutes.
const FIRST_PULL_MS = 3600 * 1000;
const PULL_OVERLAP_MS = 10 * 60 * 1000;

const settingsRow = async () => {
  const [row] = await Integration.findOrCreate({ where: { provider: VI_PROVIDER_ROW }, defaults: { provider: VI_PROVIDER_ROW } });
  return row;
};

const serialize = async (row: Integration) => {
  const incoming = await getIncomingSettings(); // makes the events URL on first look
  return {
    isEnabled: row.isEnabled,
    status: row.status,
    lastError: row.lastError || null,
    lastPullAt: row.lastSyncAt,
    pullEveryMinutes: PULL_MINUTES(),
    eventsUrl: incoming.webhookUrl,
    ...describeForAdmin(fromRow(row)),
  };
};

export const getViSettings = async () => serialize(await settingsRow());

export const saveViSettings = async (input: Record<string, unknown>) => {
  const row = await settingsRow();
  const { config, errors } = buildStoredConfig(row.config, input || {});
  if (errors.length) throw new ValidationError(errors.join(' '));
  const isEnabled = input.isEnabled === undefined ? row.isEnabled : !!input.isEnabled;
  if (isEnabled && !config.ctcUrl) throw new ValidationError('Add the CTC API URL from your Vi API document before switching Vi CPaaS on.');
  await row.update({
    config: JSON.stringify(config),
    isEnabled,
    status: isEnabled ? 'connected' : 'disconnected',
    connectedAt: isEnabled && !row.isEnabled ? new Date() : row.connectedAt,
    lastError: null,
  });
  clearViSettingsCache(currentCompanyId());
  return serialize(row);
};

// ─── Pull API ───────────────────────────────────────────────────────────────

/** "2026-10-15 17:30:00" in India time. */
const istStamp = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');

export const pullWindowValues = (from: Date, to: Date): Record<string, string> => ({
  from: istStamp(from),
  to: istStamp(to),
  fromDate: istStamp(from).slice(0, 10),
  toDate: istStamp(to).slice(0, 10),
  fromEpoch: String(Math.floor(from.getTime() / 1000)),
  toEpoch: String(Math.floor(to.getTime() / 1000)),
});

/** The list of call records in a Pull API answer, wherever it sits. */
export const findRecords = (body: unknown, depth = 0): Record<string, any>[] => {
  if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object');
  if (!body || typeof body !== 'object' || depth > 3) return [];
  for (const k of ['data', 'records', 'result', 'results', 'cdr', 'cdrs', 'calls', 'report', 'reports', 'items', 'list', 'rows']) {
    const v = (body as any)[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  }
  for (const v of Object.values(body as any)) {
    const found = findRecords(v, depth + 1);
    if (found.length) return found;
  }
  return [];
};

const pullUrl = (s: ViSettings, values: Record<string, string>) =>
  s.pullUrl.replace(/\{\{(\w+)\}\}/g, (m, k) => (values[k] !== undefined ? encodeURIComponent(values[k]) : m));

/** Reads recent call reports from Vi's Pull API and applies each one. Runs in the company's context. */
export const pullViReports = async (opts: { since?: Date } = {}) => {
  const row = await settingsRow();
  const s = await loadViSettings();
  if (s.source !== 'saved' || !s.pullUrl) throw new ValidationError('Add the Pull API URL first.');
  const to = new Date();
  const from = opts.since || (row.lastSyncAt ? new Date(new Date(row.lastSyncAt).getTime() - PULL_OVERLAP_MS) : new Date(to.getTime() - FIRST_PULL_MS));
  const values = { ...pullWindowValues(from, to), username: s.pullUsername, password: s.pullPassword, accountId: s.accountId };

  let body: any;
  try {
    body = s.pullBody
      ? await viRequest(s, 'pull', pullUrl(s, values), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s.encryptRequests ? buildViBody({ ...s, requestTemplate: s.pullBody }, values) : fillTemplate(s.pullBody, values)),
        })
      : await viRequest(s, 'pull', pullUrl(s, values));
  } catch (err) {
    const message = (err as Error).message;
    await row.update({ lastError: message.slice(0, 500) });
    if (err instanceof VoiceProviderError) throw new ValidationError(message);
    throw err;
  }

  const { createLeads } = await inboundConfig();
  const counts = { records: 0, outgoing: 0, incoming: 0, skipped: 0 };
  for (const raw of findRecords(body)) {
    counts.records++;
    try {
      const result = await processCallEvent(decryptViPayload(raw, s), createLeads, { fromPull: true });
      if (!result.ok) counts.skipped++;
      else if (result.direction === 'outbound') counts.outgoing++;
      else counts.incoming++;
    } catch (err) {
      counts.skipped++;
      logger.warn(`[vi] A pulled call report failed: ${(err as Error).message}`);
    }
  }
  await row.update({ lastSyncAt: to, lastError: null });
  return { ...counts, settings: await serialize(row) };
};

let pullTimer: NodeJS.Timeout | null = null;

/** Every few minutes, pull call reports for each company that switched Vi CPaaS on with a Pull API URL. */
export const startViPuller = () => {
  if (pullTimer) return;
  const run = async () => {
    try {
      const rows = await runUnscoped(() => Integration.findAll({ where: { provider: VI_PROVIDER_ROW, isEnabled: true, config: { [Op.like]: '%"pullUrl":"http%' } } }));
      for (const row of rows) {
        const companyId = row.get('companyId') as number | null;
        if (!companyId) continue;
        await runWithTenant(companyId, () => pullViReports()).catch((err) => logger.warn(`[vi] Pull for company #${companyId}: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`[vi] Puller run failed: ${err}`);
    }
  };
  pullTimer = setInterval(run, PULL_MINUTES() * 60000);
  pullTimer.unref?.();
};
