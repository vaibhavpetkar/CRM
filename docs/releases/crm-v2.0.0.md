Inveon One CRM 2.0.0 is the real-estate edition, running at **https://crm.shreemahalaxmirealty.in**. It is the first release with an **Android app** (`InveonOneCRM-2.0.0.apk`, attached below) and covers everything merged since v1.0.0 (PRs #4 to #44).

## 📱 Android app

- Opens the CRM at crm.shreemahalaxmirealty.in full screen, with the same login, leads, calls and reports as the website.
- Stays signed in between launches. The phone's back button goes back a page.
- File uploads (lead import, attachments) use the phone's file picker.
- Exports (CSV, Excel, Word), backups and call recordings save to the phone's **Downloads** folder.
- WhatsApp, phone, email and map links open in the matching app. CRM links shared on WhatsApp or email can open in the app.
- Shows a "Try again" screen when the phone is offline.
- Needs Android 8.0 or newer.

**Install:** download `InveonOneCRM-2.0.0.apk` on the phone, open it, and allow "Install unknown apps" for your browser or file manager when Android asks. The `.sha256` file is the checksum, if you want to check the download.

**Sign in** with your email and password. Google sign-in does not work inside apps (Google blocks it), so use email sign-in.

## 🏠 Real-estate sales

- **Sales activity, Call tracking, Site visits** pages: calls and visits per agent, with team totals for managers.
- Lead property fields: property type, BHK, preferred location, project, budget range. Search understands "2bhk", phone numbers with spaces and multi-word search; new lead filters.
- **Full-page Add Lead** form: Customer Details (with Lead Source and Next Follow-up), Property Requirement, then Address.
- **Follow-up remarks** with a full history, in a sidebar that opens from the right. Follow-up dates cannot be in the past.
- **Lead rotation**: new leads with no owner are shared out to the sales team in turn.
- Unused modules are switched off for this edition: Deals/Pipeline, Quotes, Invoices, Contacts, Tasks, Meetings, Marketing, Inventory, Finance and Tax Master.

## 📞 Calling

- **Click-to-call** from a lead, with call notes and recordings (Exotel, or Vi CPaaS).
- **Vi CPaaS two-way calling** set up from Settings > Integrations, using Vi's click-to-call API (a live call was tested on 2026-10-16). Call outcomes are read from Vi's call report.
- **Team calling**: several sales people can call at once from their own numbers. Each person's calling mobile is set in Settings > Profile or on the Team page.
- **Incoming calls** create or match leads.
- **Live call monitor** on the Team page and a live call queue. Calls stuck on "Starting" end by themselves, and calls can be cancelled.
- A ringing sound plays while a call connects.

## 🔌 Lead sources and integrations

- One searchable **Integrations** page for 23 apps, each with setup steps and an activity log.
- **Facebook and Instagram Lead Ads**, Google Ads lead forms, IndiaMART, 99acres, Housing.com, MagicBricks, the website contact form and a generic webhook.
- Every lead gets a **sub source** filled automatically (portal project, ad campaign or form, import file, incoming number).
- **CSV and Excel lead import** of up to 1,000 rows at a time, with a result for each row.

## 📊 Dashboard and reports

- New Inveon One look: navy sidebar, brand blue, rounded cards, and a working dark mode.
- Redesigned dashboard with live numbers and trend lines.
- **Reports & Analytics** is one page with steps: Overview, Sales forecast, Profit & loss, Marketing and Lead sources.
- Keyboard shortcuts: **Ctrl+S** saves a form, **Esc** closes a popup, **Alt+N** adds a new record.

## 🏢 Companies, sign-in and security

- **Multi-company**: every record belongs to one company, with company signup, a 15-day trial and plans.
- New sign-in page with show/hide password. Email addresses are unique, so the web login does not ask for a company code.
- **Database backups** for the super admin: back up, download, delete and restore, with an optional daily backup.
- Server settings are super admin only. Changing a password signs out the account's other sessions.
- Safer outgoing requests, cleaned-up template HTML, private quote PDF names, tighter nginx and a server hardening script.

## 🐛 Fixes

- Blank user pickers no longer save as user 0. The task ⋮ menu and autocomplete lists close and select properly.
- "All Statuses" filters show every status. Bad Lead/Contact/user picks return a clear error instead of a server error.
- Task counts no longer change with the selected tab. A brand-new database sets up without errors.
- Deploys no longer fail when two run at once.

## ⚙️ Upgrading the server

1. The server `.env` must set `DB_PASSWORD`, `JWT_SECRET` and `SUPER_ADMIN_PASSWORD`; Docker Compose stops if any is missing.
2. For the new domain set `CLIENT_URL`, `NEXT_PUBLIC_API_URL` and `CRM_DOMAIN` to crm.shreemahalaxmirealty.in, point DNS at the server, get the certificate (certbot) and rebuild the frontend.
3. If you add `SETTINGS_ENCRYPTION_KEY` after saving Vi or Exotel passwords, enter those passwords again.
4. Ask Vi to send call events to `https://crm.shreemahalaxmirealty.in/api/webhooks/voice/incoming/<token>` so incoming calls and call outcomes arrive straight away.

See `docs/production-checklist.md` and `docs/deploy-aws.md` for the full steps.

## Known limits

- The 99acres, Housing.com and IndiaMART pull connections have not been tested against live accounts yet.
- Printing from inside the Android app is not supported; print from a browser.
