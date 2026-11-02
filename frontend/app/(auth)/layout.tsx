/* eslint-disable @next/next/no-img-element -- static brand artwork from /public/auth */
import { InveonOneLogo, InveonTechLogo } from '@/components/auth/brand';
import ThemeToggle from '@/components/ui/theme-toggle';

/*
 * Shared frame for every sign-in screen (login, forgot/reset password,
 * invites), built from the "Inveon One CRM — Sign In" design. Artwork lives
 * in /public/auth.
 *
 *   phone / tablet (< 1024px)  logo + headline, then the form card, then the
 *                              feature cards and quick links
 *   desktop (>= 1024px)        branding on the left, form card on the right,
 *                              module badges floating on the portal rings
 *   TV (>= 1920px)             same as desktop; globals.css raises the root
 *                              font size (.auth-shell) so everything scales
 *
 * Sizes are in rem on purpose so the TV scaling reaches all of them.
 */

const ORBIT_BADGES = [
  { src: '/auth/orbit-user.png', alt: 'Users', pos: 'left-[40.5%] top-[18.2%]', anim: 'auth-float-1' },
  { src: '/auth/orbit-deals.png', alt: 'Deals', pos: 'left-[56.5%] top-[19.8%]', anim: 'auth-float-2' },
  { src: '/auth/orbit-chart.png', alt: 'Analytics', pos: 'left-[35.6%] top-[47.1%]', anim: 'auth-float-3' },
  { src: '/auth/orbit-megaphone.png', alt: 'Marketing', pos: 'left-[59.5%] top-[47%]', anim: 'auth-float-1' },
];

const FEATURES = [
  { label: 'Leads', sub: 'Capture & Manage', icon: '/auth/feature-leads.png' },
  { label: 'Sales', sub: 'Track & Convert', icon: '/auth/feature-sales.png' },
  { label: 'Customers', sub: 'Build Relationships', icon: '/auth/feature-customers.png' },
  { label: 'Marketing', sub: 'Engage & Grow', icon: '/auth/feature-marketing.png' },
];

