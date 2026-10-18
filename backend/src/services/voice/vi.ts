import type { CallStatus } from '../../models/Call';
import { CallUpdate, PlaceCallInput, PlaceCallResult, RecordingDownload, VoiceProvider, VoiceProviderError } from './types';
import { DEFAULT_ENCRYPTED_TEMPLATE, ViSettings, decryptViPayload, loadViSettings, peekViSettings } from './viSettings';
import { aesEncrypt } from '../../utils/aesCbc';
import { viCtcAuthUrl, viLoginToken } from './viToken';
import { UnsafeUrlError, safeFetch } from '../../utils/urlGuard';

/**
 * Vi (Vodafone Idea) CPaaS cloud calling. Used when a company switches it on
 * under Settings > Integrations > Vi CPaaS (see ./viSettings.ts), or for
 * everyone with VOICE_PROVIDER=vi and the env vars below.
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
 *   VI_AES_KEY / VI_AES_IV / VI_ENCRYPT_REQUESTS / VI_ENCRYPTED_TEMPLATE
 *                       AES-256-CBC payload encryption (OBD encryption key & IV)
 *   VI_PULL_URL / VI_PULL_USERNAME / VI_PULL_PASSWORD   Pull API for call reports
 *   VI_CALL_START / VI_CALL_END   OBD calling hours, "09:00" / "21:00" IST
 *
 * The request template can also use {{username}}, {{password}} (OBD API
 * credential) and {{reference}} (our call reference, echoed back by Vi).
 *
 * Vi should be set to post call events (answered, ended, recording) to the
 * per-call callback URL we send as {{callbackUrl}}.
 */
const env = (name: string) => (process.env[name] || '').trim();

/** Vi CPaaS click-to-call, from the Vi API document (Basic or Bearer auth). */
export const VI_CTC_URL = 'https://cts.myvi.in:8443/Cpaas/api/v1/clicktocall/initiate-call';

