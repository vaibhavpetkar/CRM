import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as metaLeadsService from '../services/metaLeadsService';
import logger from '../utils/logger';

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

const sendError = (res: Response, err: any) => {
  if (err instanceof metaLeadsService.MetaApiError) return res.status(err.status).json({ message: err.message });
  throw err;
};

export const getMetaStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json(await metaLeadsService.getStatus());
});

export const connectMeta = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ url: metaLeadsService.buildAuthUrl(req.user!.id) });
  } catch (err) {
    return sendError(res, err);
  }
});

// No `protect` here: Facebook redirects the browser here directly. Identity
// and CSRF protection come from the signed `state` JWT.
export const metaCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error || !code || !state) return res.redirect(`${clientUrl()}/settings/integrations?meta=error`);
  try {
    await metaLeadsService.handleOAuthCallback(code, state);
    return res.redirect(`${clientUrl()}/settings/integrations?meta=connected`);
  } catch (err) {
    logger.error(`Facebook Lead Ads callback error: ${err}`);
    return res.redirect(`${clientUrl()}/settings/integrations?meta=error`);
  }
});

export const disconnectMeta = asyncHandler(async (_req: AuthRequest, res: Response) => {
  await metaLeadsService.disconnect();
  return res.json({ message: 'Facebook Lead Ads disconnected.' });
});

export const subscribeMetaPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const page = await metaLeadsService.subscribePage(Number(req.params.id));
    return res.json({ message: `Leads from ${page.pageName} will now come into the CRM.` });
  } catch (err) {
    return sendError(res, err);
  }
});

export const unsubscribeMetaPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const page = await metaLeadsService.unsubscribePage(Number(req.params.id));
    return res.json({ message: `Stopped receiving leads from ${page.pageName}.` });
  } catch (err) {
    return sendError(res, err);
  }
});

export const syncMetaPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await metaLeadsService.syncPage(Number(req.params.id)));
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Webhook (public, called by Meta) ────────────────────────────────────────

// Meta's one-time check when the webhook URL is saved in the app dashboard.
export const verifyMetaWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.META_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && typeof challenge === 'string') {
    return res.status(200).type('text/plain').send(challenge);
  }
  return res.sendStatus(403);
};

export const receiveMetaWebhook = (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!metaLeadsService.verifySignature(raw, req.get('x-hub-signature-256'))) {
    logger.warn('[meta] Rejected a webhook call with a missing or wrong signature.');
    return res.sendStatus(401);
  }
  let payload: any;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  // Answer straight away (Meta retries slow responses); a lead that fails to
  // import is recorded as failed and picked up by the next "Fetch recent leads".
  res.sendStatus(200);
  metaLeadsService.handleWebhookPayload(payload).catch((err) => logger.error(`[meta] Webhook processing failed: ${err}`));
};
