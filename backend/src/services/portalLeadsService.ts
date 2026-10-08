import crypto from 'crypto';
import { Op } from 'sequelize';
import PortalConnection from '../models/PortalConnection';
import PortalLeadEvent from '../models/PortalLeadEvent';
import User from '../models/User';
import leadRepository from '../repositories/LeadRepository';
import leadService from './LeadService';
import { logActivity } from './activityLogger';
import { notifyUser } from '../utils/notificationService';
import { mapPropertyLead, PropertyLead } from '../utils/propertyLeadMapping';
import { NotFoundError, ValidationError } from '../errors/AppError';
import { runUnscoped, runWithTenant } from '../tenancy/context';
import logger from '../utils/logger';

/**
 * Property portals -> CRM leads (99acres, MagicBricks, Housing.com).
 *
 * Two ways in, and a company can use both:
 *  - Push: the portal POSTs each enquiry to
 *    /api/webhooks/leads/<source>/<token> (JSON or form fields, one lead or
 *    a list). The secret token identifies the company. This is how
 *    MagicBricks and Housing.com "lead push" and most portal integrations work.
 *  - Pull: with the company's portal API login saved here, we read new
 *    enquiries every few minutes (99acres XML API, Housing.com builder API).
 *
 * Every enquiry gets a PortalLeadEvent keyed by (source, the portal's id), so
 * retries and overlapping pulls never create a lead twice, and a buyer who is
 * already a lead (same mobile or email) gets a timeline entry instead.
 */

export type PortalSource = '99acres' | 'magicbricks' | 'housing.com';

interface PortalDef {
  source: PortalSource;
  label: string;
  // Fields the company fills in to let us pull leads; empty = push only.
  credentialFields: { key: string; label: string; secret?: boolean }[];
  pullHelp: string;
  pushHelp: string;
}

export const PORTALS: PortalDef[] = [
  {
    source: '99acres',
    label: '99acres',
    credentialFields: [
      { key: 'username', label: '99acres login (username / email)' },
      { key: 'password', label: '99acres password', secret: true },
    ],
    pullHelp: 'With your 99acres login saved, new responses are read every few minutes from the 99acres response API.',
    pushHelp: 'Or ask your 99acres account manager to push leads to this URL.',
  },
  {
    source: 'magicbricks',
    label: 'MagicBricks',
    credentialFields: [],
    pullHelp: '',
    pushHelp: 'Send this URL to your MagicBricks account manager and ask them to enable lead push (API integration) to it.',
  },
  {
    source: 'housing.com',
    label: 'Housing.com',
    credentialFields: [
      { key: 'profileId', label: 'Housing.com profile / builder id' },
      { key: 'encryptionKey', label: 'Housing.com API key (encryption key)', secret: true },
    ],
    pullHelp: 'With your Housing.com profile id and API key saved, new leads are read every few minutes.',
    pushHelp: 'Or ask Housing.com to push leads to this URL.',
  },
];

const portal = (source: string) => {
  const def = PORTALS.find((p) => p.source === source);
  if (!def) throw new NotFoundError('Portal', source);
  return def;
};

const POLL_MINUTES = () => Math.max(2, Number(process.env.PORTAL_POLL_MINUTES) || 10);
const FIRST_PULL_HOURS = 24;
const MAX_PULL_DAYS = 7;

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
export const webhookUrl = (conn: PortalConnection) => `${clientUrl()}/api/webhooks/leads/${encodeURIComponent(conn.source)}/${conn.webhookToken}`;

const readCredentials = (conn: PortalConnection): Record<string, string> => {
  try {
    return conn.credentials ? JSON.parse(conn.credentials) : {};
  } catch {
    return {};
  }
};

const hasCredentials = (conn: PortalConnection) => {
  const def = portal(conn.source);
  const creds = readCredentials(conn);
  return def.credentialFields.length > 0 && def.credentialFields.every((f) => !!creds[f.key]);
};

/** The company's row for a portal, created (with its webhook token) on first look. */
const getConnection = async (source: PortalSource) => {
  const existing = await PortalConnection.findOne({ where: { source } });
  if (existing) return existing;
  return PortalConnection.create({ source, webhookToken: crypto.randomBytes(24).toString('hex'), isEnabled: true });
};

// ─── Importing one lead ─────────────────────────────────────────────────────

export type ImportResult = 'created' | 'duplicate' | 'skipped' | 'failed';

