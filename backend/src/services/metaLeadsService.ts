import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op, UniqueConstraintError } from 'sequelize';
import Integration from '../models/Integration';
import MetaPage from '../models/MetaPage';
import MetaLeadEvent from '../models/MetaLeadEvent';
import User from '../models/User';
import leadService from './LeadService';
import leadRepository from '../repositories/LeadRepository';
import { logActivity } from './activityLogger';
import { notifyUser } from '../utils/notificationService';
import { mapMetaLead, MetaFieldDatum } from '../utils/metaLeadMapping';
import { runUnscoped, runWithTenant, currentCompanyId } from '../tenancy/context';
import { runAsUser } from '../tenancy/provisioning';
import logger from '../utils/logger';

/**
 * Facebook / Instagram Lead Ads -> CRM leads.
 *
 * 1. A company admin connects with Facebook (OAuth). We keep a page access
 *    token for every Page they manage (MetaPage), never the user token.
 * 2. They switch "Receive leads" on for a page, which subscribes our Meta app
 *    to that page's `leadgen` webhook.
 * 3. When someone submits a lead form, Meta POSTs the leadgen id to
 *    /api/webhooks/meta. We check Meta's signature, find which company owns
 *    that page, fetch the answers from the Graph API with the page token and
 *    create the lead in that company (source "facebook" or "instagram").
 *
 * Every submission gets a MetaLeadEvent row keyed by leadgen id, so Meta's
 * retries and the manual "Fetch recent leads" sync never create a lead twice,
 * and a person who already exists as a lead (same email or mobile) gets a
 * timeline entry instead of a duplicate lead.
 */

const PROVIDER = 'meta';
const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION || 'v23.0';
const graphBase = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;

// pages_show_list + business_management: list the Pages (including ones owned
// through a Business Manager). pages_manage_metadata: subscribe the app to
// the page's webhook. leads_retrieval + pages_read_engagement + ads_management
// read the lead's answers and the ad/campaign names.
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'ads_management',
  'business_management',
];

const LEAD_FIELDS = 'id,created_time,field_data,form_id,ad_name,adset_name,campaign_name,platform,is_organic';
const SYNC_DAYS = 7;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export const isMetaConfigured = (): boolean => !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
const getRedirectUri = () => `${clientUrl()}/api/integrations/meta/callback`;
export const getWebhookUrl = () => `${clientUrl()}/api/webhooks/meta`;

export class MetaApiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const graph = async (
  path: string,
  params: Record<string, string> = {},
  method: 'GET' | 'POST' | 'DELETE' = 'GET'
): Promise<any> => {
  const url = new URL(path.startsWith('http') ? path : `${graphBase()}/${path.replace(/^\//, '')}`);
  const init: RequestInit = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new MetaApiError(`Could not reach Facebook: ${err}`);
  }
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const message = body?.error?.message || `Facebook returned ${response.status}.`;
    throw new MetaApiError(message.slice(0, 480), response.status >= 400 && response.status < 500 ? 400 : 502);
  }
  return body;
};

/** Follows Graph API `paging.next` links, up to `maxPages` pages. */
const graphAll = async (path: string, params: Record<string, string>, maxPages = 20): Promise<any[]> => {
  const items: any[] = [];
  let page = await graph(path, params);
  for (let i = 0; i < maxPages; i++) {
    items.push(...(page?.data || []));
    const next = page?.paging?.next;
    if (!next) break;
    page = await graph(next);
  }
  return items;
};

const getIntegrationRow = async () => {
  const [row] = await Integration.findOrCreate({ where: { provider: PROVIDER }, defaults: { provider: PROVIDER } });
  return row;
};

// ─── Connect / disconnect ────────────────────────────────────────────────────

export const buildAuthUrl = (connectingUserId: number): string => {
  if (!isMetaConfigured()) {
    throw new MetaApiError('Facebook Lead Ads is not configured: set META_APP_ID and META_APP_SECRET on the server.', 400);
  }
  const state = jwt.sign({ purpose: 'meta-connect', userId: connectingUserId }, process.env.JWT_SECRET as string, {
    expiresIn: '10m',
  });
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION()}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID as string);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  // Apps set up with "Facebook Login for Business" use a configuration id
  // (which carries the permissions) instead of a scope list.
  if (process.env.META_LOGIN_CONFIG_ID) url.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID);
  else url.searchParams.set('scope', META_SCOPES.join(','));
  return url.toString();
};

