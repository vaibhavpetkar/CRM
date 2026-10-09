import crypto from 'crypto';

// Turns a lead from a property portal (99acres, MagicBricks, Housing.com, a
// Meta form...) into CRM lead fields. Every portal names things its own way
// and nests them differently, so keys are flattened and normalized
// ("Contact_Number", "contact-number", "contactNumber" are all the same) and
// matched against the spellings below. Anything left over is kept as
// "Key: value" lines so nothing the buyer sent is lost.

export interface PropertyLead {
  externalId: string | null;
  firstName: string;
  lastName: string;
  mobile: string | null;
  email: string | null;
  projectName: string | null;
  preferredLocation: string | null;
  city: string | null;
  configuration: string | null;
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  message: string | null;
  receivedAt: Date | null;
  subSource: string | null; // campaign / form / product / category it came from
  extras: [key: string, value: string][];
}

const norm = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const KEYS: Record<string, string[]> = {
  externalId: ['unique_query_id', 'lead_id', 'leadid', 'enquiry_id', 'enquiryid', 'query_id', 'queryid', 'qry_id', 'response_id', 'responseid', 'inquiry_id', 'id', 'uid', 'leadgen_id'],
  fullName: ['name', 'full_name', 'fullname', 'contact_name', 'lead_name', 'buyer_name', 'client_name', 'customer_name', 'sender_name', 'user_name', 'contact_person'],
  firstName: ['first_name', 'firstname', 'fname'],
  lastName: ['last_name', 'lastname', 'lname', 'surname'],
  mobile: ['mobile', 'mobile_no', 'mobile_number', 'mobileno', 'phone', 'phone_no', 'phone_number', 'phoneno', 'contact', 'contact_no', 'contact_number', 'contactno', 'sender_mobile', 'sender_mobile_alt', 'buyer_mobile', 'customer_mobile', 'whatsapp_number', 'cell', 'telephone'],
  email: ['email', 'email_id', 'emailid', 'email_address', 'sender_email', 'buyer_email', 'customer_email', 'mail'],
  projectName: ['project', 'project_name', 'projectname', 'property_name', 'propertyname', 'prop_name', 'listing', 'listing_name', 'society', 'society_name', 'cmpct_labl', 'project_title', 'property_title'],
  preferredLocation: ['locality', 'locality_name', 'location', 'area', 'sub_locality', 'preferred_location', 'project_locality', 'micro_market'],
  city: ['city', 'city_name', 'project_city', 'sender_city'],
  configuration: ['bhk', 'configuration', 'config', 'bedrooms', 'bedroom', 'unit_type', 'apartment_type', 'flat_type'],
  propertyType: ['property_type', 'propertytype', 'prop_type'],
  budget: ['budget', 'price', 'price_range', 'budget_range', 'expected_price'],
  budgetMin: ['min_budget', 'budget_min', 'min_price', 'price_min'],
  budgetMax: ['max_budget', 'budget_max', 'max_price', 'price_max'],
  message: ['message', 'msg', 'query', 'qry_info', 'query_message', 'subject', 'comments', 'comment', 'remarks', 'requirement', 'enquiry', 'inquiry', 'details', 'description', 'note', 'notes'],
  receivedAt: ['created_at', 'created_time', 'date', 'lead_date', 'received_on', 'rcvd_on', 'enquiry_date', 'query_date', 'timestamp', 'submitted_at', 'query_time'],
  subSource: ['sub_source', 'subsource', 'lead_sub_source', 'campaign_name', 'campaign', 'utm_campaign', 'ad_name', 'adset_name', 'form_name', 'query_product_name', 'product_name', 'category', 'service'],
};

const EXACT = new Map<string, string>();
for (const [target, keys] of Object.entries(KEYS)) for (const k of keys) if (!EXACT.has(k)) EXACT.set(k, target);