const notifyAdmins = async (leadId: number, title: string, message: string) => {
  const admins = await User.findAll({ where: { isActive: true, [Op.or]: [{ isSuperAdmin: true }] } as any, attributes: ['id'] });
  await Promise.all(
    admins.map((u) => notifyUser({ userId: u.id, type: 'lead_portal', title, message, entityType: 'Lead', entityId: leadId, sendEmail: false }).catch(() => undefined))
  );
};

const describe = (label: string, lead: PropertyLead) =>
  [
    `${label} enquiry`,
    lead.projectName && `Project: ${lead.projectName}`,
    lead.preferredLocation && `Locality: ${lead.preferredLocation}`,
    lead.configuration,
  ]
    .filter(Boolean)
    .join(' · ');

/** Imports one raw portal lead into the current company. */
export const importPortalLead = async (conn: PortalConnection, raw: unknown): Promise<ImportResult> => {
  const def = portal(conn.source);
  const lead = mapPropertyLead(raw);
  if (!lead.mobile && !lead.email) return 'skipped'; // nothing to contact the buyer on
  const externalId = lead.externalId!;

  if (await PortalLeadEvent.findOne({ where: { source: conn.source, externalId }, attributes: ['id'] })) return 'skipped';
  const event = await PortalLeadEvent.create({
    source: conn.source,
    externalId,
    status: 'failed',
    name: `${lead.firstName} ${lead.lastName}`.slice(0, 255),
    mobile: lead.mobile,
    projectName: lead.projectName,
    payload: JSON.stringify(raw).slice(0, 20000),
  });

  try {
    const details = describe(def.label, lead);
    const extraLines = [lead.message && `Message: ${lead.message}`, ...lead.extras.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
    const existing = await leadRepository.findDuplicate({ email: lead.email, mobile: lead.mobile });
    let leadId: number;
    let result: ImportResult;
    if (existing) {
      leadId = existing.id;
      result = 'duplicate';
      await logActivity({
        action: 'updated',
        entityType: 'Lead',
        entityId: existing.id,
        performedById: null,
        details: `Enquired again on ${def.label} (${details})${extraLines ? `:\n${extraLines}` : '.'}`,
      });
    } else {
      const created: any = await leadService.create(
        {
          firstName: lead.firstName,
          lastName: lead.lastName,
          mobile: lead.mobile,
          email: lead.email,
          city: lead.city,
          leadSource: conn.source,
          status: 'new',
          projectName: lead.projectName,
          preferredLocation: lead.preferredLocation,
          configuration: lead.configuration,
          propertyType: lead.propertyType,
          budgetMin: lead.budgetMin,
          budgetMax: lead.budgetMax,
          sourceDetails: details,
          description: extraLines || null,
          allowDuplicate: true, // checked above
        },
        null
      );
      leadId = created.id;
      result = 'created';
    }
    await event.update({ status: result === 'created' ? 'created' : 'duplicate', leadId, error: null });
    await conn.increment('leadsReceived');
    await conn.update({ lastLeadAt: new Date(), lastError: null });
    await notifyAdmins(
      leadId,
      result === 'created' ? `New ${def.label} lead: ${lead.firstName} ${lead.lastName}` : `${def.label} enquiry from existing lead`,
      details
    );
    return result;
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 480);
    await event.update({ status: 'failed', error: message }).catch(() => undefined);
    await conn.update({ lastError: `A lead could not be imported: ${message}` }).catch(() => undefined);
    logger.error(`[portals] Importing a ${conn.source} lead failed: ${message}`);
    return 'failed';
  }
};

/** A pushed body can be one lead, a list, or a list under leads/data/results. */
export const leadsInBody = (body: any): unknown[] => {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  for (const key of ['leads', 'data', 'results', 'enquiries', 'responses', 'Leads', 'Data']) {
    if (Array.isArray(body[key])) return body[key];
  }
  return [body];
};

const importMany = async (conn: PortalConnection, leads: unknown[]) => {
  const counts = { created: 0, duplicate: 0, skipped: 0, failed: 0 };
  for (const raw of leads.slice(0, 500)) counts[await importPortalLead(conn, raw)] += 1;
  return counts;
};

/** Webhook push (public). Returns null when the token doesn't match a connection. */
export const receivePush = async (source: string, token: string, body: unknown) => {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const conn = await runUnscoped(() => PortalConnection.findOne({ where: { source, webhookToken: token } }));
  const companyId = conn?.get('companyId') as number | null | undefined;
  if (!conn || !companyId) return null;
  if (!conn.isEnabled) return { disabled: true };
  return runWithTenant(companyId, () => importMany(conn, leadsInBody(body)));
};

