import type { CallStatus } from '../../models/Call';
import { CallUpdate, PlaceCallInput, PlaceCallResult, RecordingDownload, VoiceProvider, VoiceProviderError } from './types';

/**
 * Exotel (exotel.com), the default provider: a DoT-licensed Indian cloud
 * telephony company whose "Connect two numbers" API is built for exactly this
 * CRM click-to-call flow, with call recording included.
 *
 * Env: EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_CALLER_ID
 * (your ExoPhone), optional EXOTEL_SUBDOMAIN (default api.exotel.com; use
 * api.in.exotel.com for an account on Exotel's Mumbai cluster).
 */
const env = (name: string) => (process.env[name] || '').trim();

const STATUSES: CallStatus[] = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled'];

const toStatus = (value: unknown): CallStatus | undefined => {
  const s = String(value || '').toLowerCase().trim();
  return (STATUSES as string[]).includes(s) ? (s as CallStatus) : undefined;
};

// Exotel sends times like "2026-10-03 17:05:12" in Indian time.
const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const s = String(value).trim();
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? new Date(`${s.replace(' ', 'T')}+05:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toSeconds = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const toUrl = (value: unknown): string | null => {
  const s = String(value || '').trim();
  return /^https?:\/\//i.test(s) ? s : null;
};

/** Maps an Exotel call object (API response or webhook) onto our fields. */
export const mapExotelCall = (c: Record<string, any>): CallUpdate => ({
  providerCallId: c.Sid || c.CallSid || null,
  status: toStatus(c.Status),
  // ConversationDuration is talk time; Duration includes ringing the agent.
  durationSeconds: toSeconds(c.ConversationDuration ?? c.Duration),
  startedAt: toDate(c.StartTime),
  endedAt: toDate(c.EndTime),
  recordingUrl: toUrl(c.RecordingUrl),
});

export class ExotelProvider implements VoiceProvider {
  readonly key = 'exotel';
  readonly label = 'Exotel';

  missingEnvVars() {
    return ['EXOTEL_ACCOUNT_SID', 'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN', 'EXOTEL_CALLER_ID'].filter((n) => !env(n));
  }

  private authHeader() {
    return `Basic ${Buffer.from(`${env('EXOTEL_API_KEY')}:${env('EXOTEL_API_TOKEN')}`).toString('base64')}`;
  }

  private baseUrl() {
    const host = (env('EXOTEL_SUBDOMAIN') || 'api.exotel.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}/v1/Accounts/${encodeURIComponent(env('EXOTEL_ACCOUNT_SID'))}`;
  }

  private async request(path: string, init: RequestInit = {}) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        headers: { Authorization: this.authHeader(), Accept: 'application/json', ...(init.headers || {}) },
      });
    } catch (err) {
      throw new VoiceProviderError(`Could not reach Exotel: ${(err as Error).message}`);
    }
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = body?.RestException?.Message || body?.message || text.slice(0, 200) || `HTTP ${res.status}`;
      // 4xx from Exotel is usually a wrong number, KYC, or DND/time-window block: show it.
      throw new VoiceProviderError(`Exotel refused the call: ${message}`, res.status === 401 || res.status === 403 ? 502 : 400);
    }
    return body;
  }

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const form = new URLSearchParams({
      From: input.agentNumber,
      To: input.customerNumber,
      CallerId: env('EXOTEL_CALLER_ID'),
      Record: input.record ? 'true' : 'false',
      StatusCallback: input.statusCallbackUrl,
      'StatusCallbackEvents[0]': 'terminal',
      StatusCallbackContentType: 'application/json',
    });
    if (env('EXOTEL_TIME_LIMIT')) form.set('TimeLimit', env('EXOTEL_TIME_LIMIT'));
    const body = await this.request('/Calls/connect.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const call = body?.Call;
    if (!call?.Sid) throw new VoiceProviderError('Exotel did not return a call id.');
    return { providerCallId: call.Sid, status: toStatus(call.Status) || 'queued', callerId: env('EXOTEL_CALLER_ID') };
  }

  async getCall(providerCallId: string): Promise<CallUpdate> {
    const body = await this.request(`/Calls/${encodeURIComponent(providerCallId)}.json`);
    return body?.Call ? mapExotelCall(body.Call) : {};
  }

  parseCallback(body: Record<string, any>): CallUpdate {
    return mapExotelCall(body || {});
  }

  async downloadRecording(url: string): Promise<RecordingDownload> {
    // Recordings are usually a public S3 link; some accounts protect them
    // with the API key, so retry with it on a 401/403.
    let res = await fetch(url);
    if (res.status === 401 || res.status === 403) res = await fetch(url, { headers: { Authorization: this.authHeader() } });
    if (!res.ok) throw new VoiceProviderError(`Recording download failed (HTTP ${res.status}).`);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
  }
}