// Custom form questions ("what_is_your_budget", "preferred_location_in_pune", "which_bhk_are_you_looking_for").
const FUZZY: [RegExp, string][] = [
  [/budget|price_range/, 'budget'],
  [/bhk|configuration|bedroom/, 'configuration'],
  [/property_type|type_of_property/, 'propertyType'],
  [/locality|location|area_pref|preferred_area/, 'preferredLocation'],
  [/project/, 'projectName'],
  [/mobile|phone_number|whatsapp/, 'mobile'],
];

const LOOKUP = {
  get: (key: string) => EXACT.get(key) ?? FUZZY.find(([re]) => re.test(key))?.[1],
};

/** Flattens nested objects to [normalizedKey, value] pairs, innermost key wins ("contact.mobile" -> "mobile"). */
const flatten = (obj: unknown, out: [string, string][] = [], prefix = ''): [string, string][] => {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v) => flatten(v, out, prefix));
    return out;
  }
  if (typeof obj === 'object') {
    // Meta-style {name, values:[...]} / {question, answer} pairs.
    const o = obj as Record<string, unknown>;
    // Google Ads: standard questions have a known column_id (PHONE_NUMBER), custom ones a readable column_name.
    const googleKey = typeof o.column_id === 'string' && LOOKUP.get(norm(o.column_id)) ? o.column_id : o.column_name ?? o.column_id;
    const pairKey = o.name ?? o.question ?? o.field ?? o.key ?? o.label ?? googleKey;
    const pairValue = o.values ?? o.value ?? o.answer ?? o.string_value;
    if (typeof pairKey === 'string' && pairValue !== undefined && (typeof pairValue !== 'object' || Array.isArray(pairValue)) && Object.keys(o).length <= 4) {
      out.push([norm(pairKey), Array.isArray(pairValue) ? pairValue.join(', ') : String(pairValue)]);
      return out;
    }
    for (const [k, v] of Object.entries(o)) flatten(v, out, norm(k));
    return out;
  }
  const value = String(obj).trim();
  if (prefix && value) out.push([prefix, value]);
  return out;
};

/** "₹45 L", "45 lakh", "1.2 Cr", "4500000", "50L-75L" -> rupees. Returns [min, max]. */
export const parseBudget = (text: string | null | undefined): [number | null, number | null] => {
  if (!text) return [null, null];
  const s = String(text)
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/rs\.?|inr|₹/g, ' ')
    // "2 BHK", "1200 sq ft", "9876543210" aren't money.
    .replace(/\d+(?:\.\d+)?\s*(?:bhk|rk|bed\w*|br|sq\.?\s*(?:ft|feet|m|yd)\w*|sqft|acres?|guntha|floor|th|st|nd|rd)\b/g, ' ')
    .replace(/\b\d{10,}\b/g, ' ');
  const re = /(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lac|l|k|thousand)?\b/g;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  let lastUnit = '';
  const matches: [number, string][] = [];
  while ((m = re.exec(s))) matches.push([Number(m[1]), m[2] || '']);
  // "50-75 lakh": the unit on the last number applies to earlier bare ones.
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i][1]) lastUnit = matches[i][1];
    else if (lastUnit && matches[i][0] < 1000) matches[i][1] = lastUnit;
  }
  for (const [n, unit] of matches) {
    const mult = /^cr/.test(unit) ? 1e7 : /^(l|lac|lakh)/.test(unit) ? 1e5 : /^(k|thousand)/.test(unit) ? 1e3 : 1;
    const v = n * mult;
    if (v >= 10000) values.push(Math.round(v));
  }
  if (!values.length) return [null, null];
  if (values.length > 1) return [Math.min(...values), Math.max(...values)];
  // "under 75 lakh" is a ceiling; "above 1 Cr" or a bare amount is a starting point.
  return /under|below|upto|up\s*to|within|max|less\s*than|not\s*more/.test(s) ? [null, values[0]] : [values[0], null];
};

/** "2BHK", "2 bhk flat", "3 Bedroom" -> "2 BHK"; "1 RK" stays. */
export const parseConfiguration = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const s = String(text);
  const rk = s.match(/(\d)\s*rk\b/i);
  if (rk) return `${rk[1]} RK`;
  const bhk = s.match(/(\d+(?:\.5)?)\s*(?:bhk|bed(?:room)?s?|br)\b/i);
  if (bhk) return Number(bhk[1]) >= 5 ? '5+ BHK' : `${bhk[1]} BHK`;
  if (/^\d$/.test(s.trim())) return `${s.trim()} BHK`;
  return null;
};

