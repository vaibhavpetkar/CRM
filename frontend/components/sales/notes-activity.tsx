'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import Card from '@/components/ui/card';
import { salesApi, NotesActivity, NotesActivityRow } from '@/lib/api';
import { LeadStatusBadge } from '@/components/leads/lead-status';
import { leadStatusLabel } from '@/lib/lead-options';
import { cn } from '@/lib/utils';

// Notes per sales person for the picked range: how many notes, on how
// many leads, what they said, and (opened) every note with its lead.

const shortDay = (day?: string | null) => {
  const [y, m, d] = String(day || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
};

export default function NotesActivityCard({ from, to, userId }: { from: string; to: string; userId?: string }) {
  const [data, setData] = useState<NotesActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, NotesActivityRow[] | 'loading'>>({});

  useEffect(() => {
    let cancelled = false;
    setNotes({});
    setOpenKey(null);
    salesApi
      .getNotesActivity({ from, to, userId })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        // People who only see themselves get their notes straight away.
        if (!res.canSeeTeam && res.people[0] && res.notes) {
          setNotes({ [res.people[0].key]: res.notes });
          setOpenKey(res.people[0].key);
        }
      })
      .catch((err) => !cancelled && setError(err.message || 'Could not load notes.'));
    return () => {
      cancelled = true;
    };
  }, [from, to, userId]);

  const toggle = (key: string) => {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (notes[key]) return;
    setNotes((n) => ({ ...n, [key]: 'loading' }));
    salesApi
      .getNotesActivity({ from, to, userId, person: key })
      .then((res) => setNotes((n) => ({ ...n, [key]: res.notes || [] })))
      .catch(() => setNotes((n) => ({ ...n, [key]: [] })));
  };

  const leadsLink = (p: { userId: number | null; name: string }) => {
    const by = p.userId ? String(p.userId) : `name:${p.name}`;
    return `/leads?noteScope=any&noteBy=${encodeURIComponent(by)}&noteFrom=${from}&noteTo=${to}`;
  };

  return (
    <Card
      title="Notes by sales person"
      className="mb-6"
      action={data ? <span className="text-xs text-slate-500">{data.totals.notes} notes on {data.totals.leads} leads</span> : undefined}
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
      {data && data.people.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No notes in this range.</p>}
      {data && data.people.length > 0 && (
        <div className="-mx-6 -my-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3">Sales person</th>
                <th className="px-3 py-3 text-right">Notes</th>
                <th className="px-3 py-3 text-right">Leads</th>
                <th className="px-3 py-3 text-right">Days</th>
                <th className="px-3 py-3">Last note</th>
                <th className="px-3 py-3">What the notes said</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.people.map((p) => {
                const isOpen = openKey === p.key;
                const list = notes[p.key];
                const statuses = Object.entries(p.statuses).sort((a, b) => b[1] - a[1]);
                return (
                  <Fragment key={p.key}>
                    <tr className="cursor-pointer hover:bg-slate-50/60" onClick={() => toggle(p.key)}>
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-2 font-semibold text-slate-900">
                          <ChevronRightIcon className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-90')} />
                          {p.name}
                          {!p.userId && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">from import</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{p.notes}</td>
                      <td className="px-3 py-3 text-right">
                        <Link href={leadsLink(p)} onClick={(e) => e.stopPropagation()} className="text-[var(--primary)] hover:underline">
                          {p.leads}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">{p.days}</td>
                      <td className="px-3 py-3 text-slate-600">{shortDay(p.lastNoteDate)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {statuses.slice(0, 5).map(([s, n]) => (
                            <span key={s} className="inline-flex items-center gap-1 text-[11px] text-slate-500" title={s === 'other' ? 'No status word' : leadStatusLabel(s)}>
                              {s === 'other' ? <span className="rounded-full bg-slate-100 px-2 py-0.5">Other</span> : <LeadStatusBadge status={s} className="!px-2 !py-0 !text-[10px]" />}
                              {n}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="px-6 py-3">
                          {list === 'loading' || !list ? (
                            <p className="text-xs text-slate-400">Loading notes…</p>
                          ) : list.length === 0 ? (
                            <p className="text-xs text-slate-400">No notes.</p>
                          ) : (
                            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white">
                                  <tr className="border-b border-slate-100 text-left font-semibold text-slate-400">
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Lead</th>
                                    <th className="px-3 py-2">Note</th>
                                    <th className="px-3 py-2">Lead status now</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {list.map((n) => (
                                    <tr key={n.id}>
                                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{shortDay(n.noteDate)}</td>
                                      <td className="px-3 py-2">
                                        <Link href={`/leads/${n.leadId}`} className="font-medium text-slate-800 hover:text-[var(--primary)] hover:underline">
                                          {n.leadName}
                                        </Link>
                                        {n.mobile && <span className="block text-[11px] text-slate-400">{n.mobile}</span>}
                                      </td>
                                      <td className="px-3 py-2 text-slate-700">
                                        {n.text}
                                        {n.salesPersonName && <span className="text-slate-400"> ({n.salesPersonName})</span>}
                                      </td>
                                      <td className="px-3 py-2">{n.leadStatus && <LeadStatusBadge status={n.leadStatus} className="!px-2 !py-0 !text-[10px]" />}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
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
  );
}
