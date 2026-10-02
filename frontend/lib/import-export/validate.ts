import type { ImportExportField } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
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
  if (field.type !== 'select' || !field.options) return raw;
  const match = field.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
  return match ?? raw;
}
