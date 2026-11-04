import type { Notification } from '@/lib/api';

/** "just now", "5m ago", "3h ago", "2d ago" */
export function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Where clicking a notification goes, or null when it points at nothing. */
export function notificationHref(n: Notification): string | null {
  if (!n.entityId) return null;
  switch (n.entityType) {
    case 'Lead':
      return `/leads/${n.entityId}`;
    case 'Deal':
      return '/deals';
    case 'Task':
      return '/tasks';
    case 'Invoice':
      return '/invoices';
    case 'Quote':
      return `/quotes/${n.entityId}`;
    default:
      return null;
  }
}
