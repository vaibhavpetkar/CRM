'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon, PhoneIcon, PhoneArrowDownLeftIcon, PhoneArrowUpRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import DateRangePicker, { DateRange, presetRange } from '@/components/sales/date-range';
import { AgentStatusDot, AgentStatusBadge } from '@/components/sales/agent-status';
import RecordingPlayer from '@/components/calls/recording-player';
import { CALL_STATUS_CLASS, CALL_STATUS_LABEL, formatDuration } from '@/components/calls/call-format';
import { CallLogRow, PresenceState, salesApi, SalesAgentActivity } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

// Call tracking: every call the team made, who made it, to whom, how it
// ended, how long they talked, with notes and the recording. The dot next to
// each sales person is their live status (green online / on call, red offline).

const STATUS_FILTERS = [
  { key: 'all', label: 'All calls' },
  { key: 'connected', label: 'Connected' },
  { key: 'missed', label: 'Missed / not answered' },
  { key: 'live', label: 'Live now' },
];

const DIRECTION_FILTERS = [
  { key: 'all', label: 'Incoming and outgoing' },
  { key: 'inbound', label: 'Incoming' },
  { key: 'outbound', label: 'Outgoing' },
];

const PAGE_SIZE = 50;

export default function CallTrackingPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('today'));
  const [userId, setUserId] = useState('all');
  const [status, setStatus] = useState('all');
  const [direction, setDirection] = useState('all');
  const [number, setNumber] = useState('');
  const [page, setPage] = useState(1);
  const [calls, setCalls] = useState<CallLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [agents, setAgents] = useState<SalesAgentActivity[]>([]);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deep link from Sales Activity: /call-tracking?userId=3&from=...&to=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get('from');
    const to = q.get('to');
    if (from && to) setRange({ from, to });
    if (q.get('userId')) setUserId(q.get('userId')!);
  }, []);

  const loadCalls = useCallback(async () => {
    try {
      const res = await salesApi.getCallLog({ ...range, userId, status, direction: direction === 'all' ? undefined : direction, number: number.replace(/\s/g, '').length >= 10 ? number : undefined, page, limit: PAGE_SIZE });
      setCalls(res.calls);
      setTotal(res.total);
      setPages(res.pages);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load calls.');
    }
  }, [range, userId, status, direction, number, page]);

  const loadAgents = useCallback(async () => {
    try {
      const res = await salesApi.getActivity(range);
      setAgents(res.agents);
      setCanSeeTeam(res.canSeeTeam);
    } catch {
      /* the call list still works without the summary */
    }
  }, [range]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  useEffect(() => {
    loadAgents();
    const socket = getSocket();
    const onChanged = () => {
      loadAgents();
      loadCalls();
    };
    socket?.on('presence:changed', onChanged);
    const poll = setInterval(onChanged, 30000);
    return () => {
      socket?.off('presence:changed', onChanged);
      clearInterval(poll);
    };
  }, [loadAgents, loadCalls]);

  useEffect(() => setPage(1), [range, userId, status, direction, number]);

  const stateByUser = useMemo(() => new Map<number, PresenceState>(agents.map((a) => [a.userId, a.state])), [agents]);
  const selected = agents.find((a) => String(a.userId) === userId);
  const select =
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

  return (
    <>
      <PageHeader
        title="Call Tracking"
        description="Every incoming and outgoing call, with outcome, talk time, notes and recordings"
        actions={<Link href="/sales-activity"><Button size="sm" variant="secondary">Sales activity</Button></Link>}
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {canSeeTeam && (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={select} aria-label="Sales person">
              <option value="all">All sales people</option>
              {agents.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.state === 'offline' ? '🔴' : '🟢'} {a.name}
                </option>
              ))}
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Outcome">
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className={select} aria-label="Direction">
            {DIRECTION_FILTERS.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
          <div className="relative sm:w-56">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Customer number" className={cn(select, 'w-full pl-9')} />
          </div>
          <span className="text-sm text-slate-500 sm:ml-auto">{total} call{total === 1 ? '' : 's'}</span>
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{selected.name}</span>
            <AgentStatusBadge state={selected.state} detail={selected.onCallWith} />
            <span>{selected.calls} calls</span>
            <span>{selected.connected} connected</span>
            <span>{selected.missed} missed</span>
            <span>{Math.round(selected.talkSeconds / 60)} min talk time</span>
            <span>{selected.visitsCompleted} site visits</span>
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        {!calls ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : calls.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <PhoneIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            No calls in this period.
          </div>
        ) : (
          <div className="-mx-6 -my-6 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Sales person</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Number</th>
                  <th className="px-3 py-3">Outcome</th>
                  <th className="px-3 py-3 text-right">Talk time</th>
                  <th className="px-6 py-3">From number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => {
                  const expanded = open === c.id;
                  const hasMore = c.hasRecording || !!c.notes || !!c.error;
                  return (
                    <Fragment key={c.id}>
                      <tr className={cn('hover:bg-slate-50/60', hasMore && 'cursor-pointer')} onClick={() => hasMore && setOpen(expanded ? null : c.id)}>
                        <td className="px-3 py-3 text-slate-400">{hasMore && (expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {new Date(c.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            <AgentStatusDot state={stateByUser.get(c.userId) || 'offline'} />
                            <span className="font-medium text-slate-800">{c.agentName || `User #${c.userId}`}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {c.leadId ? (
                            <Link href={`/leads/${c.leadId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-[var(--primary)] hover:underline">
                              {c.withName || c.leadNumber || `Lead #${c.leadId}`}
                            </Link>
                          ) : (
                            <span className="text-slate-700">{c.withName || '—'}</span>
                          )}
                          {c.requirement && <p className="text-xs text-slate-400">{c.requirement}</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          <span className="flex items-center gap-1.5" title={c.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'}>
                            {c.direction === 'inbound' ? (
                              <PhoneArrowDownLeftIcon className="h-3.5 w-3.5 text-blue-500" aria-label="Incoming" />
                            ) : (
                              <PhoneArrowUpRightIcon className="h-3.5 w-3.5 text-slate-400" aria-label="Outgoing" />
                            )}
                            {c.customerNumber}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', CALL_STATUS_CLASS[c.status])}>
                            {c.isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                            {CALL_STATUS_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-700">{c.durationSeconds ? formatDuration(c.durationSeconds) : '—'}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-slate-500">{c.callerId || '—'}</td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <td />
                          <td colSpan={7} className="space-y-2 px-3 pb-4 pt-1">
                            {c.error && <p className="text-xs text-red-600">{c.error}</p>}
                            {c.notes && <p className="whitespace-pre-line text-sm text-slate-700"><span className="font-semibold">Notes: </span>{c.notes}</p>}
                            {c.hasRecording && <RecordingPlayer callId={c.id} autoLoad={false} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-slate-500">Page {page} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}