/** For a portal's "test URL" check (GET). */
export const isValidPushUrl = async (source: string, token: string) => {
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  const conn = await runUnscoped(() => PortalConnection.findOne({ where: { source, webhookToken: token }, attributes: ['id'] }));
  return !!conn;
};

// ─── Pulling from portal APIs ───────────────────────────────────────────────

const ymdhms = (d: Date) => {
  const ist = new Date(d.getTime() + 330 * 60000).toISOString();
  return `${ist.slice(0, 10)} ${ist.slice(11, 19)}`;
};

const xmlText = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
};
const xmlAttr = (block: string, tag: string, attr: string) => {
  const m = block.match(new RegExp(`<${tag}\\s[^>]*${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
};

/** 99acres response API XML -> plain lead objects. */
export const parse99acresXml = (xml: string) => {
  if (/ActionStatus="false"/i.test(xml)) {
    throw new Error(xmlText(xml, 'ErrorMsg') || xmlText(xml, 'Message') || '99acres refused the request (check the login).');
  }
  return [...xml.matchAll(/<Resp\b[\s\S]*?<\/Resp>/gi)].map(([block]) => ({
    query_id: xmlAttr(block, 'QryDtl', 'QueryId') || xmlText(block, 'QueryId'),
    project_name: xmlText(block, 'CmpctLabl') || xmlText(block, 'ProjName'),
    message: xmlText(block, 'QryInfo'),
    received_on: xmlText(block, 'RcvdOn'),
    locality: xmlText(block, 'Locality'),
    city: xmlText(block, 'City'),
    name: xmlText(block, 'Name'),
    email: xmlText(block, 'Email'),
    phone: xmlText(block, 'Phone') || xmlText(block, 'Mobile'),
  }));
};

const pull99acres = async (creds: Record<string, string>, from: Date, to: Date) => {
  const url = process.env.ACRES99_API_URL || 'https://www.99acres.com/99api/v1/getmy99Response/OeAuXClO43hwseaXEQ/uid/';
  const xml = `<?xml version='1.0'?><query><user_name>${creds.username}</user_name><pswd>${creds.password}</pswd><start_date>${ymdhms(from)}</start_date><end_date>${ymdhms(to)}</end_date></query>`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ xml }).toString() });
  const text = await res.text();
  if (!res.ok) throw new Error(`99acres answered HTTP ${res.status}.`);
  return parse99acresXml(text);
};

/** Housing.com builder-leads API: hash = HMAC-SHA256(current_time, key). */
export const housingSignature = (currentTime: number, key: string) => crypto.createHmac('sha256', key).update(String(currentTime)).digest('hex');

const pullHousing = async (creds: Record<string, string>, from: Date, to: Date) => {
  const base = process.env.HOUSING_API_URL || 'https://pahal.housing.com/api/v0/get-builder-leads';
  const now = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    start_date: String(Math.floor(from.getTime() / 1000)),
    end_date: String(Math.floor(to.getTime() / 1000)),
    current_time: String(now),
    hash: housingSignature(now, creds.encryptionKey),
    id: creds.profileId,
  });
  const res = await fetch(`${base}?${qs.toString()}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Housing.com sent something unexpected (HTTP ${res.status}).`);
  }
  if (!res.ok || body?.status === false || body?.success === false) throw new Error(body?.message || body?.error || `Housing.com answered HTTP ${res.status}.`);
  return leadsInBody(body);
};

const PULLERS: Partial<Record<PortalSource, (c: Record<string, string>, from: Date, to: Date) => Promise<unknown[]>>> = {
  '99acres': pull99acres,
  'housing.com': pullHousing,
};

/** Reads new leads from the portal for the current company's connection. */
export const pullNow = async (conn: PortalConnection) => {
  const puller = PULLERS[conn.source as PortalSource];
  if (!puller || !hasCredentials(conn)) throw new ValidationError(`Save your ${portal(conn.source).label} API login first.`);
  const to = new Date();
  const earliest = to.getTime() - MAX_PULL_DAYS * 86400000;
  // Re-read a little overlap; dedupe makes it harmless.
  const since = conn.lastPolledAt ? new Date(conn.lastPolledAt).getTime() - 15 * 60000 : to.getTime() - FIRST_PULL_HOURS * 3600000;
  const from = new Date(Math.max(earliest, since));
  try {
    const leads = await puller(readCredentials(conn), from, to);
    const counts = await importMany(conn, leads);
    await conn.update({ lastPolledAt: to, ...(counts.failed ? {} : { lastError: null }) });
    return counts;
  } catch (err: any) {
    const raw = String(err?.message || err);
    const message = (raw === 'fetch failed' ? `Could not reach ${portal(conn.source).label}. Try again in a few minutes.` : raw).slice(0, 480);
    await conn.update({ lastError: `Could not read leads: ${message}` });
    throw new ValidationError(message);
  }
};

let pollTimer: NodeJS.Timeout | null = null;

/** Every few minutes, pull new leads for every company that saved a portal login. */
export const startPortalPoller = () => {
  if (pollTimer) return;
  const run = async () => {
    try {
      const conns = await runUnscoped(() => PortalConnection.findAll({ where: { isEnabled: true, credentials: { [Op.ne]: null } } }));
      for (const conn of conns) {
        const companyId = conn.get('companyId') as number | null;
        if (!companyId || !PULLERS[conn.source as PortalSource] || !hasCredentials(conn)) continue;
        await runWithTenant(companyId, () => pullNow(conn)).catch((err) => logger.warn(`[portals] ${conn.source} pull for company #${companyId}: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`[portals] Poller run failed: ${err}`);
    }
  };
  pollTimer = setInterval(run, POLL_MINUTES() * 60000);
  pollTimer.unref?.();
};