// initiate-call: Vi rings A (our sales person) from the CLI, then B (the customer).
// channelflag 0 + recordingflag 0 = normal recording; dtmfflag 0 = no DTMF.
export const DEFAULT_TEMPLATE = JSON.stringify({
  cli: '{{callerId}}',
  apartyno: '{{agent}}',
  bpartyno: '{{customer}}',
  reference_id: '{{reference}}',
  channelflag: 0,
  dtmfflag: 0,
  recordingflag: 0,
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

// "CALL ID", "call_id" and "callId" are the same field: compare names without case, spaces or punctuation.
const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** First non-empty value found under any of `keys`, looking inside data/result/call wrappers too. */
export const pick = (body: any, keys: string[]): any => {
  // Vi CPaaS nests the call id in "message": {"status":1,"message":{"callid":26988056,...}}.
  const layers = [body, body?.message, body?.data, body?.result, body?.call, body?.Call, body?.response, body?.data?.call];
  const wanted = keys.map(keyOf);
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const byKey = new Map<string, unknown>();
    for (const [k, v] of Object.entries(layer)) if (!byKey.has(keyOf(k)) && v !== undefined && v !== null && v !== '') byKey.set(keyOf(k), v);
    for (const k of wanted) if (byKey.has(k)) return byKey.get(k);
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
  // Vi's reports write Indian time as "16/10/2026 22:54:55".
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2}:\d{2})$/);
  if (dmy) return toDate(`${dmy[3]}-${dmy[2]}-${dmy[1]} ${dmy[4]}`);
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? new Date(`${s.replace(' ', 'T')}+05:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A date and a time Vi's reports keep in separate columns ("CALL END DATE" + "CALL END TIME"). */
const pickDateTime = (body: Record<string, any>, prefix: string): Date | null => {
  const date = pick(body, [`${prefix} DATE`]);
  const time = pick(body, [`${prefix} TIME`]);
  return date && time ? toDate(`${String(date).trim()} ${String(time).trim()}`) : null;
};

/**
 * Vi's click-to-call report (Pull API and pingback): the A party is the sales
 * person, rung first; the B party is the customer, dialled once A picks up.
 */
const mapViPartyReport = (body: Record<string, any>): CallUpdate | null => {
  const aStatus = pick(body, ['A PARTY DIAL STATUS']);
  const bStatus = pick(body, ['B PARTY DIAL STATUS']);
  if (aStatus === undefined && bStatus === undefined && pick(body, ['A PARTY NO']) === undefined) return null;
  const aAnswered = !!pickDateTime(body, 'A PARTY CALL START');
  const bStarted = pickDateTime(body, 'B PARTY CALL START');
  const talk = toSeconds(pick(body, ['B PARTY CALL DURATION(In Seconds)', 'B PARTY CALL DURATION']));
  const endedAt = pickDateTime(body, 'CALL END') || pickDateTime(body, 'B PARTY CALL END') || pickDateTime(body, 'A PARTY DIAL END');
  let status: CallStatus | undefined;
  if (bStarted || (talk ?? 0) > 0) status = endedAt ? 'completed' : 'in-progress';
  else if (endedAt || aStatus || bStatus) {
    // Nobody talked: the leg that failed says why (busy, or no answer).
    const failed = String((aAnswered ? bStatus : aStatus) ?? '');
    status = /busy|reject|declin/i.test(failed) ? 'busy' : /fail|invalid|error/i.test(failed) ? 'failed' : 'no-answer';
  }
  const recording = pick(body, ['RECORD', 'recording_url', 'recordingUrl']);
  return {
    providerCallId: pick(body, ['CALL ID']) !== undefined ? String(pick(body, ['CALL ID'])) : null,
    status,
    durationSeconds: talk,
    startedAt: bStarted,
    endedAt,
    recordingUrl: typeof recording === 'string' && /^https?:\/\//i.test(recording) ? recording : null,
  };
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
  const report = mapViPartyReport(body);
  if (report) return report;
  const id = pick(body, ['callid', 'call_id', 'callId', 'CallId', 'CallID', 'CallSid', 'call_sid', 'sid', 'uuid', 'call_uuid', 'id']);
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

const authHeaders = (s: ViSettings): Record<string, string> => {
  const { authType: type, username: user, password: secret } = s;
  if (type === 'none' || type === 'token' || (!secret && !user)) return {};
  if (type === 'basic') return { Authorization: `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}` };
  if (type === 'header') return { [s.authHeader || 'Authorization']: s.authScheme ? `${s.authScheme} ${secret}` : secret };
  return { Authorization: `Bearer ${secret}` };
};

/** India time now, as minutes after midnight. */
const istMinutes = (now = new Date()) => {
  const ist = new Date(now.getTime() + 330 * 60000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Vi CPaaS only connects calls inside the OBD time set on its portal; say so before trying. */
export const outsideCallingHours = (s: Pick<ViSettings, 'callStart' | 'callEnd'>, now = new Date()) => {
  if (!s.callStart || !s.callEnd) return null;
  const m = istMinutes(now);
  const [a, b] = [toMinutes(s.callStart), toMinutes(s.callEnd)];
  const inside = a <= b ? m >= a && m < b : m >= a || m < b;
  return inside ? null : `Vi only connects calls between ${s.callStart} and ${s.callEnd} (India time). Try again then.`;
};

/** The body sent to Vi: the filled template, AES-256-CBC encrypted when that is switched on. */
export const buildViBody = (s: ViSettings, values: Record<string, string>) => {
  const body = fillTemplate(s.requestTemplate || DEFAULT_TEMPLATE, values);
  if (!s.encryptRequests) return body;
  if (!s.aesKey || !s.aesIv) throw new VoiceProviderError('Vi encryption is on but the AES key or IV is missing.', 400);
  let encrypted: string;
  try {
    encrypted = aesEncrypt(JSON.stringify(body), s.aesKey, s.aesIv);
  } catch (err) {
    throw new VoiceProviderError((err as Error).message, 400);
  }
  return fillTemplate(s.encryptedTemplate || DEFAULT_ENCRYPTED_TEMPLATE, { encrypted });
};

/**
 * Sends a request to Vi and reads the (maybe encrypted) answer. The CTC
 * credential goes in the headers unless `headers` already carries an
 * Authorization (the Pull API sends its own bearer token).
 */
/** A short, plain-text piece of a non-JSON answer, so an error never echoes a whole page back. */
const rawSnippet = (raw: unknown) =>
  typeof raw === 'string' ? raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';

export const viRequest = async (s: ViSettings, url: string, init: RequestInit = {}) => {
  let res: Response;
  try {
    // The URL can come from the company's settings, so it must be a public address.
    res = await safeFetch(
      url,
      {
        ...init,
        headers: { Accept: 'application/json', ...authHeaders(s), ...((init.headers as Record<string, string>) || {}) },
        signal: AbortSignal.timeout(20000),
      },
      { allowHttp: true },
    );
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new VoiceProviderError(`Vi address not allowed: ${err.message}`, 400);
    throw new VoiceProviderError(`Could not reach Vi: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text ? { raw: text } : null;
  }
  body = decryptViPayload(body || {}, s);
  // Vi CPaaS answers failures as {"status": 0, "message": "..."}.
  const failed = body && (body.success === false || /^(error|fail)/i.test(String(body.status ?? '')) || (body.status === 0 && body.message));
  if (!res.ok || failed) {
    const message = body?.message || body?.error?.message || body?.error || rawSnippet(body?.raw) || `HTTP ${res.status}`;
    throw new VoiceProviderError(`Vi refused the request: ${message}`, [401, 403, 406].includes(res.status) ? 502 : 400);
  }
  return body || {};
};