export const handleOAuthCallback = async (code: string, state: string): Promise<{ pages: number }> => {
  if (!isMetaConfigured()) throw new Error('Facebook Lead Ads is not configured.');

  let decoded: any;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET as string);
  } catch {
    throw new Error('This connection link has expired. Please try connecting again.');
  }
  if (decoded?.purpose !== 'meta-connect' || !decoded?.userId) throw new Error('Invalid connection request.');

  // OAuth redirects arrive without a login: act as the connecting user's company.
  return runAsUser(decoded.userId, async () => {
    const shortLived = await graph('oauth/access_token', {
      client_id: process.env.META_APP_ID as string,
      client_secret: process.env.META_APP_SECRET as string,
      redirect_uri: getRedirectUri(),
      code,
    });
    // Page tokens fetched with a long-lived user token don't expire.
    const longLived = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID as string,
      client_secret: process.env.META_APP_SECRET as string,
      fb_exchange_token: shortLived.access_token,
    });
    const accounts = await graphAll('me/accounts', {
      fields: 'id,name,access_token',
      limit: '100',
      access_token: longLived.access_token,
    });

    for (const account of accounts) {
      if (!account?.id || !account?.access_token) continue;
      const existing = await MetaPage.findOne({ where: { pageId: String(account.id) } });
      const values = {
        pageName: String(account.name || account.id).slice(0, 255),
        pageAccessToken: account.access_token,
        connectedById: decoded.userId,
        lastError: null,
      };
      if (existing) await existing.update(values);
      else await MetaPage.create({ pageId: String(account.id), ...values });
    }

    const row = await getIntegrationRow();
    await row.update({
      status: 'connected',
      isEnabled: true,
      connectedById: decoded.userId,
      connectedAt: new Date(),
      lastError: accounts.length
        ? null
        : 'Facebook did not share any Pages. Reconnect and tick the Pages your lead forms run on.',
    });
    return { pages: accounts.length };
  });
};

export const disconnect = async (): Promise<void> => {
  const pages = await MetaPage.findAll();
  for (const page of pages) {
    if (page.isSubscribed && page.pageAccessToken) {
      await graph(`${page.pageId}/subscribed_apps`, { access_token: page.pageAccessToken }, 'DELETE').catch((err) =>
        logger.warn(`[meta] Could not unsubscribe page ${page.pageId}: ${err.message}`)
      );
    }
    await page.destroy();
  }
  const row = await getIntegrationRow();
  await row.update({ status: 'not_configured', isEnabled: false, connectedById: null, connectedAt: null, lastError: null });
};

// ─── Pages ───────────────────────────────────────────────────────────────────

const findPage = async (id: number) => {
  const page = await MetaPage.findByPk(id);
  if (!page) throw new MetaApiError('That Facebook Page is not connected.', 404);
  if (!page.pageAccessToken) throw new MetaApiError('Reconnect Facebook to refresh access to this Page.', 400);
  return page;
};

export const subscribePage = async (id: number) => {
  const page = await findPage(id);

  // Webhooks are routed by page id, so one page can feed only one company.
  const companyId = currentCompanyId();
  const takenElsewhere = await runUnscoped(() =>
    MetaPage.findOne({
      where: { pageId: page.pageId, isSubscribed: true, ...(companyId != null ? { companyId: { [Op.ne]: companyId } } : {}) } as any,
    })
  );
  if (takenElsewhere) {
    throw new MetaApiError(`${page.pageName} already sends its leads to another company in this CRM.`, 409);
  }

  try {
    await graph(`${page.pageId}/subscribed_apps`, { subscribed_fields: 'leadgen', access_token: page.pageAccessToken! }, 'POST');
  } catch (err: any) {
    await page.update({ lastError: err.message });
    throw err;
  }
  await page.update({ isSubscribed: true, subscribedAt: new Date(), lastError: null });
  return page;
};

export const unsubscribePage = async (id: number) => {
  const page = await findPage(id);
  await graph(`${page.pageId}/subscribed_apps`, { access_token: page.pageAccessToken! }, 'DELETE').catch((err) =>
    logger.warn(`[meta] Could not unsubscribe page ${page.pageId}: ${err.message}`)
  );
  await page.update({ isSubscribed: false, lastError: null });
  return page;
};

export const getStatus = async () => {
  const row = await Integration.findOne({ where: { provider: PROVIDER } });
  const pages = await MetaPage.findAll({ order: [['pageName', 'ASC']] });
  const recentLeads = await MetaLeadEvent.findAll({
    order: [['createdAt', 'DESC']],
    limit: 20,
    attributes: ['id', 'leadgenId', 'pageId', 'formName', 'campaignName', 'adName', 'platform', 'status', 'leadId', 'name', 'error', 'submittedAt', 'createdAt'],
  });
  const pageNames = new Map(pages.map((p) => [p.pageId, p.pageName]));
  return {
    configured: isMetaConfigured(),
    verifyTokenSet: !!process.env.META_VERIFY_TOKEN,
    connected: !!row?.isEnabled,
    connectedAt: row?.connectedAt || null,
    lastError: row?.lastError || null,
    webhookUrl: getWebhookUrl(),
    callbackUrl: getRedirectUri(),
    pages: pages.map((p) => ({
      id: p.id,
      pageId: p.pageId,
      pageName: p.pageName,
      isSubscribed: p.isSubscribed,
      leadsReceived: p.leadsReceived,
      lastLeadAt: p.lastLeadAt || null,
      lastSyncAt: p.lastSyncAt || null,
      lastError: p.lastError || null,
    })),
    recentLeads: recentLeads.map((e) => ({ ...e.toJSON(), pageName: pageNames.get(e.pageId) || e.pageId })),
  };
};

