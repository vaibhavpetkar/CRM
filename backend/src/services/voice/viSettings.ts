import Integration from '../../models/Integration';
import { currentCompanyId } from '../../tenancy/context';
import { openSecret, parseAesBytes, sealSecret, aesDecrypt } from '../../utils/aesCbc';
import { checkUrlShape } from '../../utils/urlGuard';

/**
 * Vi CPaaS settings for one company, saved from Settings > Integrations >
 * Vi CPaaS (an `integrations` row, provider 'vi_cpaas'). The sections follow
 * the Vi CPaaS portal's Configuration menu: CTC, OBD API credential, Pull API
 * credential, Schema credential, OBD time and the AES-256-CBC key & IV.
 * Without saved settings the VI_* env vars apply (see ./vi.ts).
 */
export const VI_PROVIDER_ROW = 'vi_cpaas';

// 'token': Vi's own login token (authenticatepullreport), what initiate-call accepts.
export type ViAuthType = 'token' | 'bearer' | 'basic' | 'header' | 'none';

export interface ViSettings {
  source: 'saved' | 'env';
  enabled: boolean;
  // CTC configuration
  ctcUrl: string;
  callerId: string;
  requestTemplate: string;
  statusUrl: string;
  // OBD API credential
  authType: ViAuthType;
  authHeader: string;
  authScheme: string; // env only: prefix before the key in a custom header
  username: string;
  password: string; // API key / token / password
  accountId: string;
  // Pull API credential
  pullUrl: string; // base of Vi's pullcalldetails API; empty = Vi's own (VI_PULL_BASE)
  pullUsername: string;
  pullPassword: string;
  dni: string; // Vi service number the reports are for; empty = the Vi number above
  // Schema credential: what Vi sends with its pushes to our URL (Basic auth)
  webhookUsername: string;
  webhookPassword: string;
  // OBD time
  callStart: string; // "09:00", IST
  callEnd: string; // "21:00"
  // OBD encryption key & IV for AES 256 CBC
  aesKey: string;
  aesIv: string;
  encryptRequests: boolean;
  encryptedTemplate: string;
}

export const SECRET_FIELDS = ['password', 'pullPassword', 'webhookPassword', 'aesKey', 'aesIv'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];
const PLAIN_FIELDS = [
  'ctcUrl', 'callerId', 'requestTemplate', 'statusUrl', 'authType', 'authHeader', 'username', 'accountId',
  'pullUrl', 'pullUsername', 'dni', 'webhookUsername', 'callStart', 'callEnd', 'encryptedTemplate',
] as const;

export const DEFAULT_ENCRYPTED_TEMPLATE = '{"data":"{{encrypted}}"}';
const AUTH_TYPES: ViAuthType[] = ['token', 'bearer', 'basic', 'header', 'none'];
const asAuth = (v: unknown, fallback: ViAuthType): ViAuthType => (AUTH_TYPES.includes(v as ViAuthType) ? (v as ViAuthType) : fallback);
const env = (name: string) => (process.env[name] || '').trim();

const empty = (): ViSettings => ({
  source: 'env', enabled: false, ctcUrl: '', callerId: '', requestTemplate: '', statusUrl: '', authType: 'token',
  authHeader: '', authScheme: '', username: '', password: '', accountId: '', pullUrl: '',
  pullUsername: '', pullPassword: '', dni: '', webhookUsername: '', webhookPassword: '', callStart: '', callEnd: '',
  aesKey: '', aesIv: '', encryptRequests: false, encryptedTemplate: DEFAULT_ENCRYPTED_TEMPLATE,
});

