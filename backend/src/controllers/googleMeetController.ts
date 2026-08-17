import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as googleMeetService from '../services/googleMeetService';

export const getGoogleMeetStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const status = await googleMeetService.getStatus();
  return res.json(status);
});

export const connectGoogleMeet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const url = googleMeetService.buildAuthUrl(req.user!.id);
  return res.json({ url });
});

// No `protect` here — Google redirects the browser here directly. Identity/
// CSRF protection comes entirely from the signed `state` JWT.
export const googleMeetCallback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

  if (error || !code || !state) {
    return res.redirect(`${clientUrl}/settings/integrations?googleMeet=error`);
  }

  try {
    await googleMeetService.handleOAuthCallback(code, state);
    return res.redirect(`${clientUrl}/settings/integrations?googleMeet=connected`);
  } catch (err) {
    console.error('Google Meet callback error:', err);
    return res.redirect(`${clientUrl}/settings/integrations?googleMeet=error`);
  }
});

export const disconnectGoogleMeet = asyncHandler(async (_req: AuthRequest, res: Response) => {
  await googleMeetService.disconnect();
  return res.json({ message: 'Google Meet disconnected.' });
});
