/**
 * Mobile numbers from India and abroad.
 *
 * Indian numbers stay as 10 digits ("9876543210"), as before. A number from
 * another country is kept in international form ("+971501234567"). The
 * country is found from the code in front: "+971 50 123 4567",
 * "00971501234567" and "971501234567" (old data typed without the +) are all
 * the same UAE number. Ten digits with no code is India.
 *
 * Keep the COUNTRIES list in step with frontend/lib/phone-country.ts.
 */

export interface PhoneCountry {
  iso: string; // ISO 3166 alpha-2
  name: string;
  code: string; // calling code, no +
  lengths: number[]; // national number lengths (without the code)
}

export const COUNTRIES: PhoneCountry[] = [
  { iso: 'IN', name: 'India', code: '91', lengths: [10] },
  { iso: 'AE', name: 'United Arab Emirates', code: '971', lengths: [9] },
  { iso: 'SA', name: 'Saudi Arabia', code: '966', lengths: [9] },
  { iso: 'QA', name: 'Qatar', code: '974', lengths: [8] },
  { iso: 'KW', name: 'Kuwait', code: '965', lengths: [8] },
  { iso: 'OM', name: 'Oman', code: '968', lengths: [8] },
  { iso: 'BH', name: 'Bahrain', code: '973', lengths: [8] },
  { iso: 'US', name: 'United States / Canada', code: '1', lengths: [10] },
  { iso: 'GB', name: 'United Kingdom', code: '44', lengths: [10] },
  { iso: 'IE', name: 'Ireland', code: '353', lengths: [9] },
  { iso: 'AU', name: 'Australia', code: '61', lengths: [9] },
  { iso: 'NZ', name: 'New Zealand', code: '64', lengths: [8, 9, 10] },
  { iso: 'SG', name: 'Singapore', code: '65', lengths: [8] },
  { iso: 'MY', name: 'Malaysia', code: '60', lengths: [9, 10] },
  { iso: 'HK', name: 'Hong Kong', code: '852', lengths: [8] },
  { iso: 'TH', name: 'Thailand', code: '66', lengths: [9] },
  { iso: 'ID', name: 'Indonesia', code: '62', lengths: [9, 10, 11, 12] },
  { iso: 'PH', name: 'Philippines', code: '63', lengths: [10] },
  { iso: 'JP', name: 'Japan', code: '81', lengths: [10] },
  { iso: 'CN', name: 'China', code: '86', lengths: [11] },
  { iso: 'DE', name: 'Germany', code: '49', lengths: [10, 11] },
  { iso: 'FR', name: 'France', code: '33', lengths: [9] },
  { iso: 'NL', name: 'Netherlands', code: '31', lengths: [9] },
  { iso: 'BE', name: 'Belgium', code: '32', lengths: [9] },
  { iso: 'CH', name: 'Switzerland', code: '41', lengths: [9] },
  { iso: 'IT', name: 'Italy', code: '39', lengths: [9, 10] },
  { iso: 'ES', name: 'Spain', code: '34', lengths: [9] },
  { iso: 'SE', name: 'Sweden', code: '46', lengths: [9] },
  { iso: 'NO', name: 'Norway', code: '47', lengths: [8] },
  { iso: 'DK', name: 'Denmark', code: '45', lengths: [8] },
  { iso: 'RU', name: 'Russia', code: '7', lengths: [10] },
  { iso: 'TR', name: 'Turkey', code: '90', lengths: [10] },
  { iso: 'IL', name: 'Israel', code: '972', lengths: [9] },
  { iso: 'ZA', name: 'South Africa', code: '27', lengths: [9] },
  { iso: 'KE', name: 'Kenya', code: '254', lengths: [9] },
  { iso: 'NG', name: 'Nigeria', code: '234', lengths: [10] },
  { iso: 'EG', name: 'Egypt', code: '20', lengths: [10] },
  { iso: 'MU', name: 'Mauritius', code: '230', lengths: [8] },
  { iso: 'NP', name: 'Nepal', code: '977', lengths: [10] },
  { iso: 'LK', name: 'Sri Lanka', code: '94', lengths: [9] },
  { iso: 'BD', name: 'Bangladesh', code: '880', lengths: [10] },
  { iso: 'PK', name: 'Pakistan', code: '92', lengths: [10] },
  { iso: 'MV', name: 'Maldives', code: '960', lengths: [7] },
];

const INDIA = COUNTRIES[0];
const BY_CODE_LENGTH = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);

/** The country of a number written with its code ("971501234567"), or null. */
const countryFromInternational = (digits: string): PhoneCountry | null => {
  for (const c of BY_CODE_LENGTH) {
    if (digits.startsWith(c.code) && c.lengths.includes(digits.length - c.code.length)) return c;
  }
  return null;
};

export interface ParsedMobile {
  /** What to store: 10 digits for India, "+<code><number>" for other countries. */
  value: string;
  country: PhoneCountry;
  /** The national number, without the code. */
  national: string;
}

/**
 * Reads a mobile number the way people type it. Returns null when it can't
 * be a phone number (the caller shows "enter a valid mobile number").
 */
export const parseMobile = (input: unknown): ParsedMobile | null => {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Letters mean it isn't a number ("abc", "N/A"); extension text is not supported.
  if (/[a-z]/i.test(raw)) return null;
  const international = raw.startsWith('+') || /^00[1-9]/.test(raw.replace(/[\s\-().]/g, ''));
  let digits = raw.replace(/\D/g, '');
  if (international && digits.startsWith('00')) digits = digits.slice(2);

  const india = (ten: string): ParsedMobile | null => (/^\d{10}$/.test(ten) ? { value: ten, country: INDIA, national: ten } : null);

  if (international) {
    if (digits.startsWith('91') && digits.length === 12) return india(digits.slice(2));
    const c = countryFromInternational(digits);
    if (c) return c.iso === 'IN' ? india(digits.slice(2)) : { value: `+${digits}`, country: c, national: digits.slice(c.code.length) };
    // A code we don't list: keep it if it is a plausible international number.
    return digits.length >= 8 && digits.length <= 15 ? { value: `+${digits}`, country: unknownCountry, national: digits } : null;
  }

  // No + : ten digits is India (as before), with or without the 0 / 91 in front.
  if (digits.length === 10) return india(digits);
  if (digits.length === 11 && digits.startsWith('0')) return india(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return india(digits.slice(2));
  // Longer: a number from abroad typed without the + (old data, a sheet).
  if (digits.length > 10 && digits.length <= 15) {
    const c = countryFromInternational(digits);
    if (c && c.iso !== 'IN') return { value: `+${digits}`, country: c, national: digits.slice(c.code.length) };
  }
  return null;
};

const unknownCountry: PhoneCountry = { iso: '', name: 'International', code: '', lengths: [] };

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
