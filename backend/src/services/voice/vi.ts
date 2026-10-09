import type { CallStatus } from '../../models/Call';
import { CallUpdate, PlaceCallInput, PlaceCallResult, RecordingDownload, VoiceProvider, VoiceProviderError } from './types';

/**
 * Vi (Vodafone Idea) Business cloud calling, VOICE_PROVIDER=vi.
 *
 * Vi Business sells click-to-call / "Smart Call Connect" on enterprise
 * contracts and hands each customer its own API document, so there is no
 * single public spec to code against. This provider therefore speaks the
 * common shape those click-to-call APIs share, and every part of it can be
 * matched to the document Vi gives you through env vars, without code:
 *
 *   VI_API_URL          (required) the click-to-call endpoint, e.g. https://.../clicktocall
 *   VI_API_KEY          (required) API key / token from Vi
 *   VI_CALLER_ID        (required unless numbers are added in Settings) the Vi DID / virtual number
 *   VI_AUTH_HEADER      header carrying the key (default Authorization)
 *   VI_AUTH_SCHEME      prefix before the key (default Bearer; set to "none" for a bare key)
 *   VI_ACCOUNT_ID       optional account / customer id, available as {{accountId}}
 *   VI_REQUEST_TEMPLATE optional JSON body with placeholders {{agent}}, {{customer}},
 *                       {{callerId}}, {{callbackUrl}}, {{record}}, {{accountId}};
 *                       numbers are 10 digits (use {{agentE164}} / {{customerE164}} for +91...)
 *   VI_STATUS_URL       optional URL to read one call, with {{callId}}, used to poll
 *                       status when a webhook is missed
 *
 * Vi should be set to post call events (answered, ended, recording) to the
 * per-call callback URL we send as {{callbackUrl}}.
 */
const env = (name: string) => (process.env[name] || '').trim();

const DEFAULT_TEMPLATE = JSON.stringify({
  agent_number: '{{agent}}',
  customer_number: '{{customer}}',
  caller_id: '{{callerId}}',
  record: '{{record}}',
  callback_url: '{{callbackUrl}}',
});

/** "+919876543210" -> "9876543210" */
export const toNational = (e164: string | null | undefined) => (e164 && /^\+91\d{10}$/.test(e164) ? e164.slice(3) : e164 || '');

/** Fills {{placeholders}} inside every string of a JSON template. */
export const fillTemplate = (template: string, values: Record<string, string>) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch {
    throw new VoiceProviderError('VI_REQUEST_TEMPLATE is not valid JSON.', 500);
  }
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = v.match(/^\{\{(\w+)\}\}$/);
      if (whole && values[whole[1]] !== undefined) return values[whole[1]];
      return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (values[k] !== undefined ? values[k] : m));
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(parsed);
};

