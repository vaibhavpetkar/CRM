// Fixed option lists for Lead form dropdowns (CRM QA doc §2.2, 2.3, 2.4, 2.5).
// Kept as plain string arrays — stored verbatim on the Lead record — so no
// backend enum/migration is needed if the wording changes later.

// Task 2.2 — Annual Turnover
export const ANNUAL_TURNOVER_OPTIONS = [
  'Under ₹10 Lakhs',
  '₹10–50 Lakhs',
  '₹50 Lakhs–₹1 Crore',
  '₹1–5 Crores',
  '₹5–10 Crores',
  'Above ₹10 Crores',
];

// Task 2.3 — Industry
export const INDUSTRY_OPTIONS = [
  'Manufacturing',
  'Retail',
  'IT',
  'Healthcare',
  'Logistics',
  'Education',
  'Agriculture',
  'Hospitality',
  'Others',
];

// Task 2.5 — Designation
export const DESIGNATION_OPTIONS = [
  'Owner',
  'Director',
  'CEO',
  'Founder',
  'Purchase Manager',
  'HR',
  'Accounts',
  'Sales Manager',
  'Marketing Head',
  'Others',
];

// Task 2.4 — Territory (searchable dropdown of districts).
// NOTE: this is a representative list of major districts across India, not an
// exhaustive official list (India has 750+ districts). Swap this array for a
// complete government list if one is available — the <SearchableSelect> below
// doesn't care about the size of the list.
export const TERRITORY_OPTIONS = [
  'Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Pimpri-Chinchwad',
  'Bengaluru Urban', 'Mysuru', 'Mangaluru', 'Belagavi',
  'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
  'Hyderabad', 'Warangal', 'Nizamabad',
  'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot',
  'Delhi', 'Gurugram', 'Faridabad', 'Noida', 'Ghaziabad',
  'Jaipur', 'Jodhpur', 'Udaipur', 'Kota',
  'Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Meerut', 'Prayagraj',
  'Kolkata', 'Howrah', 'Durgapur', 'Siliguri',
  'Bhopal', 'Indore', 'Jabalpur', 'Gwalior',
  'Patna', 'Gaya', 'Muzaffarpur',
  'Chandigarh', 'Ludhiana', 'Amritsar', 'Jalandhar',
  'Kochi', 'Thiruvananthapuram', 'Kozhikode',
  'Bhubaneswar', 'Cuttack', 'Rourkela',
  'Guwahati', 'Dibrugarh',
  'Ranchi', 'Jamshedpur', 'Dhanbad',
  'Raipur', 'Bilaspur',
  'Dehradun', 'Haridwar',
  'Panaji',
];

// ─── Real estate ──────────────────────────────────────────────────────────────

