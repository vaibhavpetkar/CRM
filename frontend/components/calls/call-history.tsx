'use client';

import { useCallback, useEffect, useState } from 'react';
import { callsApi, type CallRow } from '@/lib/api';
import RecordingPlayer from './recording-player';
import { CALL_STATUS_CLASS, CALL_STATUS_LABEL, formatDuration } from './call-format';
import { useCalls } from './call-context';

/** Every call made to a lead or contact, newest first, with notes and recordings. */
export default function CallHistory({ leadId, contactId, compact = false }: { leadId?: number | string; contactId?: number | string; compact?: boolean }) {
  const { finishedCount } = useCalls();
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    callsApi
      .list({ leadId, contactId })
      .then((rows) => {
        setCalls(rows);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [leadId, contactId]);

  useEffect(() => {
    load();
  }, [load, finishedCount]);

  if (error) return <p className="py-4 text-center text-xs text-red-500">{error}</p>;
  if (!calls) return <p className="py-4 text-center text-xs text-slate-400">Loading...</p>;
  if (calls.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">No calls yet. Use the green phone icon next to a number to call.</p>;
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {calls.map((c) => (
        <div key={c.id} className="rounded-md border border-slate-100 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CALL_STATUS_CLASS[c.status]}`}>{CALL_STATUS_LABEL[c.status]}</span>
            <span className="text-xs text-slate-600">{c.customerNumber}</span>
            {c.status === 'completed' && <span className="font-mono text-xs text-slate-500">{formatDuration(c.durationSeconds)}</span>}
            <span className="ml-auto text-xs text-slate-400">
              {new Date(c.createdAt).toLocaleString()}
              {c.calledBy ? ` · ${c.calledBy}` : ''}
            </span>
          </div>
          {c.notes ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{c.notes}</p>
          ) : (
            !compact && <p className="mt-2 text-xs italic text-slate-400">No notes</p>
          )}
          {c.error && <p className="mt-1 text-xs text-red-500">{c.error}</p>}
          {c.hasRecording && (
            <div className="mt-2">
              <RecordingPlayer callId={c.id} autoLoad={false} />
            </div>
          )}
          {c.recordingPending && <p className="mt-2 text-xs text-slate-400">Recording is being saved...</p>}
        </div>
      ))}
    </div>
  );
}