// ─── Admin settings ─────────────────────────────────────────────────────────

const serialize = async (conn: PortalConnection) => {
  const def = portal(conn.source);
  const creds = readCredentials(conn);
  const recent = await PortalLeadEvent.findAll({ where: { source: conn.source }, order: [['createdAt', 'DESC']], limit: 5 });
  return {
    source: def.source,
    label: def.label,
    isEnabled: conn.isEnabled,
    webhookUrl: webhookUrl(conn),
    pushHelp: def.pushHelp,
    pullHelp: def.pullHelp,
    canPull: def.credentialFields.length > 0,
    credentialFields: def.credentialFields.map((f) => ({ ...f, isSet: !!creds[f.key], value: f.secret ? '' : creds[f.key] || '' })),
    hasCredentials: hasCredentials(conn),
    leadsReceived: conn.leadsReceived,
    lastLeadAt: conn.lastLeadAt,
    lastPolledAt: conn.lastPolledAt,
    lastError: conn.lastError,
    recent: recent.map((e) => ({ id: e.id, status: e.status, name: e.name, mobile: e.mobile, projectName: e.projectName, leadId: e.leadId, error: e.error, createdAt: e.createdAt })),
  };
};

export const listPortals = async () => Promise.all(PORTALS.map(async (p) => serialize(await getConnection(p.source))));

export const updatePortal = async (source: string, input: { isEnabled?: boolean; credentials?: Record<string, unknown> }) => {
  const def = portal(source);
  const conn = await getConnection(def.source);
  const changes: Record<string, unknown> = {};
  if (input.isEnabled !== undefined) changes.isEnabled = !!input.isEnabled;
  if (input.credentials && typeof input.credentials === 'object') {
    const creds = readCredentials(conn);
    for (const f of def.credentialFields) {
      const v = input.credentials[f.key];
      if (v === undefined) continue; // secrets left blank in the form keep their saved value
      if (v === null || v === '') delete creds[f.key];
      else creds[f.key] = String(v).trim().slice(0, 500);
    }
    changes.credentials = Object.keys(creds).length ? JSON.stringify(creds) : null;
    changes.lastError = null;
  }
  await conn.update(changes);
  return serialize(conn);
};

export const syncPortal = async (source: string) => {
  const conn = await getConnection(portal(source).source);
  const counts = await pullNow(conn);
  return { ...counts, portal: await serialize(conn) };
};

/** Sends a sample enquiry through the import, so admins can see a lead arrive. */
export const sendTestLead = async (source: string) => {
  const def = portal(source);
  const conn = await getConnection(def.source);
  const n = Math.floor(1000 + Math.random() * 9000);
  const result = await importPortalLead(conn, {
    lead_id: `test-${Date.now()}`,
    name: `Test ${def.label} Lead`,
    mobile: `90000${n}0`.slice(0, 10),
    project_name: 'Sample Project',
    locality: 'Sample Locality',
    message: 'Interested in 2 BHK, budget 60 lakh. (Test lead sent from Settings > Integrations, safe to delete.)',
  });
  return { result, portal: await serialize(conn) };
};
