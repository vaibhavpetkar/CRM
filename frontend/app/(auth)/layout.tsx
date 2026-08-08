export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-slate-900 p-8 md:p-10 lg:flex lg:p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)] text-lg font-bold text-white">
            Z
          </div>
          <span className="text-xl font-semibold text-white">CRM Pro</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight text-white">
            Manage your sales, marketing &amp; customers in one place
          </h2>
          <p className="mt-4 text-slate-400">
            Streamline lead management, close deals faster, and run targeted marketing campaigns — just like Zoho CRM.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {['Lead Management', 'Sales Pipeline', 'Marketing Automation', 'Team Collaboration'].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                {feature}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} CRM Pro. All rights reserved.</p>
      </div>
      <div className="flex w-full flex-col items-center justify-center bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12 lg:w-1/2">
        {children}
      </div>
    </div>
  );
}

