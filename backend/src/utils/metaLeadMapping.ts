// Turns a Meta Lead Ads submission (the `field_data` array Graph API returns
// for a leadgen id) into CRM lead fields. Standard form questions map onto
// lead columns; everything else (custom questions, date of birth, ...) is
// kept as "Question: answer" lines in the lead's description so nothing the
// person filled in is lost.

export interface MetaFieldDatum {
  name: string;
  values?: string[];
}

export interface MappedMetaLead {
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  street: string | null;
  website: string | null;
  /** Answers with no lead column of their own, in form order. */
  extras: [question: string, answer: string][];
}

type Target = Exclude<keyof MappedMetaLead, 'extras'> | 'fullName';

// Keys are normalized (see normalizeKey); Meta's standard question names
// plus the common spellings people use when they build custom forms.
const FIELD_MAP: Record<string, Target> = {
  full_name: 'fullName',
  name: 'fullName',
  first_name: 'firstName',
  last_name: 'lastName',
  surname: 'lastName',
  email: 'email',
  email_address: 'email',
  work_email: 'email',
  phone_number: 'mobile',
  phone: 'mobile',
  mobile: 'mobile',
  mobile_number: 'mobile',
  whatsapp_number: 'mobile',
  work_phone_number: 'phone',
  company_name: 'company',
  company: 'company',
  business_name: 'company',
  job_title: 'jobTitle',
  designation: 'jobTitle',
  city: 'city',
  state: 'state',
  province: 'state',
  country: 'country',
  zip_code: 'zipCode',
  zip: 'zipCode',
  post_code: 'zipCode',
  postal_code: 'zipCode',
  pincode: 'zipCode',
  pin_code: 'zipCode',
  street_address: 'street',
  address: 'street',
  website: 'website',
};

// Column sizes from models/Lead.ts.
const MAX: Partial<Record<Target, number>> = {
  firstName: 100,
  lastName: 100,
  email: 255,
  mobile: 20,
  phone: 20,
  company: 255,
  jobTitle: 100,
  city: 100,
  state: 100,
  country: 100,
  zipCode: 20,
  website: 255,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** "what_is_your_budget?" -> "What is your budget?" */
export const questionLabel = (name: string) => {
  const text = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : name;
};

const clip = (value: string, target: Target) => {
  const max = MAX[target];
  return max ? value.slice(0, max) : value;
};

/** Keeps a leading + and the digits: "+91 98765-43210" -> "+919876543210". */
export const cleanPhone = (raw: string) => {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return (trimmed.startsWith('+') ? `+${digits}` : digits).slice(0, 20);
};

const splitName = (full: string) => {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
};

export const mapMetaLead = (fieldData: MetaFieldDatum[] | undefined | null): MappedMetaLead => {
  const found: Partial<Record<Target, string>> = {};
  const extras: [string, string][] = [];

  for (const field of fieldData || []) {
    if (!field || typeof field.name !== 'string') continue;
    const value = (field.values || [])
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean)
      .join(', ');
    if (!value) continue;

    const target = FIELD_MAP[normalizeKey(field.name)];
    if (!target || found[target]) {
      extras.push([questionLabel(field.name), value]);
      continue;
    }

    if (target === 'email' && !EMAIL_RE.test(value)) {
      extras.push([questionLabel(field.name), value]);
      continue;
    }
    if (target === 'mobile' || target === 'phone') {
      const phone = cleanPhone(value);
      if (!phone) {
        extras.push([questionLabel(field.name), value]);
        continue;
      }
      found[target] = phone;
      continue;
    }
    found[target] = target === 'email' ? value.toLowerCase() : value;
  }

  let first = found.firstName || '';
  let last = found.lastName || '';
  if ((!first || !last) && found.fullName) {
    const split = splitName(found.fullName);
    if (!first && !last) {
      first = split.first;
      last = split.last;
    } else if (!first) {
      first = split.first;
    } else if (!last) {
      last = split.last;
    }
  }
  if (!first) first = found.email ? found.email.split('@')[0] : found.mobile || 'Facebook lead';
  // Lead.lastName is required; same placeholder the website form uses.
  if (!last) last = '-';

  const pick = (target: Target) => (found[target] ? clip(found[target]!, target) : null);

  return {
    firstName: clip(first, 'firstName'),
    lastName: clip(last, 'lastName'),
    email: pick('email'),
    mobile: pick('mobile'),
    phone: pick('phone'),
    company: pick('company'),
    jobTitle: pick('jobTitle'),
    city: pick('city'),
    state: pick('state'),
    country: pick('country'),
    zipCode: pick('zipCode'),
    street: found.street || null,
    website: pick('website'),
    extras,
  };
};
