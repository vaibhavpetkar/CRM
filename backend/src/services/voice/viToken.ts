import { currentCompanyId } from '../../tenancy/context';
import { VoiceProviderError } from './types';
import type { ViSettings } from './viSettings';

/**
 * Vi CPaaS login token. The authenticatepullreport API ({username, password,
 * dni} -> idToken) issues the Bearer token that both pullreport and
 * clicktocall/initiate-call accept (initiate-call answers 403 to Basic auth).
 */
export const VI_PULL_BASE = 'https://cts.myvi.in:8443/Cpaas/api/v1/pullcalldetails';
const TOKEN_MAX_MS = 10 * 3600 * 1000; // Vi tokens last 10 hours

/** The DNI (Vi service number) as 10 digits: the saved DNI, else the Vi number. */
export const viDni = (s: Pick<ViSettings, 'dni' | 'callerId'>) => {
  const digits = (s.dni || s.callerId || '').replace(/\D/g, '');
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
};

const tokens = new Map<string, { token: string; until: number }>();

/** A token for these credentials, kept per company until shortly before it expires. */
export const viLoginToken = async (
  request: (url: string, init: RequestInit) => Promise<any>,
  login: { username: string; password: string; dni: string; base?: string },
  fresh = false
) => {
  if (!login.username || !login.password || !login.dni) {
    throw new VoiceProviderError('Add the Vi username, password and DNI (service number) first.', 400);
  }
  const base = (login.base || VI_PULL_BASE).replace(/\/+$/, '');
  const key = `${currentCompanyId() || 0}|${base}|${login.username}|${login.dni}|${login.password}`;
  const hit = tokens.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.token;
  const res = await request(`${base}/authenticatepullreport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: login.username, password: login.password, dni: login.dni }),
  });
  const token = res.idToken || res.Idtoken || res.token || res.data?.token;
  if (typeof token !== 'string' || !token) throw new VoiceProviderError('Vi did not return a login token. Check the username, password and DNI.', 400);
  const seconds = Number(res.expiresIn) || 0;
  const life = Math.min(seconds > 0 ? seconds * 1000 : TOKEN_MAX_MS, TOKEN_MAX_MS);
  tokens.set(key, { token, until: Date.now() + life - 5 * 60000 });
  return token;
};
