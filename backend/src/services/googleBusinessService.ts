import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import GoogleBusinessConnection from '../models/GoogleBusinessConnection';

// The OAuth connect flow below works today regardless of API access status
// — it's a standard OAuth2 authorization-code exchange. What it unlocks is
// a separate matter: the Business Profile data APIs (accounts, locations,
// reviews) are gated behind Google's manual "Business Profile APIs" access
// request (https://support.google.com/business/answer/9681333) — Google
// reviews and approves each application individually, typically taking
// days to weeks, and there's no way to code around that. Until it's
// approved, getAccounts() below will return Google's real 403 explaining
// exactly that, rather than this code pretending it isn't gated.

const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const BUSINESS_SCOPES = ['https://www.googleapis.com/auth/business.manage'];

const getRedirectUri = () =>
  `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/integrations/google-business/callback`;

const getOAuthClient = (): OAuth2Client | null => {
  if (!process.env.GOOGLE_BUSINESS_CLIENT_ID || !process.env.GOOGLE_BUSINESS_CLIENT_SECRET) return null;
  return new OAuth2Client(process.env.GOOGLE_BUSINESS_CLIENT_ID, process.env.GOOGLE_BUSINESS_CLIENT_SECRET, getRedirectUri());
};

export const isGoogleBusinessConfigured = (): boolean =>
  !!process.env.GOOGLE_BUSINESS_CLIENT_ID && !!process.env.GOOGLE_BUSINESS_CLIENT_SECRET;

const getConnection = async () => {
  const [connection] = await GoogleBusinessConnection.findOrCreate({ where: {}, defaults: {} });
  return connection;
};

export const buildAuthUrl = (connectingUserId: number): string => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Business Profile is not configured — set GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET on the server.');

  const state = jwt.sign({ purpose: 'google-business-connect', userId: connectingUserId }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: BUSINESS_SCOPES,
    state,
  });
};

export const handleOAuthCallback = async (code: string, state: string): Promise<void> => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Business Profile is not configured.');

  let decoded: any;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET as string);
  } catch {
    throw new Error('This connection link has expired. Please try connecting again.');
  }
  if (decoded?.purpose !== 'google-business-connect' || !decoded?.userId) {
    throw new Error('Invalid connection request.');
  }

  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error('Google did not return a usable access token.');

  const connection = await getConnection();
  await connection.update({
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    isEnabled: true,
    connectedById: decoded.userId,
    connectedAt: new Date(),
    lastError: connection.refreshToken || tokens.refresh_token ? null : 'No refresh token received from Google — you may need to reconnect periodically.',
  });
};

export const disconnect = async (): Promise<void> => {
  const connection = await getConnection();
  await connection.update({ isEnabled: false, accessToken: null, refreshToken: null, tokenExpiresAt: null, lastError: null });
};

export const getStatus = async () => {
  const connection = await getConnection();
  return {
    configured: isGoogleBusinessConfigured(),
    connected: !!connection.isEnabled,
    lastSyncAt: connection.lastSyncAt || null,
    lastError: connection.lastError || null,
  };
};

const ensureFreshAccessToken = async (connection: GoogleBusinessConnection): Promise<string | null> => {
  const client = getOAuthClient();
  if (!client) return null;

  const isExpired = !connection.tokenExpiresAt || new Date(connection.tokenExpiresAt).getTime() < Date.now() + 60_000;
  if (!isExpired && connection.accessToken) return connection.accessToken;

  if (!connection.refreshToken) {
    await connection.update({ lastError: 'Google Business Profile access expired and no refresh token is available — please reconnect.' });
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
    await connection.update({ lastError: 'Failed to refresh Google Business Profile access — please reconnect.' });
    return null;
  }
};

/**
 * Lists the connected Google account's Business Profile accounts. Will
 * genuinely fail with Google's own error (usually 403 PERMISSION_DENIED)
 * until this app has been through Google's Business Profile API access
 * request process — that's expected and not a bug in this code.
 */
export const getAccounts = async (): Promise<{ accounts: any[] } | { error: string; status: number }> => {
  const connection = await GoogleBusinessConnection.findOne({ where: { isEnabled: true } });
  if (!connection) return { error: 'Google Business Profile is not connected.', status: 400 };

  const accessToken = await ensureFreshAccessToken(connection);
  if (!accessToken) return { error: connection.lastError || 'Could not get a valid access token.', status: 401 };

  try {
    const response = await fetch(ACCOUNTS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        body?.error?.message ||
        `Google returned ${response.status}. This usually means the app hasn't been granted Business Profile API access yet — see https://support.google.com/business/answer/9681333.`;
      await connection.update({ lastError: message });
      return { error: message, status: response.status };
    }

    await connection.update({ lastSyncAt: new Date(), lastError: null });
    return { accounts: body?.accounts || [] };
  } catch (err) {
    const message = `Request to Google failed: ${err}`;
    await connection.update({ lastError: message });
    return { error: message, status: 502 };
  }
};
