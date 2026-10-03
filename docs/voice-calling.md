# Click-to-call: setup guide

The CRM can call a lead or contact with one click. A green phone icon sits next
to every saved Indian phone number on the lead form (Telephone, Mobile,
Alternate Mobile) and in the contact panel. Clicking it opens a calling panel
that:

1. rings **your own phone** first (the number you save the first time you call),
2. connects you to the customer as soon as you pick up, showing the caller ID
   as your company's virtual number,
3. lets you type notes while you talk (saved automatically),
4. saves the **call recording** on the lead/contact once the call ends.

Every call is listed on the lead's **Calls** tab and in the contact panel, with
notes, duration and the recording (play or download). Each finished call is
also logged on the lead's Activity timeline. Calls belong to the company that
made them, like all other CRM data.

## Which provider, and why Exotel

Indian rules (DoT/TRAI) don't allow an internet app to call a normal Indian
phone number directly, so the call has to go through a licensed Indian cloud
telephony provider that "bridges" two phone calls. That rules out Twilio for
this: it does not offer domestic calls within India at all.

| Provider | Fit for CRM click-to-call | Cost (approx., 2026, verify with sales) | Notes |
|---|---|---|---|
| **Exotel** (default) | Built for it: one "Connect two numbers" API call, recording included | Prepaid credits; entry plan about ₹8,800 for 5 months incl. 1 virtual number, then roughly ₹1 per minute range | DoT licensed, self-serve signup, KYC in a day or two, most Indian CRMs integrate it |
| Plivo | Good API, Indian numbers available | Often 10 to 25% cheaper per minute than Exotel | Needs an India-registered business, strict "both legs in India" rules, more setup |
| Knowlarity | Click-to-call available | Sales-quoted bundles | Strong IVR/call-centre focus |
| MyOperator | Click-to-call available | Sales-quoted bundles | SMB-friendly office phone system with an app |
| Ozonetel | Call-centre (CloudAgent) | Per-agent plans | Best for large calling teams |
| Twilio | Not possible | 2 to 3x Indian providers | No domestic Indian calling |

**Recommendation: Exotel.** It is the best value for a small or mid-sized team
that wants click-to-call with recordings: low prepaid entry cost, no
per-agent licence, a simple API, and recordings included. If call volume
grows large, Plivo can be cheaper per minute; the CRM talks to providers
through an adapter (`backend/src/services/voice/`), so a Plivo, Knowlarity or
MyOperator adapter can be added later without touching the screens.

## Setting up Exotel

1. **Sign up** at exotel.com and complete KYC (company PAN, GST certificate or
   incorporation proof, director ID). Calls only work once KYC is approved.
2. **Get a virtual number (ExoPhone)** in the dashboard. Use a normal
   10-digit landline ExoPhone for sales/service calls to existing leads. Bulk
   promotional calling to strangers needs a 140-series number and is not what
   this feature is for.
3. **Copy your API credentials**: Dashboard > Settings > API Settings shows the
   Account SID, API Key, API Token and the subdomain (`api.exotel.com`, or
   `api.in.exotel.com` for Mumbai-cluster accounts).
4. **Add them to the server** (the `.env` next to `docker-compose.yml` on the
   VPS), then redeploy:

   ```
   VOICE_PROVIDER=exotel
   EXOTEL_ACCOUNT_SID=your_sid
   EXOTEL_API_KEY=your_api_key
   EXOTEL_API_TOKEN=your_api_token
   EXOTEL_CALLER_ID=08047112345      # your ExoPhone
   EXOTEL_SUBDOMAIN=api.exotel.com
   ```

   Optional: `EXOTEL_TIME_LIMIT` (max call seconds) and
   `VOICE_CALLBACK_BASE_URL` (defaults to `CLIENT_URL`; must be the public
   HTTPS address of the CRM so Exotel can report call status to
   `/api/webhooks/voice/...`). Nothing needs to be configured on Exotel's side
   for webhooks: the CRM sends the callback URL with every call.
5. **Each user saves their own phone number** the first time they click a call
   icon (the panel asks for it). That phone rings first on every call.

### Trying it without an account

Set `VOICE_PROVIDER=mock`. Calls then "ring" for a few seconds, "connect" for
ten, and save a short test tone as the recording. No real phone rings and
nothing is charged.

## Rules to keep in mind (India)

- **Consent and DND**: under TRAI's TCCCPR rules, promotional calls to people
  who haven't asked to hear from you are not allowed from normal numbers.
  Calling your own leads and customers about their enquiry (service and
  transactional calls) is fine.
- **Recording**: tell the customer the call is recorded (for example, an
  Exotel welcome message or a line at the start of the call). Under the
  DPDP Act 2023, keep recordings only as long as you need them.
- **DLT** registration is for SMS templates and headers; it is not needed for
  these voice calls, but Exotel will ask for it if you also use their SMS.
- Only numbers saved on the lead or contact can be dialled, so the API can't be
  used to call (and bill) arbitrary numbers.

## How it works (for developers)

- `backend/src/services/voice/` holds the provider adapters (`exotel.ts`,
  `mock.ts`) behind the `VoiceProvider` interface in `types.ts`. Register a new
  one in `index.ts` and select it with `VOICE_PROVIDER`.
- `backend/src/services/callService.ts` places calls, applies status updates
  from the webhook (`POST /api/webhooks/voice/:token`, a secret per-call
  token) and from polling while the calling panel is open, downloads the
  recording into `uploads/recordings/`, and logs finished calls on the
  timeline.
- API: `GET /api/calls/config`, `PUT /api/calls/my-number`,
  `POST /api/calls`, `GET /api/calls?leadId=|contactId=`, `GET /api/calls/:id`,
  `PATCH /api/calls/:id` (notes), `GET /api/calls/:id/recording`.
- Frontend: `frontend/components/calls/` (call button, floating calling panel,
  call history, recording player).
