import type { Metadata } from 'next';

// Public page: Meta requires a privacy policy URL (and data deletion
// instructions) before a Lead Ads app can be switched to Live. It sits
// outside the (app) group so it opens without signing in.
export const metadata: Metadata = {
  title: 'Privacy Policy — Shree Mahalaxmi Realty CRM',
  description: 'How the Shree Mahalaxmi Realty CRM handles lead and customer data.',
  robots: { index: true, follow: false },
};

const UPDATED = '26 October 2026';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-slate-800 dark:text-slate-200">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {UPDATED}</p>

      <section className="mt-8 space-y-3">
        <p>
          This CRM is run by Shree Mahalaxmi Realty to manage enquiries about its real estate projects. This policy
          explains what we collect, why, and how you can ask us to delete it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">What we collect</h2>
        <p>
          When you fill in one of our forms, including Facebook and Instagram lead forms, a property portal enquiry or
          our website contact form, we receive the details you entered: usually your name, phone number, email
          address, and your preferences such as property type, budget and location. We also record which ad, form or
          campaign the enquiry came from, and our notes and call history with you.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">How we use it</h2>
        <p>
          We use these details only to contact you about the property you asked about, to arrange site visits and to
          follow up on your enquiry. We do not sell your data or share it with other advertisers. It is stored on our
          own secured server and is seen only by our sales team.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">How long we keep it</h2>
        <p>We keep enquiry records while they are useful for following up with you, or until you ask us to delete them.</p>
      </section>

      <section id="data-deletion" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Deleting your data</h2>
        <p>
          To have your details removed, call or message the Shree Mahalaxmi Realty sales team, or reply to any message
          from us, and ask for your data to be deleted. Tell us the phone number or email you used. We will delete your
          enquiry and its history within 30 days and confirm when it is done.
        </p>
        <p>
          You can also remove our access to your Facebook data at any time from your Facebook settings under Apps and
          Websites.
        </p>
      </section>
    </main>
  );
}