const QUICK_LINKS = [
  { label: 'Quotations', icon: '/auth/link-quotations.png' },
  { label: 'Sales Orders', icon: '/auth/link-sales-orders.png' },
  { label: 'Invoicing', icon: '/auth/link-invoicing.png' },
  { label: 'Campaigns', icon: '/auth/link-campaigns.png' },
  { label: 'Reports', icon: '/auth/link-reports.png' },
  { label: 'Integrations', icon: '/auth/link-integrations.png' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell relative min-h-screen w-full overflow-x-hidden bg-[var(--auth-canvas)] text-[var(--auth-ink)]">
      {/* Plus Jakarta Sans for the sign-in screens; falls back to the app font if it can't load. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        precedence="default"
      />

      {/* 3D portal background, dimmed in dark mode */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[url('/auth/bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[#0b1220]/85 opacity-0 dark:opacity-100" />

      {/* Module badges sitting on the portal rings (desktop and up) */}
      <div className="pointer-events-none fixed inset-0 z-10 hidden lg:block" aria-hidden="true">
        {ORBIT_BADGES.map((b) => (
          <img
            key={b.alt}
            src={b.src}
            alt=""
            className={`absolute h-11 w-11 object-contain drop-shadow-[0_6px_16px_rgba(22,104,227,0.22)] xl:h-12 xl:w-12 ${b.pos} ${b.anim}`}
          />
        ))}
      </div>

      <main className="relative z-20 flex min-h-screen w-full items-center px-4 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-6 xl:px-16">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-6 lg:gap-y-0">
          {/* Logo + headline */}
          <section className="mx-auto w-full max-w-[30rem] sm:max-w-[36rem] lg:col-start-1 lg:row-start-1 lg:mx-0 lg:self-end">
            <img
              src="/auth/inveon-one-crm.png"
              alt="Inveon One CRM"
              className="mb-5 h-auto w-[11rem] select-none object-contain dark:hidden sm:mb-6 sm:w-[14.75rem] lg:w-[15.25rem] xl:w-[16.5rem]"
            />
            <InveonOneLogo className="mb-5 hidden w-[11rem] dark:block sm:mb-6 sm:w-[14.75rem] lg:w-[15.25rem] xl:w-[16.5rem]" />

            <div className="mb-3 max-w-[26.25rem] xl:max-w-[28rem]">
              <h1 className="text-[1.5rem] font-extrabold leading-[1.18] tracking-tight text-[var(--auth-ink)] sm:text-[1.75rem] lg:text-[1.8rem] xl:text-[2rem]">
                Everything Your Business Needs.
              </h1>
              <p className="mt-1 text-[1.5rem] font-extrabold leading-[1.18] tracking-tight text-[var(--auth-blue)] sm:text-[1.75rem] lg:text-[1.8rem] xl:text-[2rem]">
                All in One Place.
              </p>
            </div>
            <p className="max-w-[23.75rem] text-[0.84rem] leading-[1.58] text-[var(--auth-text)] sm:text-[0.875rem] xl:max-w-[25.5rem]">
              One powerful platform to streamline operations, automate workflows, and grow your business with confidence.
            </p>
          </section>

          {/* Form card */}
          <section className="mx-auto w-full max-w-[30rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-translate-x-6 lg:self-center xl:-translate-x-10">
            <div className="auth-card relative w-full rounded-[1.625rem] bg-white p-6 sm:p-8 lg:w-[22rem] xl:w-[22.5rem] 2xl:w-[24rem] xl:p-9">
              <ThemeToggle className="absolute right-5 top-5 sm:right-6 sm:top-6" />
              <div className="[&_h1]:pr-16">{children}</div>

              <div className="mt-5 flex flex-col items-center justify-center pt-2">
                <span className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Powered by</span>
                <img
                  src="/auth/inveon-technologies.png"
                  alt="Inveon Technologies"
                  className="h-[2.75rem] w-auto select-none object-contain dark:hidden sm:h-12"
                />
                <InveonTechLogo className="hidden h-[2.75rem] w-auto dark:block sm:h-12" />
              </div>
            </div>
          </section>

          {/* Feature cards + quick links */}
          <section className="mx-auto w-full max-w-[30rem] sm:max-w-[36rem] lg:col-start-1 lg:row-start-2 lg:mx-0 lg:mt-7 lg:self-start">
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5 lg:max-w-[30.5rem] xl:max-w-[32.5rem]">
              {FEATURES.map((f) => (
                <div
                  key={f.label}
                  className="auth-glass group flex flex-col items-center rounded-2xl px-2.5 py-4 text-center transition-all duration-200 hover:-translate-y-1"
                >
                  <img src={f.icon} alt="" className="mb-2 h-9 w-9 object-contain transition-transform group-hover:scale-105" />
                  <span className="mb-1 text-[0.8125rem] font-bold leading-tight text-[var(--auth-ink)] sm:text-[0.84rem]">{f.label}</span>
                  <span className="mb-2.5 whitespace-nowrap text-[0.625rem] font-medium leading-none text-[var(--auth-sub)] sm:text-[0.65rem]">
                    {f.sub}
                  </span>
                  <span className="h-[0.16rem] w-6 rounded-full bg-[#1668e3]" />
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5 pt-1 text-[0.75rem] font-semibold text-[var(--auth-text)] sm:gap-x-5 sm:text-[0.78rem] lg:mt-8 lg:flex-nowrap lg:whitespace-nowrap xl:gap-x-6">
              {QUICK_LINKS.map((q) => (
                <span key={q.label} className="inline-flex items-center gap-1.5">
                  <img src={q.icon} alt="" className="h-[1.0625rem] w-[1.0625rem] object-contain" />
                  {q.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
