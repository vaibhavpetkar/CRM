// Every app on Settings > Integrations: how it looks in the list, how it is
// found by the search box, and the step-by-step guide shown when it is opened.
// The live state (connected or not, leads received) comes from the API.

export type IntegrationCategory = 'leads' | 'calling' | 'meetings' | 'marketing';

export type IntegrationKind =
  | 'portal' // push URL and/or pull login (backend portalLeadsService)
  | 'import'
  | 'meta'
  | 'incoming-calls'
  | 'caller-numbers'
  | 'rotation'
  | 'google-meet'
  | 'google-business'
  | 'generic'; // catalog-only (LinkedIn, Calendly, Mailchimp)

export interface IntegrationApp {
  key: string; // portal source / activity key / generic provider
  name: string;
  category: IntegrationCategory;
  kind: IntegrationKind;
  description: string;
  keywords: string;
  badge: { text: string; className: string }; // simple lettered tile, not the brand logo
  /** Where the lead's Sub Source comes from. */
  subSource?: string;
  steps: string[];
  /** Has an Activity tab listing the leads it brought in. */
  activity?: boolean;
}

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  leads: 'Lead sources',
  calling: 'Calling',
  meetings: 'Meetings',
  marketing: 'Marketing',
};

const pushSteps = (who: string) => [
  'Open this app below and make sure it is switched On.',
  'Copy the Lead push URL.',
  `Send the URL to ${who} and ask them to push every new enquiry to it (JSON or form fields; XML also works).`,
  'Press "Send a test lead" to see a lead arrive, then ask them to send a test from their side. It shows under Activity within seconds.',
  'Real leads then arrive by themselves, go to the lead rotation when it is on, and are announced in notifications.',
];

