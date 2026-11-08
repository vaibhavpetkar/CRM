'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDaysIcon, ChatBubbleLeftEllipsisIcon, ChevronRightIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { leadsApi, LeadNoteEntry, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { LeadStatusBadge } from '@/components/leads/lead-status';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// Notes on a lead, written like the team always has: "13/09/26 CNR (SAKSHI)".
// The date and the writer's name are added automatically, and when the text
// says a status (CNR, Busy, Switch Off, WhatsApp Done ...) the lead moves to it.

/** "2026-09-13" -> "13/09/26" */
export const shortNoteDay = (day?: string | null) => {
  const [y, m, d] = String(day || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
};

const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "06/11/26 SWITCH OFF (SHABINA)" for a lead row's last-note columns. */
export const lastNoteLine = (lead: { lastNoteDate?: string | null; lastNoteText?: string | null; lastNoteBy?: string | null }) =>
  lead?.lastNoteDate ? `${shortNoteDay(lead.lastNoteDate)} ${lead.lastNoteText || ''}${lead.lastNoteBy ? ` (${lead.lastNoteBy})` : ''}`.trim() : '';

/**
 * The Notes field in RFQ Details. Whatever is typed is saved with the lead
 * (Save) as a new note, stamped with today's date and the writer's name; a
 * status word in it moves the lead to that status. The latest note shows
 * above the box, and the arrow opens every note date-wise.
 */
export function LeadNotesField({
  leadId,
  leadName,
  value,
  onChange,
  currentStatus,
  latest,
}: {
  leadId: string | number;
  leadName?: string;
  value: string;
  onChange: (value: string) => void;
  currentStatus?: string | null;
  latest?: string;
}) {
  const [detected, setDetected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const me = getStoredUser();
  const myName = me?.firstName || me?.name || '';
  const typed = value.trim();
  const hasOwnDates = /\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/.test(typed);

  // What status the note will set, shown while typing.
  useEffect(() => {
    if (!typed) {
      setDetected(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      leadsApi
        .detectNoteStatus(typed)
        .then((r) => !cancelled && setDetected(r.status))
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [typed]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="See all notes date-wise"
          aria-label="See all notes date-wise"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-[var(--primary)] hover:bg-blue-50 hover:text-[var(--primary)]"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
      {latest && (
        <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="text-xs font-medium text-slate-400">Latest: </span>
          {latest}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Write a new note, e.g. CNR, Busy, Switch Off, WhatsApp Done"
        className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        {typed ? (
          <>
            {hasOwnDates ? (
              'Saves each dated part as its own note.'
            ) : (
              <>
                Saves as <b className="font-semibold text-slate-600">{`${shortNoteDay(todayIso())} ${typed}${myName ? ` (${myName})` : ''}`}</b>
              </>
            )}
            {detected && detected !== currentStatus && (
              <>
                · status changes to <LeadStatusBadge status={detected} className="!px-2 !py-0 !text-[10px]" />
              </>
            )}
          </>
        ) : (
          'Date and your name are added on Save. A status word in the note updates the lead status.'
        )}
      </p>
      <LeadNotesDrawer key={version} leadId={leadId} leadName={leadName} open={open} onClose={() => setOpen(false)} onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
}

/** Right-side panel with every note on the lead, grouped by date, newest first. */
export function LeadNotesDrawer({
  leadId,
  leadName,
  open,
  onClose,
  onChanged,
}: {
  leadId: string | number;
  leadName?: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<LeadNoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const me = getStoredUser();
  const canRemoveAny = hasPermission(me, 'sales:team') || hasPermission(me, 'leads:delete');
  const loadedFor = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const seq = ++loadedFor.current;
    setLoading(true);
    setError(null);
    leadsApi
      .getLeadNotes(leadId)
      .then((res) => !cancelled && seq === loadedFor.current && setNotes(res.notes || []))
      .catch((err) => !cancelled && setError(err.message || 'Could not load notes'))
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

  const byDay = useMemo(() => {
    const groups: { day: string; notes: LeadNoteEntry[] }[] = [];
    for (const n of notes) {
      const last = groups[groups.length - 1];
      if (last && last.day === n.noteDate) last.notes.push(n);
      else groups.push({ day: n.noteDate, notes: [n] });
    }
    return groups;
  }, [notes]);

  const remove = async (n: LeadNoteEntry) => {
    if (!confirm(`Remove the note "${n.line}"?`)) return;
    try {
      await leadsApi.deleteLeadNote(leadId, n.id);
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not remove the note.');
    }
  };

  return (
    <div className={cn('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn('absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
      />
      <aside
        role="dialog"
        aria-label="Notes"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--primary)]">
              <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Notes</h3>
              <p className="text-xs text-slate-500">
                {leadName ? `${leadName} · ` : ''}
                {notes.length} note{notes.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading...</p>}
          {!loading && error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && notes.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No notes yet. Write one in RFQ Details, Notes, and save.</p>}
          {!loading && !error && byDay.length > 0 && (
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">
              {byDay.map((group, i) => {
                const isOpen = expanded[group.day] ?? i < 5;
                return (
                  <li key={group.day} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white',
                        i === 0 ? 'bg-[var(--primary)] ring-4 ring-blue-100' : 'bg-slate-300'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [group.day]: !isOpen }))}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <CalendarDaysIcon className="h-4 w-4 text-slate-500" />
                        {longDay(group.day)}
                        <span className="text-xs font-medium text-slate-400">· {group.notes.length}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {i === 0 && <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Latest</span>}
                        <ChevronRightIcon className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-90')} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mt-2 space-y-2">
                        {group.notes.map((n, j) => (
                          <div key={n.id} className={cn('rounded-xl border p-3', i === 0 && j === 0 ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white')}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-slate-800">
                                <span className="font-mono text-xs text-slate-500">{shortNoteDay(n.noteDate)}</span> <b className="font-semibold">{n.text}</b>
                                {n.salesPersonName && <span className="text-slate-500"> ({n.salesPersonName})</span>}
                              </p>
                              {(canRemoveAny || n.createdById === me?.id) && (
                                <button type="button" onClick={() => remove(n)} aria-label="Remove note" className="shrink-0 text-slate-300 hover:text-red-500">
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              {n.status && <LeadStatusBadge status={n.status} className="!px-2 !py-0 !text-[10px]" />}
                              {n.source === 'import' ? <span>Imported</span> : <span>{new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
