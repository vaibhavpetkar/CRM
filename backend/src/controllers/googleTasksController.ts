import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import * as googleTasksService from '../services/googleTasksService';

export const getGoogleTasksStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await googleTasksService.getStatus(req.user!.id);
  return res.json(status);
});

export const connectGoogleTasks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const url = googleTasksService.buildAuthUrl(req.user!.id);
  return res.json({ url });
});

// No `protect` here — this is Google redirecting the user's browser back,
// not an authenticated API call. Identity/CSRF protection comes entirely
// from the signed `state` JWT verified inside handleOAuthCallback.
export const googleTasksCallback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

  if (error || !code || !state) {
    return res.redirect(`${clientUrl}/settings?tab=profile&googleTasks=error`);
  }

  try {
    await googleTasksService.handleOAuthCallback(code, state);
    return res.redirect(`${clientUrl}/settings?tab=profile&googleTasks=connected`);
  } catch (err) {
    console.error('Google Tasks callback error:', err);
    return res.redirect(`${clientUrl}/settings?tab=profile&googleTasks=error`);
  }
});

export const disconnectGoogleTasks = asyncHandler(async (req: AuthRequest, res: Response) => {
  await googleTasksService.disconnect(req.user!.id);
  return res.json({ message: 'Google Tasks disconnected.' });
});
