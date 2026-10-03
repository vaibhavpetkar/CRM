import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as callService from '../services/callService';
import logger from '../utils/logger';

const optionalId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const getCallConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(callService.getConfig(req.user));
});

export const setMyNumber = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await callService.setMyNumber(req.user, req.body?.phone));
});

export const startCall = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leadId, contactId, number } = req.body || {};
  const call = await callService.startCall(req.user, { leadId: optionalId(leadId), contactId: optionalId(contactId), number });
  return res.status(201).json(call);
});

export const listCalls = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(
    await callService.listCalls(req.user, { leadId: optionalId(req.query.leadId), contactId: optionalId(req.query.contactId) })
  );
});

export const getCall = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await callService.getCall(req.user, Number(req.params.id)));
});

export const updateCallNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await callService.updateNotes(req.user, Number(req.params.id), req.body?.notes));
});

export const getCallRecording = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { file, contentType } = await callService.getRecording(req.user, Number(req.params.id));
  res.type(contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(file);
});

// ─── Webhook (public, called by the telephony provider) ─────────────────────

export const receiveVoiceWebhook = (req: Request, res: Response) => {
  // Answer straight away; anything missed here is caught by status polling.
  res.sendStatus(200);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  callService
    .handleCallback(String(req.params.token || ''), body)
    .then((ok) => {
      if (!ok) logger.warn('[voice] Ignored a webhook for an unknown call.');
    })
    .catch((err) => logger.error(`[voice] Webhook processing failed: ${err}`));
};
