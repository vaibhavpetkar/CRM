import { Op } from 'sequelize';
import Integration from '../models/Integration';
import { ValidationError } from '../errors/AppError';
import { currentCompanyId, runUnscoped, runWithTenant } from '../tenancy/context';
import { viRequest } from './voice/vi';
import { VI_PULL_BASE, viDni, viLoginToken } from './voice/viToken';

export { VI_PULL_BASE, viDni };
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
 * missed (Vi's Pull Report API: inbound and click-to-call reports).
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
  const saved = fromRow({ config: JSON.stringify(config), isEnabled } as Integration)!;
  if (isEnabled && (!saved.callerId || (!saved.password && saved.authType !== 'none'))) {
    throw new ValidationError('Add your Vi number and the CTC username and password before switching Vi CPaaS on.');
  }
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

// Vi's pullreport calltype: 1 inbound, 2 outbound (OBD campaigns), 3 click-to-call.
export const PULL_CALLTYPES = [
  { calltype: '1', inbound: true },
  { calltype: '3', inbound: false },
];

/** "15/10/2026" in India time, the date format pullreport takes. */
export const viDate = (d: Date) => {
  const ist = new Date(d.getTime() + 330 * 60000).toISOString();
  return `${ist.slice(8, 10)}/${ist.slice(5, 7)}/${ist.slice(0, 4)}`;
};

/** A report sent as a tab or comma separated table with a header row ("CALL ID\tDNI\t..."). */
const parseTable = (text: string): Record<string, any>[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2 || !/call\s*id/i.test(lines[0])) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
};

/** The list of call records in a Pull Report answer, wherever it sits ("report" may be a JSON string). */
export const findRecords = (body: unknown, depth = 0): Record<string, any>[] => {
  if (typeof body === 'string' && !/^\s*[[{]/.test(body)) return parseTable(body);
  if (typeof body === 'string' && /^\s*[[{]/.test(body)) {
    try {
      return findRecords(JSON.parse(body), depth);
    } catch {
      return [];
    }
  }
  if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object');
  if (!body || typeof body !== 'object' || depth > 3) return [];
  for (const k of ['report', 'data', 'records', 'result', 'results', 'cdr', 'cdrs', 'calls', 'reports', 'items', 'list', 'rows']) {
    const v = (body as any)[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
    if (typeof v === 'string' || (v && typeof v === 'object')) {
      const found = findRecords(v, depth + 1);
      if (found.length) return found;
    }
  }
  for (const v of Object.values(body as any)) {
    const found = findRecords(v, depth + 1);
    if (found.length) return found;
  }
  return [];
};

/** Reads recent call reports (inbound and click-to-call) from Vi's Pull Report API and applies each one. Runs in the company's context. */
export const pullViReports = async (opts: { since?: Date } = {}) => {
  const row = await settingsRow();
  const s = await loadViSettings();
  const dni = viDni(s);
  // The Pull API login, else the CTC login (Vi issues one token for both).
  const username = s.pullUsername || s.username;
  const password = s.pullPassword || s.password;
  if (s.source !== 'saved' || !username || !password) throw new ValidationError('Add the Vi username and password first.');
  if (!dni) throw new ValidationError('Add the DNI (your Vi service number) first.');
  const base = (s.pullUrl || VI_PULL_BASE).replace(/\/+$/, '').replace(/\/(authenticatepullreport|pullreport)$/i, '');
  const to = new Date();
  const from = opts.since || (row.lastSyncAt ? new Date(new Date(row.lastSyncAt).getTime() - PULL_OVERLAP_MS) : new Date(to.getTime() - FIRST_PULL_MS));

  const { createLeads } = await inboundConfig();
  const counts = { records: 0, outgoing: 0, incoming: 0, skipped: 0 };
  try {
    for (const { calltype, inbound } of PULL_CALLTYPES) {
      const body = JSON.stringify({ dni, fromdate: viDate(from), todate: viDate(to), calltype });
      const ask = async (fresh: boolean) =>
        viRequest({ ...s, authType: 'none' }, `${base}/pullreport`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await viLoginToken((url, init) => viRequest({ ...s, authType: 'none' }, url, init), { username, password, dni, base }, fresh)}` },
          body,
        });
      let report: any;
      try {
        report = await ask(false);
      } catch (err) {
        // An expired token: log in again once.
        if (!(err instanceof VoiceProviderError) || err.status !== 502) throw err;
        report = await ask(true);
      }
      for (const raw of findRecords(report)) {
        counts.records++;
        try {
          const result = await processCallEvent(decryptViPayload(raw, s), createLeads, { fromPull: true, inbound });
          if (!result.ok) counts.skipped++;
          else if (result.direction === 'outbound') counts.outgoing++;
          else counts.incoming++;
        } catch (err) {
          counts.skipped++;
          logger.warn(`[vi] A pulled call report failed: ${(err as Error).message}`);
        }
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    await row.update({ lastError: message.slice(0, 500) });
    if (err instanceof VoiceProviderError) throw new ValidationError(message);
    throw err;
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
      const rows = await runUnscoped(() => Integration.findAll({ where: { provider: VI_PROVIDER_ROW, isEnabled: true, config: { [Op.like]: '%"pullPassword":"v1:%' } } }));
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
