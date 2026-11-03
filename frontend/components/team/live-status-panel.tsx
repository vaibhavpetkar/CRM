'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/ui/card';
import { teamApi, PresenceState, TeamPresence } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatDuration } from '@/components/calls/call-format';
import { cn } from '@/lib/utils';

// Live sales-team status for managers: who is free, on a call (with a running
// timer), wrapping up after a call, or offline. The server nudges us over the
// socket whenever anything changes; a slow poll covers a dropped socket.

const STATES: { key: PresenceState; label: string; dot: string; text: string }[] = [
  { key: 'available', label: 'Available', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  { key: 'on_call', label: 'On call', dot: 'bg-amber-400', text: 'text-amber-700' },
  { key: 'after_call', label: 'After call work', dot: 'bg-blue-500', text: 'text-blue-700' },
  { key: 'offline', label: 'Offline', dot: 'bg-red-500', text: 'text-red-600' },
];
const STATE_BY_KEY = Object.fromEntries(STATES.map((s) => [s.key, s])) as Record<PresenceState, (typeof STATES)[number]>;

const POLL_MS = 15000;

const talkTime = (seconds: number) => {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const timeAgo = (iso: string | null) => {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export default function LiveStatusPanel() {
  const [data, setData] = useState<TeamPresence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PresenceState | 'all'>('all');
  const [now, setNow] = useState(() => Date.now());
  // Server clock minus ours, so timers match the server's call times.
  const [skew, setSkew] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await teamApi.getPresence();
      setSkew(new Date(res.serverTime).getTime() - Date.now());
      setData(res);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load live status.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const socket = getSocket();
    const onChanged = () => load();
    socket?.on('presence:changed', onChanged);
    // A reconnect may have missed nudges.
    socket?.on('connect', onChanged);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
      socket?.off('presence:changed', onChanged);
      socket?.off('connect', onChanged);
    };
  }, [load]);

  // After-call work ends on a timer with no event, so re-read when it runs out.
  useEffect(() => {
    if (!data) return;
    const ends = data.agents
      .filter((a) => a.state === 'after_call' && a.since)
      .map((a) => new Date(a.since as string).getTime() + data.afterCallSeconds * 1000 - (Date.now() + skew));
    if (!ends.length) return;
    const t = setTimeout(load, Math.max(500, Math.min(...ends) + 500));
    return () => clearTimeout(t);
  }, [data, skew, load]);

  const agents = useMemo(() => (data?.agents || []).filter((a) => filter === 'all' || a.state === filter), [data, filter]);
  const elapsed = (since: string | null) => (since ? (now + skew - new Date(since).getTime()) / 1000 : 0);

  return (
    <Card
      className="mb-6"
      title="Live team status"
      action={
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium',
            filter === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          )}
        >
          All {data ? data.agents.length : ''}
        </button>
        {STATES.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              filter === s.key ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', s.dot)} />
            {s.label} {data ? data.counts[s.key] : ''}
          </button>
        ))}
      </div>

      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {!data && !error ? (
        <p className="text-sm text-slate-500">Loading live status...</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody is in this state right now.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const s = STATE_BY_KEY[a.state];
            const href = a.call?.leadId ? `/leads/${a.call.leadId}` : null;
            return (
              <li key={a.userId} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', s.dot)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                    {(a.state === 'on_call' || a.state === 'after_call') && (
                      <span className={cn('shrink-0 font-mono text-sm tabular-nums', s.text)}>{formatDuration(elapsed(a.since))}</span>
                    )}
                  </div>
                  <p className={cn('text-xs font-medium', s.text)}>
                    {s.label}
                    {a.state === 'on_call' && a.call?.status === 'ringing' && ' (ringing)'}
                    {a.state === 'on_call' && a.call?.status === 'queued' && ' (dialling)'}
                  </p>
                  {a.state === 'on_call' && a.call && (
                    <p className="truncate text-xs text-slate-500">
                      with{' '}
                      {href ? (
                        <Link href={href} className="text-[var(--primary)] hover:underline">
                          {a.call.withName}
                        </Link>
                      ) : (
                        a.call.withName
                      )}
                      {a.call.fromNumber && <> · from {a.call.fromNumber}</>}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Today: {a.today.calls} call{a.today.calls === 1 ? '' : 's'}, {talkTime(a.today.talkSeconds)} talk
                    {a.state === 'offline' && a.lastLogin && <> · last login {timeAgo(a.lastLogin)}</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
