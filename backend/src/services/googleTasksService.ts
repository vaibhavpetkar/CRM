import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import UserGoogleTasksConnection from '../models/UserGoogleTasksConnection';

// Item 2 — per-user Google Tasks sync. Reuses the same GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET already configured for Google Sign-In (see
// authController.ts) — it's the same OAuth app, just requesting an
// additional scope with the server-side authorization-code flow (needed
// for offline access / a refresh token, which Sign-In's ID-token flow
// doesn't provide).

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

const getRedirectUri = () =>
  `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/integrations/google-tasks/callback`;

const getOAuthClient = (): OAuth2Client | null => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, getRedirectUri());
};

export const isGoogleTasksConfigured = (): boolean =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

/** Builds the Google consent URL for a specific user. `state` is a short-lived signed JWT (not a session/DB row) — ties the callback back to the right user and guards against CSRF, using the same JWT_SECRET already used for auth tokens. */
export const buildAuthUrl = (userId: number): string => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Tasks is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.');

  const state = jwt.sign({ purpose: 'google-tasks-connect', userId }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces Google to re-issue a refresh_token even on reconnect
    scope: [TASKS_SCOPE],
    state,
  });
};

/** Exchanges the OAuth code for tokens and stores them for that user. Returns the userId so the caller can redirect back to their profile. */
export const handleOAuthCallback = async (code: string, state: string): Promise<number> => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Tasks is not configured.');

  let decoded: any;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET as string);
  } catch {
    throw new Error('This connection link has expired. Please try connecting again.');
  }
  if (decoded?.purpose !== 'google-tasks-connect' || !decoded?.userId) {
    throw new Error('Invalid connection request.');
  }

  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new Error('Google did not return a usable access token.');
  }

  const [connection] = await UserGoogleTasksConnection.findOrCreate({
    where: { userId: decoded.userId },
    defaults: { userId: decoded.userId },
  });

  await connection.update({
    accessToken: tokens.access_token,
    // Google only sends a refresh_token on first consent (or when we force
    // prompt=consent, as above) — don't overwrite a working one with
    // nothing if this particular response happened not to include one.
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    isEnabled: true,
    lastError: connection.refreshToken || tokens.refresh_token ? null : 'No refresh token received from Google — you may need to reconnect periodically.',
  });

  return decoded.userId;
};

export const disconnect = async (userId: number): Promise<void> => {
  const connection = await UserGoogleTasksConnection.findOne({ where: { userId } });
  if (connection) {
    await connection.update({ isEnabled: false, accessToken: null, refreshToken: null, tokenExpiresAt: null, lastError: null });
  }
};

export const getStatus = async (userId: number) => {
  const connection = await UserGoogleTasksConnection.findOne({ where: { userId } });
  return {
    configured: isGoogleTasksConfigured(),
    connected: !!connection?.isEnabled,
    lastSyncAt: connection?.lastSyncAt || null,
    lastError: connection?.lastError || null,
  };
};

const ensureFreshAccessToken = async (connection: UserGoogleTasksConnection): Promise<string | null> => {
  const client = getOAuthClient();
  if (!client) return null;

  const isExpired = !connection.tokenExpiresAt || new Date(connection.tokenExpiresAt).getTime() < Date.now() + 60_000;
  if (!isExpired && connection.accessToken) return connection.accessToken;

  if (!connection.refreshToken) {
    await connection.update({ lastError: 'Google Tasks access expired and no refresh token is available — please reconnect.' });
    return null;
  }

  client.setCredentials({ refresh_token: connection.refreshToken });
  try {
    const { credentials } = await client.refreshAccessToken();
    await connection.update({
      accessToken: credentials.access_token || connection.accessToken,
      tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      lastError: null,
    });
    return credentials.access_token || null;
  } catch {
    await connection.update({ lastError: 'Failed to refresh Google Tasks access — please reconnect.' });
    return null;
  }
};

/**
 * Fire-and-forget: creates a task in the assignee's Google Tasks list when
 * a CRM Task is assigned to them — only if they've connected their own
 * Google account. Silently no-ops (not an error) if they haven't; this is
 * never required for normal CRM task assignment to work.
 */
export const syncTaskToGoogle = async (
  userId: number,
  title: string,
  notes?: string | null,
  dueDate?: Date | string | null
): Promise<void> => {
  const connection = await UserGoogleTasksConnection.findOne({ where: { userId, isEnabled: true } });
  if (!connection) return;

  const accessToken = await ensureFreshAccessToken(connection);
  if (!accessToken) return;

  try {
    const response = await fetch(`${TASKS_API_BASE}/lists/@default/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        ...(notes ? { notes } : {}),
        ...(dueDate ? { due: new Date(dueDate).toISOString() } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      await connection.update({ lastError: `Google Tasks sync failed (${response.status}): ${body.slice(0, 200)}` });
      return;
    }

    await connection.update({ lastSyncAt: new Date(), lastError: null });
  } catch (err) {
    await connection.update({ lastError: `Google Tasks sync failed: ${err}` });
  }
};
