'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneArrowDownLeftIcon, PhoneArrowUpRightIcon } from '@heroicons/react/24/outline';
import Card from '@/components/ui/card';
import { callsApi, LiveCalls } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { CALL_STATUS_CLASS, CALL_STATUS_LABEL, formatDuration } from './call-format';

const POLL_MS = 4000;

/**
 * Calls happening right now (dialling, ringing or connected), incoming and
 * outgoing, with how long each has been going and a Cancel button for calls
 * that are stuck. Managers see the whole team, others their own calls.
 */
export default function LiveCallQueue({ className }: { className?: string }) {
  const toast = useToast();
  const [data, setData] = useState<LiveCalls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState<number | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await callsApi.live());
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load live calls.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const socket = getSocket();
    socket?.on('presence:changed', load);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
      socket?.off('presence:changed', load);
    };
  }, [load]);

  const cancel = async (id: number) => {
    if (!confirm('Cancel this call? Use this when the call is stuck or nobody is on the line.')) return;
    setCancelling(id);
    try {
      await callsApi.cancel(id);
      toast.success('Call cancelled.');
      load();
    } catch (err) {
      toast.error((err as Error).message || 'Could not cancel the call.');
    } finally {
      setCancelling(null);
    }
  };

  const c = data?.counts;
  const pills = c
    ? [
        { label: 'Live now', value: c.total, cls: 'border-slate-200 text-slate-700' },
        { label: 'Waiting to connect', value: c.waiting + c.ringing, cls: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Connected', value: c.connected, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
        { label: 'Incoming', value: c.incoming, cls: 'border-violet-200 bg-violet-50 text-violet-700' },
        { label: 'Outgoing', value: c.outgoing, cls: 'border-blue-200 bg-blue-50 text-blue-700' },
      ]
    : [];

  return (
    <Card
      className={className}
      title="Live call queue"
      action={
        data ? (
          <span className="text-xs text-slate-400">Calls with no answer end by themselves after {Math.round(data.ringTimeoutSeconds / 60)} min</span>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {pills.map((p) => (
          <span key={p.label} className={cn('rounded-full border px-3 py-1 text-xs font-medium', p.cls)}>
            {p.label} <span className="font-semibold">{p.value}</span>
          </span>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {!data && !error ? (
        <p className="text-sm text-slate-500">Loading live calls...</p>
      ) : data && data.calls.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No calls in progress right now.</p>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Sales person</th>
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.calls.map((call) => {
                const inbound = call.direction === 'inbound';
                const from = call.status === 'in-progress' && call.startedAt ? call.startedAt : call.createdAt;
                return (
                  <tr key={call.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{call.calledBy || '—'}</td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        {inbound ? (
                          <PhoneArrowDownLeftIcon className="h-4 w-4 text-violet-600" aria-label="Incoming" />
                        ) : (
                          <PhoneArrowUpRightIcon className="h-4 w-4 text-blue-600" aria-label="Outgoing" />
                        )}
                        {call.leadId ? (
                          <Link href={`/leads/${call.leadId}`} className="text-[var(--primary)] hover:underline">
                            {call.leadName || call.customerNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{call.leadName || call.customerNumber}</span>
                        )}
                      </span>
                      <span className="block pl-[22px] text-[11px] text-slate-400">{call.customerNumber}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', CALL_STATUS_CLASS[call.status])}>
                        {inbound && call.status !== 'in-progress' ? 'Incoming, ringing' : CALL_STATUS_LABEL[call.status]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-slate-600">{formatDuration((now - new Date(from).getTime()) / 1000)}</td>
                    <td className="py-2.5 text-right">
                      {call.canCancel && (
                        <button
                          type="button"
                          onClick={() => cancel(call.id)}
                          disabled={cancelling === call.id}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancelling === call.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
