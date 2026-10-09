# Lead integrations: setup guide

Everything is under **Settings > Integrations**. Search for an app or pick a
filter, then click it. The panel that opens has three parts:

- **Set up**: the switch, the secret URL to copy, and any login or key to save.
- **How to connect**: the same steps as in this guide.
- **Activity**: every lead the app sent, with totals for today / 7 / 30 days,
  a split by sub source, who the lead went to, and whether it was a new lead,
  an existing lead (a note was added) or failed.

A green tick means the app is really working: it has delivered a lead, or its
saved login works. An amber mark means the last attempt failed; the error is
shown in the panel.

## How every lead is handled

- **Source** is the app (99acres, Google Ads, ...). **Sub source** is filled in
  automatically so you can see which project, campaign or listing a lead came
  from (see the table below). Both show on the lead and can be searched; add the
  "Sub Source" column on the Leads page with *Arrange & Hide Columns*.
- The project, locality, BHK, property type and budget are read from the
  enquiry whatever the app calls them ("2 BHK under 75 lakh" becomes 2 BHK,
  budget up to ₹75 L).
- The same enquiry is never added twice, even if the app sends it again.
- If the mobile or email is already a lead, no new lead is made: the existing
  lead gets an "Enquired again on ..." note on its timeline.
- New leads go to the next sales person when **Lead rotation** is on, and
  admins get a notification.

| App | How it connects | Sub source is |
| --- | --- | --- |
| 99acres | Login (read every 10 min) or push URL | Project / listing |
| MagicBricks | Push URL | Project / property |
| Housing.com | Profile id + key (read every 10 min) or push URL | Project |
| Facebook & Instagram | Connect Facebook | Ad campaign, else form name |
| Google Ads | Push URL + key | Campaign id and form id |
| IndiaMART | CRM key (read every 10 min) or push URL | Product enquired about |
| JustDial | Push URL | JustDial category |
| Square Yards, NoBroker, CommonFloor, PropTiger, Makaan | Push URL | Project / property |
| Website & landing pages | Push URL | The form's `project` / `utm_campaign` field |
| Any other app (Zapier, Pabbly, Make, Sheets) | Push URL | The `sub_source` / `campaign` field you send |
| Excel / CSV import | Upload a file | The file's Sub Source column, else the file name |
| Incoming calls (Vi) | Call events URL | The company number that was called |

## Property portals that push leads

**MagicBricks, JustDial, Square Yards, NoBroker, CommonFloor, PropTiger, Makaan**

1. Open the app and check it is switched **On**.
2. Copy the **Lead push URL**.
3. Send it to your account manager at the portal and ask them to "push every
   new lead to this URL (lead push / API integration to our CRM)". JSON, form
   fields or XML all work.
4. Press **Send a test lead**: a sample lead appears under Activity. Ask the
   portal to send a test from their side too.
5. Done. Leads arrive within seconds of the enquiry.

Each URL is secret and only works for your company. If it leaks, ask for a new
one (each app has its own URL).

## 99acres

1. Type the login you use on 99acres.com under **API login** and press **Save**.
2. Press **Check now**. Responses from the last 24 hours come in, then new ones
   every 10 minutes.
3. Or ask your 99acres account manager to push leads to the Lead push URL.
4. "Check the login" errors: sign in on 99acres.com with the same login, then
   save it again.

## Housing.com

1. Ask your Housing.com account manager for API access: they give a **profile
   (builder) id** and an **encryption key**.
2. Save both under API login, then **Check now**. New leads come in every 10
   minutes.
3. Or ask Housing.com to push leads to the Lead push URL.

## Facebook & Instagram Lead Ads

One-time server setup (done by whoever runs the server):

1. Create an app at developers.facebook.com (type *Business*), add **Facebook
   Login for Business** and **Webhooks**.
2. Set on the server: `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`
   (any random word), restart.
3. In the Meta app, Webhooks > Page > subscribe to `leadgen` with the Webhook URL
   and verify token shown in the CRM.
4. Submit the app for **App Review** for `leads_retrieval`,
   `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`. Until it
   is approved, only people with a role on the Meta app can connect.

Then in the CRM:

