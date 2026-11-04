'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { notificationsApi, Notification } from '@/lib/api';
import { notificationHref, timeAgo } from '@/lib/notifications';

// Full-page list of the signed-in user's notifications, opened from
// "View all notifications" under the bell.

const PAGE_SIZE = 50;

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.getNotifications({ unreadOnly: tab === 'unread', limit: PAGE_SIZE, page: 1 });
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
      setTotal(res.total);
      setPage(1);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      toast.error(err.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await notificationsApi.getNotifications({ unreadOnly: tab === 'unread', limit: PAGE_SIZE, page: next });
      setItems((prev) => [...prev, ...res.notifications.filter((n) => !prev.some((p) => p.id === n.id))]);
      setPage(next);
      setTotalPages(res.totalPages || next);
    } catch (err: any) {
      toast.error(err.message || 'Could not load more notifications.');
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (n: Notification) => {
    if (n.isRead) return;
    await notificationsApi.markAsRead(n.id);
    setItems((prev) => (tab === 'unread' ? prev.filter((x) => x.id !== n.id) : prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))));
    setUnreadCount((c) => Math.max(0, c - 1));
    if (tab === 'unread') setTotal((t) => Math.max(0, t - 1));
  };

  const open = async (n: Notification) => {
    try {
      await markRead(n);
    } catch {
      /* still open it */
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await notificationsApi.markAllAsRead();
      setUnreadCount(0);
      if (tab === 'unread') {
        setItems([]);
        setTotal(0);
      } else {
        setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not mark them read.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: Notification) => {
    try {
      await notificationsApi.deleteNotification(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      setTotal((t) => Math.max(0, t - 1));
      if (!n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      toast.error(err.message || 'Could not delete it.');
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unreadCount ? `${unreadCount} unread` : 'You are all caught up'}
        actions={
          <Button size="sm" variant="secondary" onClick={markAll} disabled={busy || unreadCount === 0}>
            <CheckIcon className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === t ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'all' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading notifications...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
            <BellIcon className="h-8 w-8" />
            <p className="text-sm">{tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
          </div>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 py-3 ${!n.isRead ? 'rounded-lg bg-[var(--sidebar-active-bg)]/30 px-3 -mx-3' : ''}`}>
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-[var(--primary)]'}`} />
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400" title={new Date(n.createdAt).toLocaleString('en-IN')}>
                    {timeAgo(n.createdAt)} · {new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </button>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {!n.isRead && (
                    <button onClick={() => markRead(n).catch(() => toast.error('Could not mark it read.'))} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Mark read" title="Mark read">
                      <CheckIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => remove(n)} className="text-slate-400 hover:text-red-600" aria-label="Delete" title="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && page < totalPages && (
          <div className="mt-4 flex justify-center">
            <Button size="sm" variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : `Load more (${items.length} of ${total})`}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