/** The VI_* env vars, as before settings could be saved in the CRM. */
export const envSettings = (): ViSettings => {
  const scheme = env('VI_AUTH_SCHEME') || 'Bearer';
  const header = env('VI_AUTH_HEADER') || 'Authorization';
  const plainBearer = scheme.toLowerCase() === 'bearer' && header.toLowerCase() === 'authorization';
  return {
    ...empty(),
    source: 'env',
    enabled: !!env('VI_API_URL') && !!env('VI_API_KEY'),
    ctcUrl: env('VI_API_URL'),
    callerId: env('VI_CALLER_ID'),
    requestTemplate: env('VI_REQUEST_TEMPLATE'),
    statusUrl: env('VI_STATUS_URL'),
    authType: plainBearer ? 'bearer' : 'header',
    authHeader: header,
    authScheme: scheme.toLowerCase() === 'none' || plainBearer ? '' : scheme,
    password: env('VI_API_KEY'),
    accountId: env('VI_ACCOUNT_ID'),
    pullUrl: env('VI_PULL_URL'),
    pullUsername: env('VI_PULL_USERNAME'),
    pullPassword: env('VI_PULL_PASSWORD'),
    dni: env('VI_DNI'),
    aesKey: env('VI_AES_KEY'),
    aesIv: env('VI_AES_IV'),
    encryptRequests: /^(1|true|yes)$/i.test(env('VI_ENCRYPT_REQUESTS')),
    encryptedTemplate: env('VI_ENCRYPTED_TEMPLATE') || DEFAULT_ENCRYPTED_TEMPLATE,
    callStart: env('VI_CALL_START'),
    callEnd: env('VI_CALL_END'),
  };
};

interface StoredConfig extends Partial<Record<(typeof PLAIN_FIELDS)[number], string>> {
  encryptRequests?: boolean;
  secrets?: Partial<Record<SecretField, string>>; // sealed
}

