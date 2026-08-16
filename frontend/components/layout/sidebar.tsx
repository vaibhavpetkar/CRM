'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { navigation } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { authApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const isMobile = useIsMobile();
  // On mobile the drawer always shows full labels — icon-only mode is a
  // desktop-only space-saving affordance and doesn't apply to an off-canvas
  // drawer that's only visible when explicitly opened.
  const effectiveCollapsed = collapsed && !isMobile;

  useEffect(() => {
    setCurrentUser(getStoredUser());
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split('?');
    if (hrefPath === '/dashboard') return pathname === '/dashboard';

    const pathMatches = pathname === hrefPath || pathname.startsWith(hrefPath + '/');
    if (!pathMatches) return false;
    if (!hrefQuery) return true;

    // Query-specific items (e.g. "My Profile" -> /settings?tab=profile) only
    // light up when that tab is actually selected. The settings page itself
    // defaults to the "profile" tab when no ?tab= is present. Read the query
    // straight off window (like the developer-tab check elsewhere in this
    // app) instead of useSearchParams, which would force every page using
    // this shared sidebar into a Suspense boundary just for this highlight.
    const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
    const currentParams = new URLSearchParams(currentSearch);
    const hrefParams = new URLSearchParams(hrefQuery);
    return Array.from(hrefParams.entries()).every(
      ([key, value]) => (currentParams.get(key) ?? (key === 'tab' ? 'profile' : null)) === value
    );
  };

  const visibleSections = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(currentUser, item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const handleSignOut = () => {
    authApi.logout();
    router.replace('/login');
  };

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap-outside. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} aria-hidden="true" />
      )}

      <aside
        className={cn(
          // Mobile: fixed-width off-canvas drawer that slides in/out based on
          // mobileOpen, always full labels (no icon-only mode). Desktop
          // (md:) reverts to the original always-visible, collapse-toggle
          // layout — translate-x-0 always wins, width/bg follow `collapsed`.
          'no-print fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0 md:transition-all',
          effectiveCollapsed ? 'md:w-[68px] md:bg-[var(--sidebar-collapsed-bg)]' : 'md:w-60 md:bg-white'
        )}
      >
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
        {!effectiveCollapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--primary)] text-sm font-bold text-white shadow-sm">
              Z
            </div>
            <span className="text-sm font-bold text-slate-800 tracking-tight">CRM Pro</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-[var(--primary)] text-sm font-bold text-white shadow-sm">
            Z
          </Link>
        )}
        {/* Collapse toggle — desktop only, icon-only mode doesn't apply to the mobile drawer. */}
        <button
          onClick={onToggle}
          className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors md:block"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
        {/* Close button — mobile only. */}
        <button
          onClick={onMobileClose}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors md:hidden"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-6 last:mb-0">
            {!effectiveCollapsed && (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={effectiveCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                        active
                          ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      {active && (
                        <div className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--sidebar-active-text)]" />
                      )}
                      <item.icon className={cn("h-5 w-5 shrink-0", active ? "stroke-2" : "stroke-1.5")} />
                      {!effectiveCollapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0 stroke-1.5" />
          {!effectiveCollapsed && <span>Sign Out</span>}
        </button>
      </div>
      </aside>
    </>
  );
}
