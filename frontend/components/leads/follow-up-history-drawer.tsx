'use client';

import { useEffect, useState } from 'react';
import { CalendarDaysIcon, ChatBubbleBottomCenterTextIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { leadsApi, LeadFollowUpEntry } from '@/lib/api';
import { cn } from '@/lib/utils';

const dayLabel = (value: string | null) => {
  if (!value) return 'No date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No date';
  // Follow-up dates are calendar days stored at midnight UTC, so read them in UTC.
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const stampLabel = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Right-side panel listing every follow-up date on a lead with the remark
 * written for it, newest first. Loads fresh each time it opens.
 */
export default function FollowUpHistoryDrawer({
  leadId,
  leadName,
  open,
  onClose,
}: {
  leadId: string | number;
  leadName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LeadFollowUpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    leadsApi
      .getLeadFollowUps(leadId)
      .then((res) => !cancelled && setEntries(res.followUps || []))
      .catch((err) => !cancelled && setError(err.message || 'Could not load follow-ups'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn('absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
      />
      <aside
        role="dialog"
        aria-label="Follow-up remarks"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--primary)]">
              <ChatBubbleBottomCenterTextIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Follow-up Remarks</h3>
              {leadName && <p className="text-xs text-slate-500">{leadName}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading...</p>}
          {!loading && error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No follow-ups yet. Set a Next Follow-up date with a remark and save.</p>
          )}
          {!loading && !error && entries.length > 0 && (
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">
              {entries.map((entry, i) => (
                <li key={entry.id} className="animate-fadeIn relative" style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
                  <span
                    className={cn(
                      'absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white',
                      i === 0 ? 'bg-[var(--primary)] ring-4 ring-blue-100' : 'bg-slate-300'
                    )}
                  />
                  <div className={cn('rounded-xl border p-4', i === 0 ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <CalendarDaysIcon className="h-4 w-4 text-slate-500" />
                        {dayLabel(entry.followUpDate)}
                      </span>
                      {i === 0 && (
                        <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Latest</span>
                      )}
                    </div>
                    <p className={cn('mt-2 whitespace-pre-wrap text-sm', entry.remark ? 'text-slate-700' : 'italic text-slate-400')}>
                      {entry.remark || 'No remark'}
                    </p>
                    <p className="mt-3 text-[11px] text-slate-400">
                      {entry.createdBy ? `${entry.createdBy} · ` : ''}
                      {stampLabel(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
