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
export const LEAD_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '99acres', label: '99acres' },
  { value: 'magicbricks', label: 'MagicBricks' },
  { value: 'housing.com', label: 'Housing.com' },
  { value: 'nobroker', label: 'NoBroker' },
  { value: 'commonfloor', label: 'CommonFloor' },
  { value: 'square-yards', label: 'Square Yards' },
  { value: 'proptiger', label: 'PropTiger' },
  { value: 'makaan', label: 'Makaan' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google-ads', label: 'Google Ads' },
  { value: 'indiamart', label: 'IndiaMART' },
  { value: 'justdial', label: 'JustDial' },
  { value: 'website', label: 'Website' },
  { value: 'walk-in', label: 'Walk-in / Site' },
  { value: 'channel-partner', label: 'Channel Partner / Broker' },
  { value: 'referral', label: 'Referral' },
  { value: 'hoarding', label: 'Hoarding / Banner' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'incoming-call', label: 'Incoming Call' },
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
