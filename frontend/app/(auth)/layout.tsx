const FEATURES = [
  {
    label: 'Leads',
    sub: 'Capture & Manage',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Sales',
    sub: 'Track & Convert',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    sub: 'Build Relationships',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M2.5 19c0-3 2.9-5.2 6.5-5.2s6.5 2.2 6.5 5.2M15 19c.2-2 1.6-3.6 3.7-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Marketing',
    sub: 'Engage & Grow',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M4 10v4h3l5 4V6L7 10H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M16.5 9.5a4 4 0 0 1 0 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Left branding panel */}
      <div className="relative hidden w-1/2 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-10 lg:flex lg:p-14">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -right-24 top-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[var(--primary)]/10 via-orange-200/20 to-transparent blur-2xl" />

        {/* Logo */}
        <div>
          <div className="text-2xl font-black tracking-[0.15em] text-slate-900">INVEON</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-[var(--primary)]">
              <span className="text-sm font-extrabold text-orange-500">1</span>
            </span>
            <span className="text-4xl font-black tracking-tight text-slate-900">ONE</span>
          </div>
          <div className="mt-1 flex items-center gap-2 pl-0.5">
            <span className="h-px w-4 bg-[var(--primary)]/40" />
            <span className="text-sm font-bold tracking-[0.35em] text-[var(--primary)]">CRM</span>
          </div>
        </div>

        {/* Tagline + features */}
        <div className="relative z-10 mt-10">
          <h2 className="text-2xl font-bold leading-snug text-slate-900">
            Everything Your Business Needs.
            <br />
            <span className="text-[var(--primary)]">All in One Place.</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-slate-500">
            One powerful platform to streamline operations, automate workflows, and grow your business with confidence.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--primary)] text-[var(--primary)]">
                  {f.icon}
                </div>
                <div className="mt-3 text-sm font-bold text-slate-800">{f.label}</div>
                <div className="text-xs text-slate-400">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links row */}
        <div className="relative z-10 mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200/70 pt-6 text-xs font-medium text-slate-500">
          {QUICK_LINKS.map((q) => (
            <span key={q.label} className="flex items-center gap-1.5">
              <span className="text-[var(--primary)]">{q.icon}</span>
              {q.label}
            </span>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12 lg:w-1/2">
        {children}
      </div>
    </div>
  );
}

