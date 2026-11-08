// Cleans up one imported lead row: two numbers in one Mobile cell, a single
// "Name" column, sources and statuses written the way people type them, and
// an "Executive Name" that should become the lead's sales person.
import { LEAD_STATUSES } from '../validations/leadValidation';
import { detectNoteStatus } from './leadNotes';

const tenDigits = (raw: string): string | null => {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : null;
};

/** "9822675337/  9175444667" -> ["9822675337", "9175444667"]. One number stays as written. */
export const splitMobiles = (raw: unknown): string[] => {
  const cell = String(raw ?? '').trim();
  if (!cell) return [];
  const parts = cell
    .split(/[\/,;|&\n]+|\s{2,}|\bor\b|\band\b/i)
    .map((p) => tenDigits(p))
    .filter((p): p is string => !!p);
  if (parts.length >= 2) return [...new Set(parts)];
  if (parts.length === 1) return parts;
  // "98226753379175444667" or "9822675337 9175444667"
  const digits = cell.replace(/\D/g, '');
  if (digits.length === 20) return [...new Set([digits.slice(0, 10), digits.slice(10)])];
  return [cell];
};

const SOURCE_WORDS: [RegExp, string][] = [
  [/^(meta|fb|facebook|face book|meta ads?|fb ads?|facebook ads?)$/, 'facebook'],
  [/^(insta|ig|instagram|insta ads?)$/, 'instagram'],
  [/^(walk ?in|walking|walkin|walk in site|site|direct|walk-in)$/, 'walk-in'],
  [/^(cp|channel partner|channel-partner|broker|agent|channel partner broker)$/, 'channel-partner'],
  [/^(google|google ads?|adwords|ppc)$/, 'google-ads'],
  [/^(ref|reference|referral|referred)$/, 'referral'],
  [/^(99 ?acres|99acre)$/, '99acres'],
  [/^(magic ?bricks?|mb)$/, 'magicbricks'],
  [/^(housing|housing com|housing\.com)$/, 'housing.com'],
  [/^(no ?broker)$/, 'nobroker'],
  [/^(web|website|site form)$/, 'website'],
  [/^(hoarding|banner|hoarding banner)$/, 'hoarding'],
  [/^(paper|newspaper|news paper)$/, 'newspaper'],
  [/^(call|incoming|incoming call|inbound)$/, 'incoming-call'],
];

/** "Meta", "Walking", "Insta", "CP" -> facebook, walk-in, instagram, channel-partner. */
export const normalizeImportSource = (raw: unknown): string | undefined => {
  const text = String(raw ?? '').toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  for (const [re, value] of SOURCE_WORDS) if (re.test(text)) return value;
  return text.replace(/\s+/g, '-');
};

/** "Site Visit Done", "SV done", "site-visit-done" -> "site-visit-done". Unknown text is dropped. */
export const normalizeImportStatus = (raw: unknown): string | undefined => {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  const dashed = text.toLowerCase().replace(/[\s_]+/g, '-');
  if (LEAD_STATUSES.includes(dashed)) return dashed;
  // A Status column that just says "Site Visit" / "Revisit" means it happened
  // (notes need "done"; a status column names where the lead is).
  if (/^(site-?visit|sv|visit)$/.test(dashed)) return 'site-visit-done';
  if (/^re-?visit$/.test(dashed)) return 'revisit-done';
  return detectNoteStatus(text) ?? undefined;
};

/** "Sonal A Dabhade" -> ["Sonal A", "Dabhade"]; one word goes to the first name. */
export const splitFullName = (raw: unknown): [string, string] => {
  const words = String(raw ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] || '', ''];
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
};

/** "2026-10-31", "31/10/26", "31-10-2026" -> "2026-10-31". */
export const importDay = (raw: unknown): string | null => {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(text);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Lead status -> site visit status, for leads whose import says the visit happened. */
export const VISIT_FROM_LEAD_STATUS: Record<string, 'completed' | 'revisit-done'> = {
  'site-visit-done': 'completed',
  'revisit-done': 'revisit-done',
};