// ─── Webhook ─────────────────────────────────────────────────────────────────

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export const verifySignature = (rawBody: Buffer, header: string | undefined, appSecret = process.env.META_APP_SECRET): boolean => {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
};

/** Pulls the leadgen notifications out of a webhook payload. */
export const extractLeadgenChanges = (payload: any): { pageId: string; leadgenId: string }[] => {
  if (payload?.object !== 'page' || !Array.isArray(payload.entry)) return [];
  const changes: { pageId: string; leadgenId: string }[] = [];
  for (const entry of payload.entry) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (change?.field !== 'leadgen' || !value?.leadgen_id) continue;
      changes.push({ pageId: String(value.page_id || entry.id), leadgenId: String(value.leadgen_id) });
    }
  }
  return changes;
};

export const handleWebhookPayload = async (payload: any): Promise<void> => {
  for (const { pageId, leadgenId } of extractLeadgenChanges(payload)) {
    try {
      await processLeadgen(pageId, leadgenId);
    } catch (err) {
      logger.error(`[meta] Lead ${leadgenId} from page ${pageId} failed: ${err}`);
    }
  }
};

type ProcessResult = 'created' | 'duplicate' | 'skipped' | 'failed';

/** Webhook path: finds the company subscribed to this page and imports the lead there. */
const processLeadgen = async (pageId: string, leadgenId: string): Promise<ProcessResult> => {
  const page = await runUnscoped(() => MetaPage.findOne({ where: { pageId, isSubscribed: true } }));
  const companyId = page?.get('companyId') as number | null | undefined;
  if (!page || !companyId) {
    logger.warn(`[meta] Lead ${leadgenId} arrived for page ${pageId}, which no company receives leads from.`);
    return 'skipped';
  }
  return runWithTenant(companyId, () => importLead(page, leadgenId));
};

/**
 * Claims the leadgen id (so concurrent deliveries don't both import it),
 * returning the event row to fill in, or null when it was already handled.
 */
const claim = async (page: MetaPage, leadgenId: string): Promise<MetaLeadEvent | null> => {
  const existing = await MetaLeadEvent.findOne({ where: { leadgenId } });
  if (existing) {
    const stale = existing.status === 'processing' && Date.now() - new Date(existing.updatedAt).getTime() > STALE_PROCESSING_MS;
    if (existing.status !== 'failed' && !stale) return null;
    const [count] = await MetaLeadEvent.update(
      { status: 'processing', error: null },
      { where: { id: existing.id, status: existing.status } }
    );
    return count ? existing.reload() : null;
  }
  try {
    return await MetaLeadEvent.create({ leadgenId, pageId: page.pageId, status: 'processing' });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null;
    throw err;
  }
};

const formNames = new Map<string, string>();
const getFormName = async (formId: string | undefined, token: string): Promise<string | null> => {
  if (!formId) return null;
  if (formNames.has(formId)) return formNames.get(formId)!;
  try {
    const form = await graph(formId, { fields: 'name', access_token: token });
    if (form?.name) formNames.set(formId, String(form.name));
    return form?.name || null;
  } catch {
    return null;
  }
};

const notifyTeam = async (page: MetaPage, leadId: number, title: string, message: string) => {
  const admins = await User.findAll({ where: { isSuperAdmin: true, isActive: true }, attributes: ['id'] });
  const ids = new Set(admins.map((u) => u.id));
  if (page.connectedById) ids.add(page.connectedById);
  await Promise.all(
    [...ids].map((userId) =>
      notifyUser({ userId, type: 'lead_facebook', title, message, entityType: 'Lead', entityId: leadId, sendEmail: false }).catch(
        () => undefined
      )
    )
  );
};

/**
 * Imports one lead into the current company. `prefetched` is the Graph API
 * lead object when the caller already has it (the sync reads leads in bulk).
 */
