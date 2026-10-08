import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as salesService from '../services/salesService';
import * as leadRotation from '../services/leadRotation';
import * as portalLeads from '../services/portalLeadsService';
import * as incomingCalls from '../services/incomingCallService';
import { getOnlineUserIds } from '../realtime/presence';
import logger from '../utils/logger';

export const getActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const online = await getOnlineUserIds(req.user.companyId);
  return res.json(await salesService.getActivity(req.user, req.query as Record<string, unknown>, online));
});

export const getLeadSources = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await salesService.getLeadSources(req.query as Record<string, unknown>));
});

export const getCallLog = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await salesService.listCallLog(req.user, req.query as Record<string, unknown>));
});

export const listVisits = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await salesService.listVisits(req.user, req.query as Record<string, unknown>));
});

export const createVisit = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.status(201).json(await salesService.createVisit(req.user, req.body || {}));
});

export const updateVisit = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await salesService.updateVisit(req.user, Number(req.params.id), req.body || {}));
});

export const deleteVisit = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await salesService.deleteVisit(req.user, Number(req.params.id)));
});

// ─── Rotational calling (admin) ─────────────────────────────────────────────

export const getRotation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json(await leadRotation.getRotationSettings());
});

export const saveRotation = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await leadRotation.saveRotationSettings(req.body || {}, req.user.id));
});

export const distributeUnassigned = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json(await leadRotation.distributeUnassigned());
});

// Public: the telephony provider asks whose turn it is for an incoming call.
export const routeIncomingCallWebhook = async (req: Request, res: Response) => {
  try {
    const route = await leadRotation.routeIncomingCall(String(req.params.token || ''));
    if (!route) return res.sendStatus(404);
    if (String(req.query.format || '') === 'text') return res.type('text/plain').send(route.numbers[0] || '');
    // Exotel Connect applet "dynamic URL" response: dial these in order.
    return res.json({
      fetch_after_attempt: false,
      destination: { numbers: route.numbers },
      record: true,
      max_ringing_duration: 30,
    });
  } catch (err) {
    logger.error(`[rotation] Incoming call routing failed: ${err}`);
    return res.sendStatus(500);
  }
};

// ─── Property portals (99acres, MagicBricks, Housing.com) ──────────────────

export const listPortals = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json(await portalLeads.listPortals());
});

export const updatePortal = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await portalLeads.updatePortal(String(req.params.source), req.body || {}));
});

export const syncPortal = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await portalLeads.syncPortal(String(req.params.source)));
});

export const sendPortalTestLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await portalLeads.sendTestLead(String(req.params.source)));
});

/** A pushed body may be JSON, form fields, or 99acres-style XML. */
const portalBody = (req: Request): unknown => {
  const body = req.body;
  if (typeof body !== 'string') return Object.keys(body || {}).length ? body : req.query;
  const text = body.trim();
  if (text.startsWith('<')) return portalLeads.parse99acresXml(text);
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
};

// Public: a portal pushes enquiries. The secret token in the URL is the key.
export const receivePortalLeads = async (req: Request, res: Response) => {
  try {
    const source = String(req.params.source || '').toLowerCase();
    const token = String(req.params.token || '');
    if (req.method === 'GET') {
      // Portals "test" the URL before saving it; only answer OK for a real one.
      const ok = await portalLeads.isValidPushUrl(source, token);
      return ok ? res.json({ ok: true }) : res.sendStatus(404);
    }
    const result = await portalLeads.receivePush(source, token, portalBody(req));
    if (!result) return res.sendStatus(404);
    if ('disabled' in result) return res.status(200).json({ ok: false, message: 'Lead capture for this portal is switched off in the CRM.' });
    return res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`[portals] Lead push failed: ${err}`);
    return res.status(400).json({ ok: false, message: String((err as Error).message || err).slice(0, 200) });
  }
};

// ─── Incoming calls ──────────────────────────────────────────────────────────

export const getIncomingCalls = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json(await incomingCalls.getIncomingSettings());
});

export const saveIncomingCalls = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await incomingCalls.saveIncomingSettings(req.body || {}));
});

// Public: the provider reports an incoming call (JSON, form fields or query string).
export const receiveIncomingCallWebhook = async (req: Request, res: Response) => {
  try {
    const body = { ...(req.query as Record<string, any>), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const result = await incomingCalls.receiveIncomingCall(String(req.params.token || ''), body);
    if (!result) return res.sendStatus(404);
    return res.json(result);
  } catch (err) {
    logger.error(`[voice] Incoming call event failed: ${err}`);
    return res.sendStatus(500);
  }
};
