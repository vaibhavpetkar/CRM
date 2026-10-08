# Real-estate sales features

What the sales team gets on the real-estate branch, where to find it, and how
to set up Vi calling and lead rotation.

## Pages

| Page | Menu | What it shows |
| --- | --- | --- |
| Sales Activity (`/sales-activity`) | Sales | Calls (total, connected, missed, talk time) and site visits (done, scheduled) per sales person for today, yesterday, 7/30 days, this month or any dates. Green dot = online or on a call, red = offline. A daily chart of calls and visits. |
| Call Tracking (`/call-tracking`) | Sales | Every call: who made it, to which lead, outcome, talk time, the company number used, notes and the recording. Filter by sales person, outcome (connected / missed / live now), customer number and dates. |
| Site Visits (`/site-visits`) | Sales | Visits scheduled and done, by sales person, with feedback. Mark done / no show from the list. Each lead also has a **Site Visits** tab. |
| Lead Sources (`/lead-sources`) | Overview | Leads per source (99acres, MagicBricks, Housing.com, NoBroker, Facebook, walk-in, channel partner...), share, qualified, converted, conversion rate and a per-day chart. "View leads" opens the Leads list filtered to that source. The dashboard's "Leads by Source" card links here. |

Managers (anyone whose role has **View team**, `users:read`) see the whole team;
everyone else sees only their own calls and visits.

## Leads: search and filters

- The search box matches name, mobile (with or without spaces / +91), area,
  city, project and BHK. Every word must match, so `rahul baner 2bhk` finds
  Rahul's 2 BHK enquiry in Baner. `2bhk`, `2 BHK` and `2 bhk` are the same.
- **More filters**: lead source, sales person (or unassigned), property type,
  budget range, area, lead date range and configuration chips (1 RK ... 5+ BHK).
- New lead fields (lead form and lead page): configuration, property type,
  preferred area, project, budget from / to.

## Vi Business (Vodafone Idea) calling

Set `VOICE_PROVIDER=vi` in the server's `.env` and fill in the values from the
API document Vi gives you with your Vi Business cloud-calling / click-to-call
plan. Vi does not publish one public API, so the CRM speaks the common
click-to-call shape and every part can be matched to your document without code:

| Variable | Needed | What to put |
| --- | --- | --- |
| `VI_API_URL` | yes | The click-to-call endpoint URL |
| `VI_API_KEY` | yes | API key / token |
| `VI_CALLER_ID` | yes, unless numbers are added in Settings > Integrations > Calling numbers | Your Vi DID / virtual number |
| `VI_AUTH_HEADER` | no | Header carrying the key (default `Authorization`) |
| `VI_AUTH_SCHEME` | no | Prefix before the key (default `Bearer`, `none` for a bare key) |
| `VI_ACCOUNT_ID` | no | Account / customer id, usable as `{{accountId}}` |
| `VI_REQUEST_TEMPLATE` | no | JSON body to send. Placeholders: `{{agent}}`, `{{customer}}`, `{{callerId}}` (10-digit), `{{agentE164}}`, `{{customerE164}}`, `{{callbackUrl}}`, `{{record}}`, `{{accountId}}`. Default: `{"agent_number":"{{agent}}","customer_number":"{{customer}}","caller_id":"{{callerId}}","record":"{{record}}","callback_url":"{{callbackUrl}}"}` |
| `VI_STATUS_URL` | no | URL to read one call, with `{{callId}}`, used when a webhook is missed |

Ask Vi to send call events (answered, ended, recording link) to the callback
URL the CRM passes in each request (`{{callbackUrl}}`, which is
`https://<your domain>/api/webhooks/voice/<per-call token>`). The CRM reads the
call id, status, talk time, start/end times and recording URL whatever Vi names
those fields (`call_id`/`callId`/`uuid`, `status`/`call_status`/`disposition`,
`duration`/`talk_time`, `recording_url`...). If your document uses names the
CRM doesn't recognise, send it over and the mapping can be extended.

Calls placed through Vi show up in Call Tracking, Sales Activity and the live
green/red status exactly like Exotel calls. Restart the backend after
changing `.env` (`docker compose up -d`).

## Lead rotation (rotational calling)

Settings > Integrations > **Lead rotation**:

- Add the sales people and their order, then switch it **On**. Every new lead
  that arrives without an owner (portal, Facebook, website form, import, or
  added by hand with "Assigned To" blank) goes to the next person in turn.
- "Only give leads to people who are online and not on a call" skips anyone
  offline or busy; if nobody is free, the next person still gets the lead.
- Optionally limit rotation to some sources (e.g. only 99acres and MagicBricks).
- "Assign unassigned leads now" hands out existing unassigned open leads.

**Incoming calls in rotation**: the card shows a routing URL. In Exotel, use a
Connect applet with "dynamic URL" pointing at it; each incoming call rings
whoever's turn it is, then the rest of the team in order. Providers that want
a single number can add `?format=text`. Each sales person needs their own
mobile saved (Profile, or the calling panel).

## Settings that apply

- `REPORT_TZ_OFFSET_MINUTES` (default 330, India): which time zone days are
  counted in for reports and the lead date filter.
- No new tables need creating by hand: `site_visits` is created on start, and
  the new lead columns are added by the start-up schema patches.
