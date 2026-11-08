import type { ImportExportField } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "+91 98765-43210", "098765 43210" -> "9876543210"; null when it isn't a 10 digit Indian mobile. */
export function normalizeMobile(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

/** Checks one cell against its field definition, so a bad value is reported
 * in the preview row instead of as a generic server "Validation failed".
 * Returns an error message, or null when the value is fine. */
export function validateCell(field: ImportExportField, raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return field.required ? `${field.label} is required` : null;

  switch (field.type) {
    case 'number':
      return Number.isFinite(Number(value)) ? null : `${field.label} must be a number (got "${value}")`;
    case 'date':
      return isValidDate(value) ? null : `${field.label} must be a date as YYYY-MM-DD (got "${value}")`;
    case 'email':
      return EMAIL_RE.test(value) ? null : `${field.label} must be an email address (got "${value}")`;
    case 'mobile':
      return normalizeMobile(value) ? null : `${field.label} must be a 10 digit mobile number (got "${value}")`;
    case 'select':
      if (field.strict && field.options && !field.options.includes(value)) {
        return `${field.label} must be one of: ${field.options.join(', ')} (got "${value}")`;
      }
      return null;
    default:
      return null;
  }
}

/** Case-insensitively maps a select value onto its canonical option, e.g.
 * "Flat" -> "flat". Other values are returned unchanged. */
export function normalizeCell(field: ImportExportField, raw: string): string {
  if (field.type === 'date') {
    // "31/10/26", "31-10-2026" (day first, as written in India) -> "2026-10-31"
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(raw.trim());
    if (!m) return raw;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (field.type !== 'select' || !field.options) return raw;
  // "1bhk" -> "1 BHK", "Site Visit Done" -> "site-visit-done"
  const loose = (v: string) => v.toLowerCase().replace(/[^a-z0-9.+]/g, '');
  const match =
    field.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase()) ||
    field.options.find((o) => loose(o) === loose(raw));
  return match ?? raw;
}

/** "9822675337/  9175444667" -> ["9822675337", "9175444667"]; one number or none -> []. */
export function splitMobileCell(raw: string): string[] {
  const parts = raw
    .split(/[\/,;|&\n]+|\s{2,}|\bor\b|\band\b/i)
    .map((p) => normalizeMobile(p))
    .filter((p): p is string => !!p);
  if (parts.length >= 2) return [...new Set(parts)];
  const digits = raw.replace(/\D/g, '');
  if (parts.length === 0 && digits.length === 20) return [digits.slice(0, 10), digits.slice(10)];
  return [];
}