1. Press **Connect Facebook** and log in as an admin of the Page.
2. Switch on the Pages that run lead ads (Instagram lead ads come through the
   Page linked to the Instagram account).
3. Press **Fetch recent leads** for the last 7 days. New form fills arrive within
   seconds.
4. Name campaigns after the project ("Skyline Heights - Sept") so the sub source
   shows the project.

## Google Ads (lead form assets)

1. Make up a key (any long word) and save it in the CRM as the **Webhook key**.
2. In Google Ads: **Assets > Lead forms**, edit the form, **Lead delivery
   options > Webhook integration**.
3. Paste the **Lead push URL** as Webhook URL and the same key as Key.
4. Press **Send test data**. The test lead shows under Activity.
5. Save the form. A request with the wrong key is refused.

## IndiaMART

1. In the IndiaMART Seller panel open **Lead Manager > Import/Export leads >
   CRM Integration** and generate the **CRM key** (Pull API).
2. Paste it under API login, **Save**, then **Check now**. New enquiries come in
   every 10 minutes.
3. Or choose **Push API** on the same screen and paste the Lead push URL.
4. IndiaMART allows one check every 5 minutes; pressing Check now too often
   shows their "too many requests" message.

## Website & landing pages

1. Copy the Lead push URL.
2. WordPress + Elementor: edit the form > *Actions After Submit* > add
   **Webhook** > paste the URL.
3. WordPress + Contact Form 7: install *CF7 to Webhook* and paste the URL in the
   form's Webhook tab.
4. Webflow / Wix / Unbounce / custom HTML: make the form POST to the URL (or add
   it as a webhook).
5. Name fields `name`, `mobile`, `email`, `project`, `message` (similar names
   work). A hidden `utm_campaign` or `project` field fills the sub source.

## Any other app (Zapier, Pabbly Connect, Make, Google Sheets)

1. Copy the Lead push URL.
2. Add a **Webhook (POST, JSON)** step after your trigger and paste the URL.
3. Map `name`, `mobile`, `email`, `project`, `message`, `lead_source` (e.g.
   `walk-in`, `channel-partner`, `nobroker`) and `sub_source`.
4. Without `lead_source` the lead is saved with source "Other".

Example body:

```json
{ "name": "Rahul Sharma", "mobile": "9876543210", "project": "Skyline Heights",
  "message": "2 BHK, budget 70 lakh", "lead_source": "channel-partner", "sub_source": "Broker Ramesh" }
```

## Excel / CSV import

1. One lead per row with a heading row, e.g. Name, Mobile, Email, Project,
   Locality, BHK, Budget, Lead Source, Sub Source. Other headings such as
   "Phone" or "Customer Name" are understood too.
2. Choose the file (.xlsx, .xls, .csv), check the preview.
3. Pick the source for rows without a Lead Source column, optionally a sub
   source (default: the file name), and press **Import**.
4. Rows already in the CRM (same mobile or email) are not added again; rows
   with neither mobile nor email are skipped. Importing the same file twice
   adds nothing.

(The Leads page's own Import button still works for B2B-style files with the
CRM's exact columns.)

## Incoming calls (Vi)

1. Copy the **Call events URL**.
2. Vi Business: send it to Vi Business support and ask them to post every
   incoming call event (ringing, answered, ended, recording link) to it.
   Exotel: add a Passthru applet with the URL in your incoming call flow.
3. Save each sales person's mobile in their profile so the CRM knows who
   answered.
4. Call your number once: the call shows in Call Tracking, and a new caller
   becomes a lead (source Incoming Call, sub source = the number they called).

## Not built (and why)

- **LinkedIn Lead Gen Forms**: LinkedIn must approve the app (Marketing
  Developer Platform) first.
- **WhatsApp**: needs a WhatsApp Business API provider account (Meta, Interakt,
  Gupshup...). Leads from such a tool can already come in through *Any other
  app*.

## Settings on the server

- `PORTAL_POLL_MINUTES` (default 10): how often saved logins are checked.
- `ACRES99_API_URL`, `HOUSING_API_URL`, `INDIAMART_API_URL`: only if a portal
  gives you a different API address.
- The pull APIs (99acres, Housing.com, IndiaMART) are built from their published
  formats but have not yet been run against live accounts; the first real check
  shows any error on the app's panel.