export class ViProvider implements VoiceProvider {
  readonly key = 'vi';
  readonly label = 'Vi CPaaS (Vodafone Idea)';

  /** Loads this company's Vi settings so the quick checks below can read them. */
  async prepare() {
    await loadViSettings();
  }

  private get settings() {
    return peekViSettings();
  }

  missingEnvVars() {
    const s = this.settings;
    if (s.source === 'saved') return [];
    return [!s.ctcUrl && 'VI_API_URL', !s.password && 'VI_API_KEY'].filter(Boolean) as string[];
  }

  defaultCallerId() {
    return this.settings.callerId || null;
  }

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const s = await loadViSettings();
    const callerId = input.callerId || s.callerId || '';
    if (!callerId) throw new VoiceProviderError('No calling number is set up. Add your Vi number under Settings > Integrations > Vi CPaaS or Calling numbers.', 400);
    const closed = outsideCallingHours(s);
    if (closed) throw new VoiceProviderError(closed, 400);
    const body = buildViBody(s, {
      agent: toNational(input.agentNumber),
      customer: toNational(input.customerNumber),
      agentE164: input.agentNumber,
      customerE164: input.customerNumber,
      callerId: toNational(callerId),
      callbackUrl: input.statusCallbackUrl,
      record: input.record ? 'true' : 'false',
      accountId: s.accountId,
      username: s.username,
      password: s.password,
      reference: input.reference || '',
    });
    const send = async (fresh: boolean) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (s.authType === 'token') {
        const login = { username: s.username, password: s.password, authUrl: viCtcAuthUrl(s.ctcUrl || VI_CTC_URL) };
        headers.Authorization = `Bearer ${await viLoginToken((url, init) => viRequest({ ...s, authType: 'none' }, url, init), login, fresh)}`;
      }
      return viRequest(s, s.ctcUrl || VI_CTC_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    };
    let res: any;
    try {
      res = await send(false);
    } catch (err) {
      // An expired token (403/406): log in again once.
      if (s.authType !== 'token' || !(err instanceof VoiceProviderError) || err.status !== 502) throw err;
      res = await send(true);
    }
    const mapped = mapViCall(res);
    if (!mapped.providerCallId) throw new VoiceProviderError('Vi accepted the request but did not return a call id. Check the CTC API URL against your Vi API document.');
    return { providerCallId: mapped.providerCallId, status: mapped.status && mapped.status !== 'completed' ? mapped.status : 'queued', callerId };
  }

  async getCall(providerCallId: string): Promise<CallUpdate> {
    const s = await loadViSettings();
    // Without a status URL we rely on Vi's pushes and the Pull API.
    if (!s.statusUrl) return {};
    return mapViCall(await viRequest(s, s.statusUrl.replace(/\{\{callId\}\}/g, encodeURIComponent(providerCallId))));
  }

  parseCallback(body: Record<string, any>): CallUpdate {
    return mapViCall(decryptViPayload(body || {}, this.settings));
  }

  async downloadRecording(url: string): Promise<RecordingDownload> {
    const s = await loadViSettings();
    // The URL arrives in Vi's webhook, so it must be a public address.
    let res = await safeFetch(url, { signal: AbortSignal.timeout(60000) }, { allowHttp: true });
    if (res.status === 401 || res.status === 403) res = await safeFetch(url, { headers: authHeaders(s), signal: AbortSignal.timeout(60000) }, { allowHttp: true });
    if (!res.ok) throw new VoiceProviderError(`Recording download failed (HTTP ${res.status}).`);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
  }
}