// Where a lead came from. `value` is what's stored on the lead (lower-case,
// dashed, the same way the lead form always saved sources), `label` is shown.
export const LEAD_SOURCE_OPTIONS: { value: string; label: string; keywords?: string }[] = [
  { value: '99acres', label: '99acres' },
  { value: 'magicbricks', label: 'MagicBricks', keywords: 'mb' },
  { value: 'housing.com', label: 'Housing.com', keywords: 'housing' },
  { value: 'nobroker', label: 'NoBroker' },
  { value: 'commonfloor', label: 'CommonFloor' },
  { value: 'square-yards', label: 'Square Yards' },
  { value: 'proptiger', label: 'PropTiger' },
  { value: 'makaan', label: 'Makaan' },
  { value: 'facebook', label: 'Facebook', keywords: 'meta fb' },
  { value: 'instagram', label: 'Instagram', keywords: 'insta ig meta' },
  { value: 'google-ads', label: 'Google Ads', keywords: 'google ppc adwords' },
  { value: 'indiamart', label: 'IndiaMART' },
  { value: 'justdial', label: 'JustDial' },
  { value: 'website', label: 'Website' },
  { value: 'walk-in', label: 'Walk-in / Site', keywords: 'walking walkin direct' },
  { value: 'channel-partner', label: 'Channel Partner / Broker', keywords: 'cp agent' },
  { value: 'referral', label: 'Referral', keywords: 'reference ref' },
  { value: 'hoarding', label: 'Hoarding / Banner' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'incoming-call', label: 'Incoming Call', keywords: 'inbound phone' },
  { value: 'cold-call', label: 'Cold Call' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'event', label: 'Event / Exhibition' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

const SOURCE_LABELS = Object.fromEntries(LEAD_SOURCE_OPTIONS.map((o) => [o.value, o.label]));

/** "99acres" -> "99acres", "channel-partner" -> "Channel Partner / Broker", unknown -> Title Case. */
export const leadSourceLabel = (value?: string | null) => {
  const key = String(value || '').toLowerCase();
  if (!key || key === 'unknown') return 'Unknown';
  return SOURCE_LABELS[key] || key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const CONFIGURATION_OPTIONS = ['1 RK', '1 BHK', '1.5 BHK', '2 BHK', '2.5 BHK', '3 BHK', '3.5 BHK', '4 BHK', '5+ BHK', 'Penthouse'];

export const PROPERTY_TYPE_OPTIONS = ['Apartment', 'Villa', 'Row House', 'Plot', 'Bungalow', 'Shop', 'Office', 'Commercial', 'Farm House'];

// Budget filter presets, in rupees.
export const BUDGET_OPTIONS: { label: string; from?: number; to?: number }[] = [
  { label: 'Under ₹30 L', to: 3000000 },
  { label: '₹30 L – ₹50 L', from: 3000000, to: 5000000 },
  { label: '₹50 L – ₹75 L', from: 5000000, to: 7500000 },
  { label: '₹75 L – ₹1 Cr', from: 7500000, to: 10000000 },
  { label: '₹1 Cr – ₹2 Cr', from: 10000000, to: 20000000 },
  { label: 'Above ₹2 Cr', from: 20000000 },
];

/** 4500000 -> "₹45 L", 12500000 -> "₹1.25 Cr" */
export const formatBudget = (n?: number | string | null) => {
  const v = Number(n);
  if (!n || !Number.isFinite(v) || v <= 0) return '';
  if (v >= 10000000) return `₹${+(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${+(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

export const budgetRange = (min?: number | string | null, max?: number | string | null) => {
  const a = formatBudget(min);
  const b = formatBudget(max);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (a) return `${a}+`;
  if (b) return `Up to ${b}`;
  return '';
};

// ─── Lead statuses ────────────────────────────────────────────────────────────

// Lead statuses a user can pick, in the order the pickers list them. `value`
// is what is stored on the lead (keep in sync with ACTIVE_LEAD_STATUSES in
// backend/src/validations/leadValidation.ts), `tone` picks its colour.
// 'new' is the starting status every lead gets.
export const LEAD_STATUS_TONES = {
  blue: '#3b82f6',
  amber: '#f59e0b',
  indigo: '#6366f1',
  green: '#22c55e',
  slate: '#94a3b8',
  teal: '#14b8a6',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  rose: '#f43f5e',
  lime: '#84cc16',
  cyan: '#06b6d4',
  purple: '#a855f7',
  sky: '#0ea5e9',
} as const;

export type LeadStatusTone = keyof typeof LEAD_STATUS_TONES;

export const LEAD_STATUS_OPTIONS: { value: string; label: string; tone: LeadStatusTone }[] = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'cnr', label: 'CNR', tone: 'orange' },
  { value: 'call-busy', label: 'Call Busy', tone: 'orange' },
  { value: 'switch-off', label: 'Switch Off', tone: 'slate' },
  { value: 'call-later', label: 'Call Later', tone: 'yellow' },
  { value: 'not-interested', label: 'Not Interested', tone: 'rose' },
  { value: 'invalid-number', label: 'Invalid Number', tone: 'slate' },
  { value: 'wrong-number', label: 'Wrong Number', tone: 'slate' },
  { value: 'whatsapp-done', label: 'WhatsApp Done', tone: 'lime' },
  { value: 'details-shared', label: 'Details Shared', tone: 'cyan' },
  { value: 'site-visit-done', label: 'Site Visit Done', tone: 'teal' },
  { value: 'revisit-done', label: 'Revisit Done', tone: 'purple' },
  { value: 'ready-possession', label: 'Looking for Ready Possession', tone: 'sky' },
  { value: 'budget-issue', label: 'Budget Issue', tone: 'rose' },
  { value: 'loan-problem', label: 'Loan Problem', tone: 'rose' },
  { value: 'final-rate-given', label: 'Final Rate Given', tone: 'green' },
  { value: 'booking-done', label: 'Booking Done', tone: 'green' },
  { value: 'plan-dropped', label: 'Plan Dropped', tone: 'red' },
  { value: 'plan-on-hold', label: 'Plan is on Hold', tone: 'yellow' },
  { value: 'postponed', label: 'Postponed', tone: 'yellow' },
  { value: 'nearing-possession', label: 'Looking for Nearing Possession', tone: 'sky' },
];

export const LEAD_STATUS_VALUES = LEAD_STATUS_OPTIONS.map((o) => o.value);

// Lead statuses that mean a site visit just happened: saving a lead into one
// first asks for the visit (it is logged on the Site Visits page), and
// cancelling that leaves the lead unsaved. Maps to the visit's own status.
export const VISIT_LEAD_STATUSES: Record<string, 'completed' | 'revisit-done'> = {
  'site-visit-done': 'completed',
  'revisit-done': 'revisit-done',
};

// Earlier statuses, no longer offered in any picker. Leads that still carry
// one keep showing its name and colour until someone changes it.
export const LEGACY_LEAD_STATUS_OPTIONS: { value: string; label: string; tone: LeadStatusTone }[] = [
  { value: 'contacted', label: 'Contacted', tone: 'amber' },
  { value: 'working', label: 'Working / In Progress', tone: 'indigo' },
  { value: 'qualified', label: 'Qualified', tone: 'green' },
  { value: 'unqualified', label: 'Unqualified / Disqualified', tone: 'slate' },
  { value: 'converted', label: 'Converted', tone: 'teal' },
  { value: 'lost', label: 'Lost', tone: 'red' },
];

const STATUS_BY_VALUE = Object.fromEntries([...LEAD_STATUS_OPTIONS, ...LEGACY_LEAD_STATUS_OPTIONS].map((o) => [o.value, o]));

/** "cnr" -> "CNR"; unknown -> Title Case. */
export const leadStatusLabel = (status?: string | null) => {
  const key = String(status || '').toLowerCase();
  return STATUS_BY_VALUE[key]?.label || key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
};

// Colour choices layered over the built-in tones: the super admin's default
// for all companies, then the company default, then the user's own (see
// components/leads/lead-status-colors.tsx, which loads and saves them).
let colorOverrides: Record<string, string> = {};
let colorVersion = 0;
const colorListeners = new Set<() => void>();

export const setLeadStatusColorOverrides = (colors: Record<string, string>) => {
  colorOverrides = { ...colors };
  colorVersion += 1;
  colorListeners.forEach((fn) => fn());
};
export const subscribeLeadStatusColors = (fn: () => void) => {
  colorListeners.add(fn);
  return () => {
    colorListeners.delete(fn);
  };
};
export const leadStatusColorVersion = () => colorVersion;

// Site visit statuses share the colour settings, keyed "visit:<status>".
export const VISIT_STATUS_COLOR_OPTIONS: { value: string; label: string; tone: LeadStatusTone }[] = [
  { value: 'visit:scheduled', label: 'Scheduled', tone: 'blue' },
  { value: 'visit:completed', label: 'Site Visit Done', tone: 'green' },
  { value: 'visit:revisit-done', label: 'Revisit Done', tone: 'purple' },
  { value: 'visit:cancelled', label: 'Cancelled', tone: 'slate' },
  { value: 'visit:no-show', label: 'No show', tone: 'orange' },
];
const VISIT_BY_KEY = Object.fromEntries(VISIT_STATUS_COLOR_OPTIONS.map((o) => [o.value, o]));

/** Built-in colour (hex) of a status, ignoring anyone's choices. */
export const defaultLeadStatusColor = (status?: string | null) => {
  const key = String(status || '').toLowerCase();
  const tone = (STATUS_BY_VALUE[key] || VISIT_BY_KEY[key])?.tone;
  return tone ? LEAD_STATUS_TONES[tone] : '#94a3b8';
};

/** Colour (hex) of a status, for dots, badges and charts. */
export const leadStatusColor = (status?: string | null) =>
  colorOverrides[String(status || '').toLowerCase()] || defaultLeadStatusColor(status);

/** Background for a lead's row or card, by its status: a pale tint of its colour. */
export const leadStatusRowColor = (status?: string | null) => {
  const key = String(status || '').toLowerCase();
  if (!STATUS_BY_VALUE[key] && !VISIT_BY_KEY[key] && !colorOverrides[key]) return undefined;
  return `color-mix(in srgb, ${leadStatusColor(key)} var(--lead-row-mix), var(--lead-row-base))`;
};
