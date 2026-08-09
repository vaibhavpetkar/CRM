'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { navigation } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { authApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getStoredUser>>(null);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
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
    <aside
      className={cn(
        // When collapsed to icon-only mode, swap the plain white background for a
        // light blue tint (--sidebar-collapsed-bg) so the compact state reads as a
        // distinct visual mode rather than an accident of missing labels.
        'no-print fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-200 transition-all duration-200',
        collapsed ? 'w-[68px] bg-[var(--sidebar-collapsed-bg)]' : 'w-60 bg-white'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
        {!collapsed ? (
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
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-6 last:mb-0">
            {!collapsed && (
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
                      title={collapsed ? item.name : undefined}
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
                      {!collapsed && <span>{item.name}</span>}
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
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
