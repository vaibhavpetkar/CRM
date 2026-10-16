import { currentCompanyId } from '../../tenancy/context';
import { VoiceProviderError } from './types';
import type { ViSettings } from './viSettings';

/**
 * Vi CPaaS login tokens. Click-to-call logs in at clicktocall/AuthToken
 * ({username, password} -> idToken, 24 hours); a token from the Pull Report
 * login is refused by initiate-call with "C2C not configured". The Pull Report
 * API logs in at pullcalldetails/authenticatepullreport ({username, password, dni}).
 */
export const VI_PULL_BASE = 'https://cts.myvi.in:8443/Cpaas/api/v1/pullcalldetails';
export const VI_CTC_AUTH_URL = 'https://cts.myvi.in:8443/Cpaas/api/v1/clicktocall/AuthToken';
const TOKEN_MAX_MS = 24 * 3600 * 1000;

/** The click-to-call login URL next to a CTC URL (…/clicktocall/initiate-call -> …/clicktocall/AuthToken). */
export const viCtcAuthUrl = (ctcUrl: string) => {
  const m = /^(https?:\/\/.+\/clicktocall)\/[^/]+\/?$/i.exec((ctcUrl || '').trim());
  return m ? `${m[1]}/AuthToken` : VI_CTC_AUTH_URL;
};

/** The DNI (Vi service number) as 10 digits: the saved DNI, else the Vi number. */
export const viDni = (s: Pick<ViSettings, 'dni' | 'callerId'>) => {
  const digits = (s.dni || s.callerId || '').replace(/\D/g, '');
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
};

const tokens = new Map<string, { token: string; until: number }>();

/** A token for these credentials, kept per company until shortly before it expires. */
export const viLoginToken = async (
  request: (url: string, init: RequestInit) => Promise<any>,
  login: { username: string; password: string; dni?: string; base?: string; authUrl?: string },
  fresh = false
) => {
  // authUrl: click-to-call login ({username, password}); otherwise the Pull Report login (needs the DNI).
  if (!login.username || !login.password || (!login.authUrl && !login.dni)) {
    throw new VoiceProviderError('Add the Vi username, password and DNI (service number) first.', 400);
  }
  const url = login.authUrl || `${(login.base || VI_PULL_BASE).replace(/\/+$/, '')}/authenticatepullreport`;
  const key = `${currentCompanyId() || 0}|${url}|${login.username}|${login.dni || ''}|${login.password}`;
  const hit = tokens.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.token;
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(login.authUrl ? { username: login.username, password: login.password } : { username: login.username, password: login.password, dni: login.dni }),
  });
  const token = res.idToken || res.Idtoken || res.token || res.data?.token;
  if (typeof token !== 'string' || !token) throw new VoiceProviderError('Vi did not return a login token. Check the Vi username and password.', 400);
  const seconds = Number(res.expiresIn) || 0;
  const life = Math.min(seconds > 0 ? seconds * 1000 : TOKEN_MAX_MS, TOKEN_MAX_MS);
  tokens.set(key, { token, until: Date.now() + life - 5 * 60000 });
  return token;
};
