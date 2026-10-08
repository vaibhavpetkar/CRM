import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as salesService from '../services/salesService';
import * as leadRotation from '../services/leadRotation';
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
