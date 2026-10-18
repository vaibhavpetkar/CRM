import { promises as dns } from 'dns';
import net from 'net';

/**
 * Stops the server from fetching internal addresses (cloud metadata, other
 * containers, localhost) when a URL comes from a tenant's settings or a
 * provider webhook.
 */
export class UnsafeUrlError extends Error {
  status = 400;
}

export interface UrlGuardOptions {
  /** Also accept plain http:// (some providers serve recordings over http). */
  allowHttp?: boolean;
  /** For tests: resolves a hostname to its addresses. */
  lookup?: (host: string) => Promise<string[]>;
}

const ipv4ToInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;

const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const inV4Range = (ip: string, base: string, bits: number) => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
};

/** Expands an IPv6 address into its eight 16-bit groups. */
const ipv6Groups = (ip: string): number[] | null => {
  let addr = ip.toLowerCase().split('%')[0];
  // A trailing dotted IPv4 part (::ffff:127.0.0.1) becomes two groups.
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (!net.isIPv4(v4[1])) return null;
    const n = ipv4ToInt(v4[1]);
    addr = addr.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(fill, 0)).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g) && g >= 0 && g <= 0xffff) ? groups : null;
};

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export const isPrivateIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) return V4_BLOCKED.some(([base, bits]) => inV4Range(ip, base, bits));
  if (!net.isIPv6(ip)) return true;
  const g = ipv6Groups(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIp(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateIp(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
};

const defaultLookup = async (host: string) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Checks the URL's shape without DNS: scheme, credentials, and an obviously internal host. */
export const checkUrlShape = (raw: string, opts: UrlGuardOptions = {}): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('That is not a valid web address.');
  }
  const okSchemes = opts.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!okSchemes.includes(url.protocol)) throw new UnsafeUrlError(`The address must start with ${opts.allowHttp ? 'http:// or https://' : 'https://'}`);
  if (url.username || url.password) throw new UnsafeUrlError('The address must not contain a username or password.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError('The address points to a private or internal network.');
    return url;
  }
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|lan|home|intranet)$/.test(host)) {
    throw new UnsafeUrlError('The address points to a private or internal network.');
  }
  return url;
};

/** Throws unless the URL is a public address (checked again after DNS). */
export const assertPublicUrl = async (raw: string, opts: UrlGuardOptions = {}): Promise<URL> => {
  const url = checkUrlShape(raw, opts);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return url;
  let addresses: string[];
  try {
    addresses = await (opts.lookup || defaultLookup)(host);
  } catch {
    throw new UnsafeUrlError(`Could not find the server ${host}.`);
  }
  if (!addresses.length || addresses.some(isPrivateIp)) throw new UnsafeUrlError('The address points to a private or internal network.');
  return url;
};

/**
 * fetch() for a URL that came from outside: every hop, redirects included, must
 * be a public address. Redirects are followed by hand (at most 5).
 */
export const safeFetch = async (raw: string, init: RequestInit = {}, opts: UrlGuardOptions = {}): Promise<Response> => {
  let url = raw;
  let { headers } = init;
  for (let hop = 0; hop <= 5; hop++) {
    const current = await assertPublicUrl(url, opts);
    const res = await fetch(current.toString(), { ...init, headers, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    const next = new URL(location, current);
    // Never send our credentials on to another host.
    if (next.host !== current.host) headers = undefined;
    url = next.toString();
  }
  throw new UnsafeUrlError('Too many redirects.');
};