const importLead = async (page: MetaPage, leadgenId: string, prefetched?: any): Promise<ProcessResult> => {
  const event = await claim(page, leadgenId);
  if (!event) return 'skipped';

  try {
    const metaLead = prefetched || (await graph(leadgenId, { fields: LEAD_FIELDS, access_token: page.pageAccessToken || '' }));
    const fieldData: MetaFieldDatum[] = metaLead?.field_data || [];
    const mapped = mapMetaLead(fieldData);
    const formName = await getFormName(metaLead?.form_id, page.pageAccessToken || '');
    const platform = metaLead?.platform === 'ig' ? 'ig' : 'fb';
    const channel = platform === 'ig' ? 'Instagram' : 'Facebook';
    const name = `${mapped.firstName}${mapped.lastName && mapped.lastName !== '-' ? ` ${mapped.lastName}` : ''}`;

    const sourceDetails = [
      `${channel} Lead Ad`,
      `Page: ${page.pageName}`,
      formName && `Form: ${formName}`,
      metaLead?.campaign_name && `Campaign: ${metaLead.campaign_name}`,
      metaLead?.adset_name && `Ad set: ${metaLead.adset_name}`,
      metaLead?.ad_name && `Ad: ${metaLead.ad_name}`,
      metaLead?.is_organic && 'Organic (not from an ad)',
    ]
      .filter(Boolean)
      .join(' · ');
    const answers = mapped.extras.map(([q, a]) => `${q}: ${a}`).join('\n');

    await event.update({
      formId: metaLead?.form_id || null,
      formName: formName?.slice(0, 255) || null,
      adName: metaLead?.ad_name ? String(metaLead.ad_name).slice(0, 255) : null,
      campaignName: metaLead?.campaign_name ? String(metaLead.campaign_name).slice(0, 255) : null,
      platform,
      name: name.slice(0, 255),
      fieldData: JSON.stringify(fieldData),
      submittedAt: metaLead?.created_time ? new Date(metaLead.created_time) : null,
    });

    const existing = await leadRepository.findDuplicate({ email: mapped.email, mobile: mapped.mobile });
    let leadId: number;
    let result: ProcessResult;

    if (existing) {
      leadId = existing.id;
      result = 'duplicate';
      await logActivity({
        action: 'updated',
        entityType: 'Lead',
        entityId: existing.id,
        performedById: null,
        details: `Filled in the ${channel} lead form again (${sourceDetails})${answers ? `:\n${answers}` : '.'}`,
      });
    } else {
      const lead = await leadService.create(
        {
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          email: mapped.email,
          mobile: mapped.mobile,
          phone: mapped.phone,
          company: mapped.company,
          jobTitle: mapped.jobTitle,
          city: mapped.city,
          state: mapped.state,
          country: mapped.country,
          zipCode: mapped.zipCode,
          street: mapped.street,
          website: mapped.website,
          leadSource: platform === 'ig' ? 'instagram' : 'facebook',
          status: 'new',
          sourceDetails,
          description: answers ? `Answers from the ${channel} lead form:\n${answers}` : null,
          allowDuplicate: true, // already checked above
        },
        null
      );
      leadId = (lead as { id: number }).id;
      result = 'created';
    }

    await event.update({ status: result === 'created' ? 'created' : 'duplicate', leadId, error: null });
    await page.increment('leadsReceived');
    await page.update({ lastLeadAt: new Date(), lastError: null });

    await notifyTeam(
      page,
      leadId,
      result === 'created' ? `New ${channel} lead: ${name}` : `${channel} lead form from existing lead: ${name}`,
      `${name} filled in ${formName ? `"${formName}"` : 'a lead form'} on ${page.pageName}.`
    );
    return result;
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 480);
    await event.update({ status: 'failed', error: message }).catch(() => undefined);
    await page.update({ lastError: `A lead could not be imported: ${message}` }).catch(() => undefined);
    logger.error(`[meta] Importing lead ${leadgenId} failed: ${message}`);
    return 'failed';
  }
};

// ─── Manual sync ─────────────────────────────────────────────────────────────

/**
 * Reads the last few days of leads from every form on the page and imports
 * any the webhook missed (or that failed before). Already-imported leads are
 * skipped by their leadgen id, so this is safe to run any time.
 */
export const syncPage = async (id: number) => {
  const page = await findPage(id);
  const since = Math.floor((Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000) / 1000);
  const counts = { created: 0, duplicate: 0, skipped: 0, failed: 0 };

  try {
    const forms = await graphAll(`${page.pageId}/leadgen_forms`, { fields: 'id,name', limit: '100', access_token: page.pageAccessToken! });
    for (const form of forms) {
      if (form?.id && form?.name) formNames.set(String(form.id), String(form.name));
      const leads = await graphAll(`${form.id}/leads`, {
        fields: LEAD_FIELDS,
        limit: '100',
        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]),
        access_token: page.pageAccessToken!,
      });
      for (const lead of leads) {
        if (!lead?.id) continue;
        counts[await importLead(page, String(lead.id), { form_id: form.id, ...lead })]++;
      }
    }
  } catch (err: any) {
    await page.update({ lastError: err.message });
    throw err;
  }

  await page.update({ lastSyncAt: new Date() });
  return counts;
};
