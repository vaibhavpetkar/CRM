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
        'fixed left-0 top-0 z-30 flex h-screen flex-col bg-[#1a2332] transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#168eea] text-sm font-bold text-white">
              Z
            </div>
            <span className="text-sm font-semibold text-white">CRM Pro</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-[#168eea] text-sm font-bold text-white">
            Z
          </Link>
        )}
        <button
          onClick={onToggle}
          className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                      title={collapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-[#168eea] text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <ArrowRightOnRectangleIcon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
