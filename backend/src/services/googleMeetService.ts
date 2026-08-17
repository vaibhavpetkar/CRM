import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import GoogleMeetConnection from '../models/GoogleMeetConnection';

// Google Meet doesn't have a link-creation API of its own — real Meet links
// are created as a side effect of a Calendar API event insert with
// conferenceData.createRequest, which is what this does. Org-wide (one
// admin connects on behalf of the company), unlike the per-user Google
// Tasks connection, since meetings get scheduled by/for many different
// people but there's one shared calendar identity creating the events.

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MEET_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const getRedirectUri = () =>
  `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/integrations/google-meet/callback`;

const getOAuthClient = (): OAuth2Client | null => {
  if (!process.env.GOOGLE_MEET_CLIENT_ID || !process.env.GOOGLE_MEET_CLIENT_SECRET) return null;
  return new OAuth2Client(process.env.GOOGLE_MEET_CLIENT_ID, process.env.GOOGLE_MEET_CLIENT_SECRET, getRedirectUri());
};

export const isGoogleMeetConfigured = (): boolean =>
  !!process.env.GOOGLE_MEET_CLIENT_ID && !!process.env.GOOGLE_MEET_CLIENT_SECRET;

const getConnection = async () => {
  const [connection] = await GoogleMeetConnection.findOrCreate({ where: {}, defaults: {} });
  return connection;
};

export const buildAuthUrl = (connectingUserId: number): string => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Meet is not configured — set GOOGLE_MEET_CLIENT_ID and GOOGLE_MEET_CLIENT_SECRET on the server.');

  const state = jwt.sign({ purpose: 'google-meet-connect', userId: connectingUserId }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: MEET_SCOPES,
    state,
  });
};

export const handleOAuthCallback = async (code: string, state: string): Promise<void> => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google Meet is not configured.');

  let decoded: any;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET as string);
  } catch {
    throw new Error('This connection link has expired. Please try connecting again.');
  }
  if (decoded?.purpose !== 'google-meet-connect' || !decoded?.userId) {
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
  await connection.update({
    isEnabled: false,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    lastError: null,
  });
};

export const getStatus = async () => {
  const connection = await getConnection();
  return {
    configured: isGoogleMeetConfigured(),
    connected: !!connection.isEnabled,
    lastSyncAt: connection.lastSyncAt || null,
    lastError: connection.lastError || null,
  };
};

const ensureFreshAccessToken = async (connection: GoogleMeetConnection): Promise<string | null> => {
  const client = getOAuthClient();
  if (!client) return null;

  const isExpired = !connection.tokenExpiresAt || new Date(connection.tokenExpiresAt).getTime() < Date.now() + 60_000;
  if (!isExpired && connection.accessToken) return connection.accessToken;

  if (!connection.refreshToken) {
    await connection.update({ lastError: 'Google Meet access expired and no refresh token is available — please reconnect.' });
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
    await connection.update({ lastError: 'Failed to refresh Google Meet access — please reconnect.' });
    return null;
  }
};

/**
 * Creates a real Google Calendar event with a Google Meet link attached and
 * returns that link, or null (never throws) if Meet isn't connected or the
 * call fails — callers should treat this as best-effort and let the meeting
 * itself still get created without a link rather than blocking on it.
 */
export const createMeetLink = async (params: {
  summary: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  attendeeEmails?: string[];
}): Promise<string | null> => {
  const connection = await GoogleMeetConnection.findOne({ where: { isEnabled: true } });
  if (!connection) return null;

  const accessToken = await ensureFreshAccessToken(connection);
  if (!accessToken) return null;

  try {
    const requestId = `crm-meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await fetch(`${CALENDAR_EVENTS_URL}?conferenceDataVersion=1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description || undefined,
        start: { dateTime: params.startTime.toISOString() },
        end: { dateTime: params.endTime.toISOString() },
        attendees: (params.attendeeEmails || []).filter(Boolean).map((email) => ({ email })),
        conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      await connection.update({ lastError: `Google Meet link creation failed (${response.status}): ${body.slice(0, 200)}` });
      return null;
    }

    const data: any = await response.json();
    const meetLink: string | undefined = data?.hangoutLink || data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;

    await connection.update({ lastSyncAt: new Date(), lastError: meetLink ? null : 'Calendar event created but no Meet link was returned.' });
    return meetLink || null;
  } catch (err) {
    await connection.update({ lastError: `Google Meet link creation failed: ${err}` });
    return null;
  }
};
