import { InveonOneLogo, InveonTechLogo } from '@/components/auth/brand';
import ThemeToggle from '@/components/ui/theme-toggle';

/*
 * Shared frame for every sign-in screen (login, forgot/reset password,
 * invites). One layout that reflows instead of separate mobile/desktop pages:
 *
 *   phone   (< 640px)   logo bar, the form card, then a short feature list
 *   tablet  (640-1023)  same order, wider card, features in a 2 x 2 grid
 *   desktop (>= 1024)   hero on the left, form card on the right
 *   TV      (>= 1920)   same as desktop; globals.css raises the root font
 *                       size (.auth-shell) so everything scales up evenly
 *
 * Sizes here are in rem on purpose, so the TV scaling reaches all of them.
 */

const FEATURES = [
  {
    label: 'Leads',
    sub: 'Capture and qualify every enquiry',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Sales',
    sub: 'Pipeline, quotes and invoices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M3 17 9 11l4 4 8-8M15 7h6v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    sub: 'Every contact and conversation together',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M2.5 19c0-3 2.9-5.2 6.5-5.2s6.5 2.2 6.5 5.2M15 19c.2-2 1.6-3.6 3.7-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    sub: 'Live team performance and analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M4 20V10M10 20V5M16 20v-7M21.5 20h-19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

const HIGHLIGHTS = ['Secure sign-in', 'Phone, tablet, desktop & TV', 'Light & dark mode'];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell relative min-h-screen overflow-hidden bg-[var(--auth-canvas)] text-slate-900">
      {/* Plus Jakarta Sans for the sign-in screens; falls back to the app font if it can't load. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        precedence="default"
      />

      {/* Soft background glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[var(--auth-glow)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-[var(--auth-glow)] blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[90rem] flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-12 lg:py-8">
        <header className="flex items-center justify-between gap-4">
          <InveonOneLogo className="w-24 sm:w-28 lg:w-32" />
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center py-6 sm:py-8 lg:py-4">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-20">
            {/* Form card */}
            <section className="mx-auto w-full max-w-[30rem] rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(71,0,133,0.28)] sm:p-10 lg:order-2 lg:max-w-none">
              {children}
            </section>

            {/* Hero */}
            <section className="mx-auto w-full max-w-[30rem] sm:max-w-2xl lg:order-1 lg:mx-0 lg:max-w-none">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--auth-tint)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                Inveon One CRM
              </span>
              <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl lg:text-4xl xl:text-5xl">
                Everything your business needs.{' '}
                <span className="text-[var(--primary)] lg:block">All in one place.</span>
              </h2>
              <p className="mt-4 hidden max-w-xl text-base leading-relaxed text-slate-600 sm:block lg:text-lg">
                Manage leads, sales, customers and reports from one simple workspace.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-8">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--auth-tint)] text-[var(--primary)] sm:h-12 sm:w-12">
                      {f.icon}
                    </div>
                    <div className="mt-3 text-sm font-bold text-slate-900 sm:text-base">{f.label}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-500 sm:text-sm">{f.sub}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 hidden flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-slate-100/80 px-5 py-3 text-sm font-semibold text-slate-700 sm:flex">
                {HIGHLIGHTS.map((h) => (
                  <span key={h} className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[var(--primary)]">
                      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {h}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </main>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Inveon Technologies. All rights reserved.</span>
          <span className="flex items-center gap-2">
            Powered by
            <InveonTechLogo className="w-20" />
          </span>
        </footer>
      </div>
    </div>
  );
}
