import { HeroArt, InveonOneLogo } from '@/components/auth/brand';

const FEATURES = [
  {
    label: 'Leads',
    sub: 'Capture & Manage',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7.5 17.2c.9-2 2.6-3 4.5-3s3.6 1 4.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Sales',
    sub: 'Track & Convert',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <rect x="3" y="14" width="3.6" height="7" rx="0.6" fill="currentColor" />
        <rect x="8.6" y="11" width="3.6" height="10" rx="0.6" fill="currentColor" />
        <rect x="14.2" y="8" width="3.6" height="13" rx="0.6" fill="currentColor" />
        <path d="M3 10.5 9 6l3.5 2.5L20 3m0 0h-4m4 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    sub: 'Build Relationships',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.5 19c0-3 2.9-5.2 6.5-5.2s6.5 2.2 6.5 5.2M15 19c.2-2 1.6-3.6 3.7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Marketing',
    sub: 'Engage & Grow',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M3 9.5v5h3l9 4.5V5L6 9.5H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.5 14.5 8 20h2.5L9.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 9.5a3 3 0 0 1 0 5M19.5 5.5l1.5-1.5M19.5 18.5l1.5 1.5M21 12h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const QUICK_LINKS = [
  {
    label: 'Quotations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 11h5M10 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Sales Orders',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="9" cy="20" r="1.4" fill="currentColor" />
        <circle cx="18" cy="20" r="1.4" fill="currentColor" />
        <path d="M2.5 4h2.5l2.4 12.2h10.7L20.5 8H6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Invoicing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M6 2h9l3 3v17H6V2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Campaigns',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M2 12 21 3l-5 18-5-8-8-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 3v8l6 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Integrations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M9 3h6v4.5a2.5 2.5 0 0 0 2.5 2.5H22v6h-4.5A2.5 2.5 0 0 0 15 18.5V21H9v-4.5A2.5 2.5 0 0 0 6.5 14H2V9h4.5A2.5 2.5 0 0 0 9 6.5V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-gradient-to-br from-[#eceef7] via-[#e9ebf5] to-[#d6dbee] dark:from-[#0b1220] dark:via-[#0d1528] dark:to-[#111a33]">
      {/* Background glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-white/60 blur-3xl dark:bg-blue-500/5" />
      <div className="pointer-events-none absolute bottom-[-120px] left-[30%] h-[420px] w-[520px] rounded-full bg-orange-100/50 blur-3xl dark:bg-orange-500/5" />

      {/* Left hero */}
      <div className="relative hidden flex-1 flex-col justify-center py-10 pl-14 pr-6 lg:flex xl:pl-16">
        <div className="relative z-10 flex items-center">
          <div className="w-[350px] shrink-0">
            <InveonOneLogo className="w-[215px]" />

            <h2 className="mt-8 text-[21px] font-bold leading-snug text-[#0b1a3a] dark:text-white">
              Everything Your Business Needs.
              <br />
              <span className="text-[var(--primary)]">All in One Place.</span>
            </h2>
            <p className="mt-4 max-w-[290px] text-[13px] leading-relaxed text-slate-600">
              One powerful platform to streamline operations, automate workflows, and grow your business with confidence.
            </p>
          </div>
          <HeroArt className="ml-4 w-[320px] shrink-0 xl:w-[360px]" />
        </div>

        <div className="relative z-10 mt-2 flex gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex w-[112px] flex-col items-center rounded-xl border border-white/70 bg-white/60 px-2 pb-3 pt-4 text-center shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
            >
              <span className="text-[var(--primary)] [&_svg]:h-9 [&_svg]:w-9">{f.icon}</span>
              <div className="mt-2 text-[15px] font-semibold text-[#0b1a3a] dark:text-white">{f.label}</div>
              <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">{f.sub}</div>
              <span className="mt-3 h-0.5 w-7 rounded-full bg-[var(--primary)]/70" />
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-8 flex flex-wrap items-center gap-y-3 text-[12px] font-medium text-[#0b1a3a] dark:text-slate-700">
          {QUICK_LINKS.map((q, i) => (
            <span key={q.label} className="flex items-center">
              {i > 0 && <span className="mx-3.5 h-5 w-px bg-slate-300 dark:bg-white/15" />}
              <span className="flex items-center gap-2">
                <span className="text-[#0b1a3a] dark:text-slate-700 [&_svg]:h-[18px] [&_svg]:w-[18px]">{q.icon}</span>
                {q.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Right sign-in panel */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-4 py-8 sm:px-6 lg:w-[480px] lg:shrink-0 lg:items-stretch lg:py-4 lg:pl-0 lg:pr-5 xl:w-[470px]">
        {children}
      </div>
    </div>
  );
}