const readStored = (raw?: string | null): StoredConfig => {
  try {
    const c = raw ? JSON.parse(raw) : {};
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
};

export const fromRow = (row: Integration | null): ViSettings | null => {
  if (!row) return null;
  const c = readStored(row.config);
  const s = empty();
  for (const f of PLAIN_FIELDS) if (typeof c[f] === 'string') (s as any)[f] = c[f];
  for (const f of SECRET_FIELDS) s[f] = openSecret(c.secrets?.[f]);
  s.authType = asAuth(c.authType, 'token');
  s.encryptRequests = !!c.encryptRequests;
  s.encryptedTemplate = s.encryptedTemplate || DEFAULT_ENCRYPTED_TEMPLATE;
  s.source = 'saved';
  s.enabled = row.isEnabled; // an empty CTC URL means Vi's own initiate-call
  return s;
};

// Read on every call and webhook, so kept briefly in memory per company.
const CACHE_MS = 30000;
const cache = new Map<number, { at: number; settings: ViSettings | null }>();

export const clearViSettingsCache = (companyId?: number | null) => (companyId ? cache.delete(companyId) : cache.clear());

/** This company's saved settings (null when it saved none). */
export const loadSavedViSettings = async (companyId = currentCompanyId()): Promise<ViSettings | null> => {
  if (!companyId) return null;
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.settings;
  const row = await Integration.findOne({ where: { provider: VI_PROVIDER_ROW } });
  const settings = fromRow(row);
  cache.set(companyId, { at: Date.now(), settings });
  return settings;
};

/** What a Vi call or webhook in this company uses: saved settings when switched on, else the env. */
export const loadViSettings = async (companyId = currentCompanyId()): Promise<ViSettings> => {
  const saved = await loadSavedViSettings(companyId);
  return saved?.enabled ? saved : envSettings();
};

/** The last settings loaded for this company, for code that can't wait (see ViProvider). */
export const peekViSettings = (companyId = currentCompanyId()): ViSettings => {
  const saved = companyId ? cache.get(companyId)?.settings : null;
  return saved?.enabled ? saved : envSettings();
};

/** Is Vi CPaaS switched on in this company's own settings? */
export const viSwitchedOn = async (companyId = currentCompanyId()) => !!(await loadSavedViSettings(companyId))?.enabled;

// ─── Admin form ─────────────────────────────────────────────────────────────

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks and stores what the admin typed. Secrets left blank keep their saved value; "-" clears one. */
export const buildStoredConfig = (previous: string | null | undefined, input: Record<string, unknown>) => {
  const before = readStored(previous);
  const next: StoredConfig = { ...before, secrets: { ...(before.secrets || {}) } };
  for (const f of PLAIN_FIELDS) {
    if (input[f] === undefined) continue;
    next[f] = typeof input[f] === 'string' ? (input[f] as string).trim().slice(0, 4000) : '';
  }
  if (input.encryptRequests !== undefined) next.encryptRequests = !!input.encryptRequests;
  for (const f of SECRET_FIELDS) {
    const v = input[f];
    if (typeof v !== 'string' || v === '') continue;
    if (v.trim() === '-') delete next.secrets![f];
    else next.secrets![f] = sealSecret(v.trim());
  }

  const errors: string[] = [];
  for (const f of ['ctcUrl', 'statusUrl', 'pullUrl'] as const) {
    if (!next[f]) continue;
    const label = f === 'ctcUrl' ? 'CTC API URL' : f === 'statusUrl' ? 'Call status URL' : 'Pull API address';
    if (!/^https?:\/\//i.test(next[f]!)) {
      errors.push(`${label} must start with https://`);
      continue;
    }
    // The server calls these addresses, so they must not point inside our network.
    try {
      checkUrlShape(next[f]!.replace(/\{\{\w+\}\}/g, 'x'), { allowHttp: true });
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`);
    }
  }
  for (const f of ['requestTemplate', 'encryptedTemplate'] as const) {
    if (!next[f]) continue;
    try {
      JSON.parse(next[f]!);
    } catch {
      errors.push(`${f === 'requestTemplate' ? 'CTC request body' : 'Encrypted body'} is not valid JSON.`);
    }
  }
  for (const f of ['callStart', 'callEnd'] as const) if (next[f] && !TIME.test(next[f]!)) errors.push('Calling hours must look like 09:00 and 21:00.');
  const key = next.secrets!.aesKey ? openSecret(next.secrets!.aesKey) : '';
  const iv = next.secrets!.aesIv ? openSecret(next.secrets!.aesIv) : '';
  try {
    if (key) parseAesBytes(key, 32);
    if (iv) parseAesBytes(iv, 16, 'IV');
  } catch (err) {
    errors.push((err as Error).message);
  }
  if (next.dni && !/^\+?\d[\d\s-]{5,20}$/.test(next.dni)) errors.push('The DNI must be a phone number, e.g. 97xxxxxx42.');
  if (next.encryptRequests && (!key || !iv)) errors.push('Add the AES key and IV before switching on encryption.');
  return { config: next, errors: [...new Set(errors)] };
};

/** What the settings screen shows: plain fields as typed, secrets only as "saved". */
export const describeForAdmin = (s: ViSettings | null) => {
  const v = s || empty();
  return {
    ...Object.fromEntries(PLAIN_FIELDS.map((f) => [f, (v as any)[f] || ''])),
    authType: v.authType,
    encryptRequests: v.encryptRequests,
    secretsSet: Object.fromEntries(SECRET_FIELDS.map((f) => [f, !!v[f]])) as Record<SecretField, boolean>,
  };
};

// ─── Encrypted payloads ─────────────────────────────────────────────────────

const ENCRYPTED_KEYS = ['data', 'payload', 'encData', 'enc_data', 'encdata', 'encrypted', 'encryptedData', 'encrypted_data', 'request', 'response', 'raw', 'body'];

const tryJson = (text: string): Record<string, any> | null => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : null;
  } catch {
    // Some platforms encrypt a query string instead of JSON.
    if (/^[\w.-]+=[^&]*(&[\w.-]+=[^&]*)*$/.test(text)) return Object.fromEntries(new URLSearchParams(text));
    return null;
  }
};

/**
 * Vi sends AES-256-CBC payloads either as the whole body or inside one field
 * ({"data": "<base64>"}). With a key and IV saved, any such field that
 * decrypts to JSON is opened and its fields merged in; anything else is left
 * as it came, so unencrypted events keep working.
 */
export const decryptViPayload = (body: unknown, s: Pick<ViSettings, 'aesKey' | 'aesIv'>): Record<string, any> => {
  const obj: Record<string, any> = typeof body === 'string' ? { raw: body } : body && typeof body === 'object' ? { ...(body as any) } : {};
  if (!s.aesKey || !s.aesIv) return obj;
  for (const k of ENCRYPTED_KEYS) {
    const v = obj[k];
    if (typeof v !== 'string' || v.length < 16 || /^[{[]/.test(v.trim())) continue;
    try {
      const opened = tryJson(aesDecrypt(v, s.aesKey, s.aesIv));
      if (opened) {
        delete obj[k];
        return { ...obj, ...opened };
      }
    } catch {
      // not cipher text
    }
  }
  return obj;
};
