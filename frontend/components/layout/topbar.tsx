'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BellIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronDownIcon,
  UserPlusIcon,
  BriefcaseIcon,
  UsersIcon,
  CheckCircleIcon,
  CalendarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  getStoredUser,
  authApi,
  searchApi,
  notificationsApi,
  GlobalSearchResult,
  Notification,
} from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/toast';

const QUICK_CREATE_OPTIONS = [
  { label: 'New Lead', href: '/leads?quickCreate=1', icon: UserPlusIcon },
  { label: 'New Deal', href: '/deals?quickCreate=1', icon: BriefcaseIcon },
  { label: 'New Contact', href: '/contacts?quickCreate=1', icon: UsersIcon },
  { label: 'New Task', href: '/tasks?quickCreate=1', icon: CheckCircleIcon },
  { label: 'New Meeting', href: '/meetings?quickCreate=1', icon: CalendarIcon },
];

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Topbar() {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<{ firstName?: string; lastName?: string; email?: string } | null>(null);

  // ─── Search ───────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const seq = ++searchSeq.current;
    const q = query.trim();
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchApi.globalSearch(q);
        // Only apply the results if this is still the latest query — otherwise
        // a slow response for an older term can clobber newer results.
        if (seq !== searchSeq.current) return;
        setSearchResults(res.results);
      } catch (err) {
        console.error('Global search failed', err);
        if (seq !== searchSeq.current) return;
        setSearchResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  const handleSelectResult = (result: GlobalSearchResult) => {
    setSearchOpen(false);
    setQuery('');
    setSearchResults([]);
    router.push(result.url);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  // ─── Quick Create ─────────────────────────────────────────────────────────
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const handleQuickCreate = (href: string) => {
    setQuickCreateOpen(false);
    router.push(href);
  };

  // ─── Notifications ────────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.getNotifications({ limit: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30s as a fallback in case the socket
    // connection drops — the socket below is what makes the bell feel instant.
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // ─── Real-time push via Socket.IO (backed by Redis on the server) ──────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (incoming: Notification) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev;
        return [incoming, ...prev].slice(0, 20);
      });
      setUnreadCount((prev) => prev + 1);

      // Animate the bell for a moment so an assignment feels immediate, then
      // settle back down.
      setBellAnimating(true);
      setTimeout(() => setBellAnimating(false), 1000);

      toast.info(incoming.message, { title: incoming.title });
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('connect_error', (err) => console.error('Notification socket error', err.message));

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => disconnectSocket();
  }, []);

  const handleOpenNotifications = () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen) loadNotifications();
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        await notificationsApi.markAsRead(notif.id);
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark notification read', err);
      }
    }
    setNotifOpen(false);
    if (notif.entityType === 'Lead' && notif.entityId) {
      router.push(`/leads/${notif.entityId}`);
    } else if (notif.entityType === 'Deal' && notif.entityId) {
      router.push('/deals');
    } else if (notif.entityType === 'Task' && notif.entityId) {
      router.push('/tasks');
    }
  };

  const handleMarkAllRead = async () => {
    setNotifLoading(true);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read', err);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
  }, []);

  const handleSignOut = () => {
    authApi.logout();
    router.push('/login');
  };

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'John Doe';
  const initials = user?.firstName
    ? `${user.firstName.charAt(0)}${(user.lastName || '').charAt(0)}`.toUpperCase()
    : 'JD';

  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/60 bg-white px-6">
      <div className="relative max-w-md flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search leads, deals, contacts..."
          className="w-full rounded-md border-0 bg-slate-100/50 py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
            aria-label="Clear search"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}

        {searchOpen && query.trim().length >= 2 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSearchOpen(false)} />
            <div className="absolute left-0 right-0 z-20 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {searching && (
                <p className="px-4 py-3 text-sm text-slate-400">Searching...</p>
              )}
              {!searching && searchResults.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-400">No results for &quot;{query}&quot;</p>
              )}
              {!searching && searchResults.length > 0 && (
                <ul>
                  {searchResults.map((r) => (
                    <li key={`${r.type}-${r.id}`}>
                      <button
                         onClick={() => handleSelectResult(r)}
                         className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                       >
                         <span className="flex items-center gap-2">
                           <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                             {r.type}
                           </span>
                           <span className="font-medium text-slate-900">{r.title}</span>
                         </span>
                         {r.subtitle && <span className="text-xs text-slate-500">{r.subtitle}</span>}
                       </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setQuickCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors shadow-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Create</span>
          </button>

          {quickCreateOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setQuickCreateOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {QUICK_CREATE_OPTIONS.map(({ label, href, icon: Icon }) => (
                  <button
                    key={href}
                    onClick={() => handleQuickCreate(href)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Icon className="h-4 w-4 text-slate-400" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200/60 hidden sm:block"></div>

        <Link
          href="/calendar"
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Calendar"
          title="Calendar"
        >
          <CalendarIcon className="h-[18px] w-[18px]" />
        </Link>

        <div className="relative">
          <button
            onClick={handleOpenNotifications}
            className={`relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors ${
              bellAnimating ? 'animate-bounce text-[var(--primary)]' : ''
            }`}
            aria-label="Notifications"
          >
            <BellIcon className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center">
                {bellAnimating && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                )}
                <span className="relative flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={notifLoading}
                      className="text-xs font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">You&apos;re all caught up</p>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full flex-col items-start gap-1 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                        !n.isRead ? 'bg-[var(--sidebar-active-bg)]/30' : ''
                      }`}
                    >
                      <span className="flex w-full items-center gap-1.5">
                        {!n.isRead && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--primary)]" />}
                        <span className="text-sm font-medium text-slate-900">{n.title}</span>
                      </span>
                      <span className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.message}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{timeAgo(n.createdAt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative ml-1">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 rounded-full p-1 hover:bg-slate-50 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-[var(--primary)]">
              {initials}
            </div>
            <div className="hidden text-left md:block pr-1">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
            </div>
            <ChevronDownIcon className="hidden h-[14px] w-[14px] text-slate-400 md:block mr-1" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <Link href="/settings" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  My Profile
                </Link>
                <Link href="/settings" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  Settings
                </Link>
                <div className="my-1 h-px bg-slate-100" />
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
