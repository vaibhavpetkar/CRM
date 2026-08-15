'use client';

import { useEffect, useState } from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';
import AuthGuard from './auth-guard';
import { cn } from '@/lib/utils';
import { companyApi } from '@/lib/api';
import { setCachedCurrency } from '@/lib/currency';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Prime the cached currency from Company Settings once per app load, so
  // every formatCurrency() call anywhere in the app reflects the org's
  // configured currency instead of defaulting to USD.
  useEffect(() => {
    companyApi
      .getCompany()
      .then((company) => {
        if (company?.currency) setCachedCurrency(company.currency);
      })
      .catch(() => {
        // Not logged in yet, or backend unavailable — formatCurrency() will
        // fall back to its cached/default value.
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      {/* No left padding on mobile — the sidebar is an off-canvas drawer there, not a permanent column. */}
      <div className={cn('transition-all duration-200', sidebarCollapsed ? 'md:pl-[68px]' : 'md:pl-60')}>
        <Topbar onMobileMenuClick={() => setMobileNavOpen(true)} />
        <main className="p-4 sm:p-6">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
    </div>
  );
}
