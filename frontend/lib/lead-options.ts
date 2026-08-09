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
