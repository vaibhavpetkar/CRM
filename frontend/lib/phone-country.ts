import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Mobile numbers from India and every other country.
 *
 * Indian numbers stay as 10 digits ("9876543210"), as before. A number from
 * another country is kept in international form ("+971501234567"). The
 * country comes from the international numbering rules for every country
 * (libphonenumber), with or without the +: "+971 50 123 4567",
 * "00971501234567" and "971501234567" (old data, sheets) are the same UAE
 * number. Ten digits with no code is India.
 *
 * Copy of backend/src/utils/phoneCountry.ts (keep the two in step), plus
 * the country flag for showing next to a number.
 */

export interface PhoneCountry {
  iso: string; // ISO 3166 alpha-2, '' when not known
  name: string;
  code: string; // calling code, no +
}

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (iso: string) => names.of(iso) || iso;
  } catch {
    return (iso: string) => iso;
  }
})();

const country = (iso: string): PhoneCountry => ({
  iso,
  name: iso ? regionName(iso) : 'International',
  code: iso ? String(getCountryCallingCode(iso as CountryCode)) : '',
});
const INDIA = country('IN');

export interface ParsedMobile {
  /** What to store: 10 digits for India, "+<code><number>" for other countries. */
  value: string;
  country: PhoneCountry;
  /** The national number, without the code. */
  national: string;
}

const india = (ten: string): ParsedMobile | null => (/^\d{10}$/.test(ten) ? { value: ten, country: INDIA, national: ten } : null);

/** "+<digits>" read with every country's rules; null when it is no country's number. */
const fromInternational = (digits: string, loose: boolean): ParsedMobile | null => {
  if (digits.length < 7 || digits.length > 15) return null;
  const p = parsePhoneNumberFromString(`+${digits}`);
  if (!p) return null;
  const ok = p.isValid() || (loose && p.isPossible());
  if (!ok) return null;
  // A number in a range not handed out yet still belongs to its code's main country.
  const iso = p.country || p.getPossibleCountries()[0] || '';
  if (iso === 'IN') return india(String(p.nationalNumber));
  return { value: `+${digits}`, country: iso ? country(iso) : { iso: '', name: 'International', code: String(p.countryCallingCode) }, national: String(p.nationalNumber) };
};

/**
 * Reads a mobile number the way people type it. Returns null when it can't
 * be a phone number (the caller shows "enter a valid mobile number").
 */
export const parseMobile = (input: unknown): ParsedMobile | null => {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Letters mean it isn't a number ("abc", "N/A").
  if (/[a-z]/i.test(raw)) return null;
  const compact = raw.replace(/[\s\-().\/]/g, '');
  let digits = raw.replace(/\D/g, '');
  const plus = compact.startsWith('+');
  const doubleZero = !plus && /^00[1-9]/.test(compact);
  if (doubleZero) digits = digits.slice(2);

  if (plus || doubleZero) {
    if (digits.startsWith('91') && digits.length === 12) return india(digits.slice(2));
    // Written with its code: any number that country could have.
    return fromInternational(digits, true);
  }

  // No + : ten digits is India (as before), with or without the 0 / 91 in front.
  if (digits.length === 10) return india(digits);
  if (digits.length === 11 && digits.startsWith('0')) return india(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return india(digits.slice(2));
  // Anything else: a number from abroad typed without the + (old data, a
  // sheet). Only a number that is valid for the country its code names.
  const abroad = fromInternational(digits, false);
  return abroad && abroad.country.iso !== 'IN' ? abroad : null;
};

/** The country a stored mobile belongs to (India for 10 digits). */
export const mobileCountry = (stored: unknown): PhoneCountry | null => parseMobile(stored)?.country ?? null;

/**
 * Lead validation sanitizer: a valid number in its stored form, anything
 * else left as typed so the validator can report it.
 */
export const normalizeMobile = (value: unknown) => {
  if (value === undefined || value === null) return value;
  const parsed = parseMobile(value);
  return parsed ? parsed.value : String(value).trim();
};

/** The number is one parseMobile accepts and stores as is. */
export const isStoredMobile = (value: unknown) => {
  const parsed = parseMobile(value);
  return !!parsed && parsed.value === String(value);
};

/** The last 10 digits, used to match the same person typed two ways. */
export const lastTenDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(-10);

/** "AE" -> the UAE flag emoji. */
export const flagEmoji = (iso: string) =>
  iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐';

/** "+971509998877" -> "+971 50 999 8877", "9876543210" -> "98765 43210", for display. */
export const formatMobile = (stored: unknown) => {
  const p = parseMobile(stored);
  if (!p) return String(stored ?? '');
  if (p.country.iso === 'IN') return `${p.national.slice(0, 5)} ${p.national.slice(5)}`;
  return parsePhoneNumberFromString(p.value)?.formatInternational() || p.value; // "+971 50 999 8877"
};
