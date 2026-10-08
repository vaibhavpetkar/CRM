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
          // (md:) reverts to the always-visible, collapse-toggle layout.
          'no-print fixed left-0 top-0 z-40 flex h-screen w-64 select-none flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] text-slate-300 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0 md:transition-all',
          effectiveCollapsed ? 'md:w-[72px]' : 'md:w-64'
        )}
      >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] px-4">
        {!effectiveCollapsed ? (
          <Link href="/dashboard" className="flex flex-col" aria-label="Inveon One CRM — Dashboard">
            <span className="flex items-center gap-1">
              <span className="text-xl font-extrabold tracking-wider text-white">INVEON</span>
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="flex items-center justify-between">
              <span className="text-lg font-extrabold leading-none tracking-widest text-[#0066ff]">ONE</span>
              <span className="pl-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">CRM</span>
            </span>
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-[#0066ff] text-sm font-extrabold text-white shadow-sm"
            aria-label="Inveon One CRM — Dashboard"
          >
            I<span className="text-amber-400">.</span>
          </Link>
        )}
        {/* Collapse toggle — desktop only, icon-only mode doesn't apply to the mobile drawer. */}
        <button
          onClick={onToggle}
          className={cn(
            'hidden rounded-lg p-1.5 text-[#94a3b8] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-white md:block',
            effectiveCollapsed && 'md:absolute md:-right-3 md:top-5 md:rounded-full md:border md:border-[var(--sidebar-border)] md:bg-[var(--sidebar-bg)] md:p-1'
          )}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
        {/* Close button — mobile only. */}
        <button
          onClick={onMobileClose}
          className="rounded-lg p-1.5 text-[#94a3b8] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {visibleSections.map((section) => (
          <div key={section.title}>
            {!effectiveCollapsed && (
              <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--sidebar-section)]">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={effectiveCollapsed ? item.name : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                        effectiveCollapsed && 'justify-center px-0',
                        active
                          ? 'bg-[#0066ff] font-semibold text-white shadow-sm'
                          : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-[var(--sidebar-text)]')} />
                      {!effectiveCollapsed && <span className="truncate">{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--sidebar-border)] bg-[var(--sidebar-footer-bg)] p-3">
        <button
          onClick={handleSignOut}
          title={effectiveCollapsed ? 'Sign Out' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--sidebar-text)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-white',
            effectiveCollapsed && 'justify-center px-0'
          )}
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4 shrink-0" />
          {!effectiveCollapsed && <span>Sign Out</span>}
        </button>
        {!effectiveCollapsed && (
          <p className="mt-2 text-center text-[11px] text-[var(--sidebar-section)]">Inveon One CRM • Active</p>
        )}
      </div>
      </aside>
    </>
  );
}