export const INTEGRATIONS: IntegrationApp[] = [
  {
    key: '99acres',
    name: '99acres',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Responses on your 99acres projects and listings.',
    keywords: '99 acres property portal real estate',
    badge: { text: '99', className: 'bg-blue-600 text-white' },
    subSource: 'Project / listing name',
    steps: [
      'Easiest: type your 99acres login (the one you use on 99acres.com) under API login and press Save login.',
      'Press "Check now". New responses from the last 24 hours come in, and then every 10 minutes by themselves.',
      'Or, if your 99acres account manager offers lead push, send them the Lead push URL instead.',
      'If you see "check the login", sign in on 99acres.com with the same login to make sure it works, then save it again.',
    ],
  },
  {
    key: 'magicbricks',
    name: 'MagicBricks',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Enquiries from your MagicBricks project and property ads.',
    keywords: 'magic bricks magicbricks property portal',
    badge: { text: 'MB', className: 'bg-red-600 text-white' },
    subSource: 'Project / property name',
    steps: pushSteps('your MagicBricks account manager (ask for "lead push / API integration to our CRM")'),
  },
  {
    key: 'housing.com',
    name: 'Housing.com',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Leads from your Housing.com projects.',
    keywords: 'housing housing.com property portal',
    badge: { text: 'H', className: 'bg-violet-600 text-white' },
    subSource: 'Project name',
    steps: [
      'Ask your Housing.com account manager for API access. They give you a profile (builder) id and an encryption key.',
      'Type both under API login and press Save login.',
      'Press "Check now". New leads then come in every 10 minutes by themselves.',
      'Or ask Housing.com to push leads to the Lead push URL instead.',
    ],
  },
  {
    key: 'meta',
    name: 'Facebook & Instagram',
    category: 'leads',
    kind: 'meta',
    activity: true,
    description: 'Lead Ads forms on your Facebook Pages and Instagram.',
    keywords: 'facebook instagram meta lead ads fb ig social',
    badge: { text: 'f', className: 'bg-[#1877F2] text-white' },
    subSource: 'Ad campaign name (else the form name)',
    steps: [
      'One-time server setup: META_APP_ID, META_APP_SECRET and META_VERIFY_TOKEN must be set, and the Meta app must pass App Review for leads_retrieval (see docs/lead-integrations.md).',
      'Press "Connect Facebook" and log in as an admin of your Facebook Page.',
      'Switch on the Pages that run lead ads. Instagram lead ads come through the Page linked to the Instagram account.',
      'Press "Fetch recent leads" to bring in the last 7 days. New form fills then arrive within seconds.',
      'Name your campaigns after the project ("Skyline Heights - Sept") so the sub source tells you which project each lead wants.',
    ],
  },
  {
    key: 'google-ads',
    name: 'Google Ads',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Lead form assets on your Google Search, YouTube and Discovery ads.',
    keywords: 'google ads adwords lead form youtube search',
    badge: { text: 'G', className: 'bg-emerald-600 text-white' },
    subSource: 'Campaign id and form id',
    steps: [
      'Make up a key (any long word, e.g. skyline2026) and save it below as the Webhook key.',
      'In Google Ads open Assets > Lead forms, edit the form, and go to "Lead delivery options" > "Webhook integration".',
      'Paste the Lead push URL as the Webhook URL and the same key as the Key.',
      'Press "Send test data" in Google Ads. A test lead appears under Activity.',
      'Save the form. Every new lead form submission now arrives within seconds.',
    ],
  },
  {
    key: 'indiamart',
    name: 'IndiaMART',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Buy leads and enquiries from your IndiaMART catalogue.',
    keywords: 'india mart indiamart b2b enquiries',
    badge: { text: 'IM', className: 'bg-[#2E3192] text-white' },
    subSource: 'Product the buyer enquired about',
    steps: [
      'Log in to IndiaMART Seller panel (seller.indiamart.com) and open Lead Manager.',
      'Open Import/Export leads > CRM Integration and generate the CRM key (Pull API).',
      'Paste the key under API login, press Save login, then "Check now". New enquiries come in every 10 minutes.',
      'Or choose "Push API" on the same IndiaMART screen and paste the Lead push URL.',
      'IndiaMART allows one check every 5 minutes; pressing "Check now" more often shows their "too many requests" message.',
    ],
  },
  {
    key: 'justdial',
    name: 'JustDial',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Enquiries from your JustDial listing.',
    keywords: 'just dial justdial listing local',
    badge: { text: 'JD', className: 'bg-orange-500 text-white' },
    subSource: 'JustDial category (e.g. Residential Flats)',
    steps: pushSteps('your JustDial account manager (ask for "lead push to CRM / API integration")'),
  },
  {
    key: 'square-yards',
    name: 'Square Yards',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Project leads from Square Yards.',
    keywords: 'square yards squareyards property portal',
    badge: { text: 'SY', className: 'bg-sky-700 text-white' },
    subSource: 'Project name',
    steps: pushSteps('your Square Yards relationship manager'),
  },
  {
    key: 'nobroker',
    name: 'NoBroker',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Buyer and tenant leads from NoBroker.',
    keywords: 'no broker nobroker property portal',
    badge: { text: 'NB', className: 'bg-rose-500 text-white' },
    subSource: 'Project / property name',
    steps: pushSteps('your NoBroker account manager (Builder / Prime)'),
  },
  {
    key: 'commonfloor',
    name: 'CommonFloor',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Leads from CommonFloor listings.',
    keywords: 'common floor commonfloor quikr property',
    badge: { text: 'CF', className: 'bg-teal-600 text-white' },
    subSource: 'Project / property name',
    steps: pushSteps('your CommonFloor account manager'),
  },
  {
    key: 'proptiger',
    name: 'PropTiger',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Leads from PropTiger (Housing.com group).',
    keywords: 'prop tiger proptiger property',
    badge: { text: 'PT', className: 'bg-amber-600 text-white' },
    subSource: 'Project name',
    steps: pushSteps('your PropTiger account manager'),
  },
  {
    key: 'makaan',
    name: 'Makaan',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Leads from Makaan.com (Housing.com group).',
    keywords: 'makaan makan property',
    badge: { text: 'MK', className: 'bg-lime-700 text-white' },
    subSource: 'Project name',
    steps: pushSteps('your Makaan account manager'),
  },
  {
    key: 'website',
    name: 'Website & landing pages',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Enquiry forms on your website, project microsites and landing pages.',
    keywords: 'website landing page form wordpress elementor contact form 7 webflow wix unbounce microsite',
    badge: { text: 'W', className: 'bg-slate-700 text-white' },
    subSource: 'The "project" or "utm_campaign" field the form sends',
    steps: [
      'Copy the Lead push URL.',
      'WordPress + Elementor: edit the form > Actions After Submit > add Webhook > paste the URL.',
      'WordPress + Contact Form 7: install "CF7 to Webhook", paste the URL in the form\'s Webhook tab.',
      'Webflow / Wix / Unbounce / custom HTML: set the form to POST to the URL (or add it as a webhook).',
      'Name the fields name, mobile, email, project, message (any similar name works). Add a hidden field utm_campaign or project to fill the sub source.',
      'Submit the form once yourself; the lead shows under Activity.',
    ],
  },
  {
    key: 'webhook',
    name: 'Any other app',
    category: 'leads',
    kind: 'portal',
    activity: true,
    description: 'Zapier, Pabbly Connect, Make, Google Sheets or any app that can call a webhook.',
    keywords: 'zapier pabbly make integromat google sheets webhook api other custom',
    badge: { text: '{ }', className: 'bg-indigo-600 text-white' },
    subSource: 'The "sub_source" or "campaign" field you send',
    steps: [
      'Copy the Lead push URL.',
      'In Zapier / Pabbly / Make, add a "Webhook" (POST, JSON) action after your trigger and paste the URL.',
      'Map name, mobile, email, project, message, and lead_source (e.g. "walk-in", "channel-partner") plus sub_source.',
      'Run the test; the lead shows under Activity. Without lead_source the lead is saved as source "Other".',
    ],
  },
  {
    key: 'import',
    name: 'Excel / CSV import',
    category: 'leads',
    kind: 'import',
    activity: true,
    description: 'Upload old leads or a list from an event, broker or another CRM.',
    keywords: 'excel csv xlsx import upload sheet bulk',
    badge: { text: 'XL', className: 'bg-green-700 text-white' },
    subSource: 'The file\'s "Sub Source" column, else the file name',
    steps: [
      'Put one lead per row with a heading row: Name, Mobile, Email, Project, Locality, BHK, Budget, Lead Source, Sub Source (other names like "Phone" or "Customer Name" also work).',
      'Choose the file (.xlsx, .xls or .csv) below and check the preview.',
      'Pick the source for rows that have no Lead Source column, then press Import.',
      'Rows whose mobile or email is already a lead are not added twice; the existing lead gets a note instead. Importing the same file again adds nothing.',
    ],
  },
  {
    key: 'incoming-call',
    name: 'Incoming calls (Vi)',
    category: 'calling',
    kind: 'incoming-calls',
    activity: true,
    description: 'Calls to your Vi number, matched to leads with recording.',
    keywords: 'vi vodafone idea incoming calls ivr exotel phone',
    badge: { text: 'Vi', className: 'bg-[#EE2737] text-white' },
    subSource: 'The company number the buyer called',
    steps: [
      'Copy the Call events URL.',
      'Vi Business: send the URL to Vi Business support and ask them to post every incoming call event (ringing, answered, ended, recording link) to it.',
      'Exotel: in your incoming call flow add a Passthru applet with this URL.',
      'Save each sales person\'s mobile in their profile so the CRM knows who answered.',
      'Call your number once; the call shows in Call Tracking and a new caller appears under Activity.',
    ],
  },
  {
    key: 'caller-numbers',
    name: 'Calling numbers',
    category: 'calling',
    kind: 'caller-numbers',
    description: 'Company numbers customers see when your team calls from the CRM.',
    keywords: 'caller id exophone virtual number calling click to call',
    badge: { text: '#', className: 'bg-cyan-700 text-white' },
    steps: [
      'Add each company number (ExoPhone / Vi DID) you bought from the calling provider.',
      'Give a number to one sales person, or leave it in the shared pool.',
      'The CRM picks a free number for each call so people calling together show different numbers.',
    ],
  },
  {
    key: 'rotation',
    name: 'Lead rotation',
    category: 'calling',
    kind: 'rotation',
    description: 'New leads go to your sales team in turn (round robin).',
    keywords: 'rotation round robin assign distribute rotational calling',
    badge: { text: '↻', className: 'bg-fuchsia-600 text-white' },
    steps: [
      'Add your sales people and put them in order.',
      'Switch it On. Every lead from any app above with no owner goes to the next person in line.',
      'Optionally limit rotation to some sources, and skip people who are offline or on a call.',
    ],
  },
  {
    key: 'google-meet',
    name: 'Google Meet',
    category: 'meetings',
    kind: 'google-meet',
    description: 'A Google Meet link for every video meeting scheduled in the CRM.',
    keywords: 'google meet video calendar meeting',
    badge: { text: 'M', className: 'bg-emerald-500 text-white' },
    steps: ['Ask your admin to set the Google credentials on the server (Settings > Developer).', 'Press Connect and sign in with the Google account that owns the calendar.'],
  },
  {
    key: 'google-business',
    name: 'Google Business Profile',
    category: 'leads',
    kind: 'google-business',
    description: 'Store info and reviews from your Google Business Profile.',
    keywords: 'google business profile maps my business reviews gmb',
    badge: { text: 'GB', className: 'bg-blue-500 text-white' },
    steps: ['Ask your admin to set the Google credentials on the server.', 'Press Connect and sign in with the Google account that manages the profile.', 'Data syncs once Google approves the Business Profile API for the app.'],
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    category: 'marketing',
    kind: 'generic',
    description: 'B2B lead and company workflows.',
    keywords: 'linkedin lead gen forms b2b',
    badge: { text: 'in', className: 'bg-[#0A66C2] text-white' },
    steps: ['LinkedIn Lead Gen needs LinkedIn to approve the app first (Marketing Developer Platform). Once approved, the server credentials are set and Connect works.'],
  },
  {
    key: 'calendly',
    name: 'Calendly',
    category: 'meetings',
    kind: 'generic',
    description: 'Turn Calendly bookings into CRM records.',
    keywords: 'calendly booking schedule',
    badge: { text: 'C', className: 'bg-blue-700 text-white' },
    steps: ['Set CALENDLY_API_KEY on the server, then press Connect.'],
  },
  {
    key: 'mailchimp',
    name: 'Mailchimp',
    category: 'marketing',
    kind: 'generic',
    description: 'Sync contacts into a Mailchimp audience.',
    keywords: 'mailchimp email marketing newsletter',
    badge: { text: 'MC', className: 'bg-yellow-400 text-slate-900' },
    steps: ['Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX on the server, then press Connect.'],
  },
];

export const findIntegration = (key: string | null | undefined) => INTEGRATIONS.find((a) => a.key === key) || null;

export const matchesSearch = (app: IntegrationApp, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${app.name} ${app.keywords} ${app.description} ${CATEGORY_LABEL[app.category]}`.toLowerCase();
  return words.every((w) => hay.includes(w));
};
