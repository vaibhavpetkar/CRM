import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as googleBusinessService from '../services/googleBusinessService';

export const getGoogleBusinessStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const status = await googleBusinessService.getStatus();
  return res.json(status);
});

export const connectGoogleBusiness = asyncHandler(async (req: AuthRequest, res: Response) => {
  const url = googleBusinessService.buildAuthUrl(req.user!.id);
  return res.json({ url });
});

// No `protect` here — Google redirects the browser here directly. Identity/
// CSRF protection comes entirely from the signed `state` JWT.
export const googleBusinessCallback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

  if (error || !code || !state) {
    return res.redirect(`${clientUrl}/settings/integrations?googleBusiness=error`);
  }

  try {
    await googleBusinessService.handleOAuthCallback(code, state);
    return res.redirect(`${clientUrl}/settings/integrations?googleBusiness=connected`);
  } catch (err) {
    console.error('Google Business Profile callback error:', err);
    return res.redirect(`${clientUrl}/settings/integrations?googleBusiness=error`);
  }
});

export const disconnectGoogleBusiness = asyncHandler(async (_req: AuthRequest, res: Response) => {
  await googleBusinessService.disconnect();
  return res.json({ message: 'Google Business Profile disconnected.' });
});

// Lets the Integrations page show something real once connected — will
// surface Google's own "not approved yet" error until the app has been
// through Google's Business Profile API review.
export const getGoogleBusinessAccounts = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const result = await googleBusinessService.getAccounts();
  if ('error' in result) return res.status(result.status).json({ message: result.error });
  return res.json(result);
});