const PROPERTY_TYPES: [RegExp, string][] = [
  [/villa/i, 'Villa'],
  [/row\s*house/i, 'Row House'],
  [/bungalow/i, 'Bungalow'],
  [/plot|land/i, 'Plot'],
  [/shop|showroom/i, 'Shop'],
  [/office/i, 'Office'],
  [/commercial/i, 'Commercial'],
  [/farm/i, 'Farm House'],
  [/apartment|flat|residential|bhk|penthouse|builder\s*floor/i, 'Apartment'],
];
export const parsePropertyType = (text: string | null | undefined): string | null => {
  if (!text) return null;
  for (const [re, type] of PROPERTY_TYPES) if (re.test(text)) return type;
  return null;
};

const toDate = (v: string | undefined) => {
  if (!v) return null;
  const s = v.trim();
  const d = /^\d{10}$/.test(s) ? new Date(Number(s) * 1000) : /^\d{13}$/.test(s) ? new Date(Number(s)) : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? new Date(`${s.replace(' ', 'T')}+05:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const cut = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null);

/** Maps one raw portal lead. `fallbackId` builds a stable id when the portal sends none. */
export const mapPropertyLead = (raw: unknown): PropertyLead => {
  const pairs = flatten(raw);
  const found: Record<string, string> = {};
  const extras: [string, string][] = [];
  for (const [key, value] of pairs) {
    const target = LOOKUP.get(key);
    if (target && !found[target]) found[target] = value;
    else if (!target || found[target] !== value) extras.push([key.replace(/_/g, ' '), value]);
  }

  let firstName = found.firstName || '';
  let lastName = found.lastName || '';
  if (!firstName && found.fullName) {
    const parts = found.fullName.trim().split(/\s+/);
    firstName = parts.shift() || '';
    lastName = lastName || parts.join(' ');
  }

  // Requirement can also be buried in the message ("Looking for 2 BHK in Baner under 60 lakh").
  const haystack = [found.configuration, found.propertyType, found.message, found.projectName, found.subSource].filter(Boolean).join(' ');
  const [bMin, bMax] = found.budgetMin || found.budgetMax
    ? [parseBudget(found.budgetMin)[0], parseBudget(found.budgetMax)[0]]
    : parseBudget(found.budget || (found.message && /lakh|lac|cr|₹/i.test(found.message) ? found.message : ''));

  const mobileDigits = (found.mobile || '').replace(/[^\d+]/g, '');
  const mobile = mobileDigits ? mobileDigits.replace(/^(\+?91)(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '') : null;
  const email = found.email && /\S+@\S+\.\S+/.test(found.email) ? found.email.trim().toLowerCase() : null;
  const receivedAt = toDate(found.receivedAt);

  const externalId =
    found.externalId ||
    (mobile || email
      ? crypto
          .createHash('sha1')
          .update([mobile, email, found.projectName, receivedAt?.toISOString().slice(0, 16) || ''].join('|'))
          .digest('hex')
          .slice(0, 24)
      : null);

  return {
    externalId: cut(externalId, 100),
    firstName: cut(firstName || (mobile ? 'Portal' : 'Unknown'), 100)!,
    lastName: cut(lastName || 'Lead', 100)!,
    mobile: cut(mobile, 20),
    email: cut(email, 255),
    projectName: cut(found.projectName || null, 255),
    preferredLocation: cut(found.preferredLocation || null, 255),
    city: cut(found.city || null, 100),
    configuration: parseConfiguration(found.configuration) || parseConfiguration(haystack),
    propertyType: parsePropertyType(found.propertyType) || parsePropertyType(haystack),
    budgetMin: bMin,
    budgetMax: bMax,
    message: found.message || null,
    subSource: cut(found.subSource || null, 255),
    receivedAt,
    extras: extras.slice(0, 40),
  };
};
