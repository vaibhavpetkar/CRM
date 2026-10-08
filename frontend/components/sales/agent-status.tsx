import { PhoneIcon } from '@heroicons/react/24/solid';
import type { PresenceState } from '@/lib/api';
import { cn } from '@/lib/utils';

// The green / red signal next to a sales person: green when they are on the
// system (free, on a call, or wrapping up a call), red when offline. On a
// call the green dot pulses and says so.

export const STATE_LABEL: Record<PresenceState, string> = {
  on_call: 'On call',
  after_call: 'After call work',
  available: 'Online',
  offline: 'Offline',
};

export const isOnline = (state?: PresenceState | null) => !!state && state !== 'offline';

export function AgentStatusDot({ state, className }: { state?: PresenceState | null; className?: string }) {
  const online = isOnline(state);
  const label = STATE_LABEL[state || 'offline'];
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)} title={label} aria-label={label}>
      {state === 'on_call' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white', online ? 'bg-emerald-500' : 'bg-red-500')} />
    </span>
  );
}

/** Dot plus a short label, e.g. "On call · Priya Jadhav". */
export function AgentStatusBadge({ state, detail }: { state?: PresenceState | null; detail?: string | null }) {
  const online = isOnline(state);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      )}
    >
      {state === 'on_call' ? <PhoneIcon className="h-3 w-3" /> : <AgentStatusDot state={state} className="h-2 w-2" />}
      <span className="truncate">
        {STATE_LABEL[state || 'offline']}
        {detail ? ` · ${detail}` : ''}
      </span>
    </span>
  );
}