/** First non-empty value found under any of `keys`, looking inside data/result/call wrappers too. */
export const pick = (body: any, keys: string[]): any => {
  const layers = [body, body?.data, body?.result, body?.call, body?.Call, body?.response, body?.data?.call];
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    for (const k of keys) {
      const value = layer[k];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
};

// Words click-to-call platforms use for call states, mapped onto ours.
const STATUS_WORDS: [RegExp, CallStatus][] = [
  [/no[\s_-]?answer|not[\s_-]?answered|missed|unanswered/i, 'no-answer'],
  [/busy|rejected|declined/i, 'busy'],
  [/cancel/i, 'canceled'],
  [/fail|error|invalid/i, 'failed'],
  [/complete|ended|hangup|hang[\s_-]up|disconnected|finished|success/i, 'completed'],
  [/answer|connected|in[\s_-]?progress|bridged|talking|ongoing/i, 'in-progress'],
  [/ring|dialing|dialling|initiated/i, 'ringing'],
  [/queue|accepted|submitted|scheduled/i, 'queued'],
];

export const toViStatus = (value: unknown): CallStatus | undefined => {
  const s = String(value ?? '').trim();
  if (!s) return undefined;
  for (const [re, status] of STATUS_WORDS) if (re.test(s)) return status;
  return undefined;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? new Date(`${s.replace(' ', 'T')}+05:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toSeconds = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value);
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Maps a Vi response or webhook body onto our fields, whatever it calls them. */
export const mapViCall = (body: Record<string, any>): CallUpdate => {
  const id = pick(body, ['call_id', 'callId', 'CallSid', 'call_sid', 'sid', 'uuid', 'call_uuid', 'reference_id', 'ref_id', 'id']);
  const recording = pick(body, ['recording_url', 'recordingUrl', 'RecordingUrl', 'recording', 'record_url', 'recording_file']);
  const endedAt = toDate(pick(body, ['end_time', 'endTime', 'EndTime', 'ended_at', 'hangup_time']));
  let status = toViStatus(pick(body, ['call_status', 'callStatus', 'status', 'Status', 'state', 'event', 'disposition']));
  // A final report often just says "ANSWERED" (a CDR disposition): with an end time, the call is over.
  if (status === 'in-progress' && endedAt) status = 'completed';
  return {
    providerCallId: id !== undefined ? String(id) : null,
    status,
    durationSeconds: toSeconds(pick(body, ['talk_time', 'talkTime', 'conversation_duration', 'bill_sec', 'billsec', 'duration', 'Duration', 'call_duration'])),
    startedAt: toDate(pick(body, ['answer_time', 'answered_at', 'start_time', 'startTime', 'StartTime', 'started_at'])),
    endedAt,
    recordingUrl: typeof recording === 'string' && /^https?:\/\//i.test(recording) ? recording : null,
  };
};

export class ViProvider implements VoiceProvider {
  readonly key = 'vi';
  readonly label = 'Vi Business (Vodafone Idea)';

  missingEnvVars() {
    return ['VI_API_URL', 'VI_API_KEY'].filter((n) => !env(n));
  }

  defaultCallerId() {
    return env('VI_CALLER_ID') || null;
  }

  private headers(extra: Record<string, string> = {}) {
    const scheme = env('VI_AUTH_SCHEME') || 'Bearer';
    const value = scheme.toLowerCase() === 'none' ? env('VI_API_KEY') : `${scheme} ${env('VI_API_KEY')}`;
    return { [env('VI_AUTH_HEADER') || 'Authorization']: value, Accept: 'application/json', ...extra };
  }

  private async request(url: string, init: RequestInit = {}) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...this.headers(), ...((init.headers as Record<string, string>) || {}) } });
    } catch (err) {
      throw new VoiceProviderError(`Could not reach Vi: ${(err as Error).message}`);
    }
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    const failed = body && (body.success === false || /^(error|fail)/i.test(String(body.status ?? '')));
    if (!res.ok || failed) {
      const message = body?.message || body?.error?.message || body?.error || text.slice(0, 200) || `HTTP ${res.status}`;
      throw new VoiceProviderError(`Vi refused the call: ${message}`, res.status === 401 || res.status === 403 ? 502 : 400);
    }
    return body || {};
  }

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const callerId = input.callerId || (env('VI_CALLER_ID') ? env('VI_CALLER_ID') : '');
    if (!callerId) throw new VoiceProviderError('No calling number is set up. Add your Vi number under Settings > Integrations > Calling numbers, or set VI_CALLER_ID.', 400);
    const body = fillTemplate(env('VI_REQUEST_TEMPLATE') || DEFAULT_TEMPLATE, {
      agent: toNational(input.agentNumber),
      customer: toNational(input.customerNumber),
      agentE164: input.agentNumber,
      customerE164: input.customerNumber,
      callerId: toNational(callerId),
      callbackUrl: input.statusCallbackUrl,
      record: input.record ? 'true' : 'false',
      accountId: env('VI_ACCOUNT_ID'),
    });
    const res = await this.request(env('VI_API_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const mapped = mapViCall(res);
    if (!mapped.providerCallId) throw new VoiceProviderError('Vi accepted the request but did not return a call id. Check VI_API_URL against your Vi API document.');
    return { providerCallId: mapped.providerCallId, status: mapped.status && mapped.status !== 'completed' ? mapped.status : 'queued', callerId };
  }

  async getCall(providerCallId: string): Promise<CallUpdate> {
    const template = env('VI_STATUS_URL');
    // Without a status URL we rely on Vi's webhooks alone.
    if (!template) return {};
    return mapViCall(await this.request(template.replace(/\{\{callId\}\}/g, encodeURIComponent(providerCallId))));
  }

  parseCallback(body: Record<string, any>): CallUpdate {
    return mapViCall(body || {});
  }

  async downloadRecording(url: string): Promise<RecordingDownload> {
    let res = await fetch(url);
    if (res.status === 401 || res.status === 403) res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new VoiceProviderError(`Recording download failed (HTTP ${res.status}).`);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
  }
}
