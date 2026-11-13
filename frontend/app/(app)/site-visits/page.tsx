'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPinIcon, PlusIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import ExportMenu from '@/components/ui/export-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/toast';
import DateRangePicker, { DateRange, isAllTime, presetRange } from '@/components/sales/date-range';
import { AgentStatusDot } from '@/components/sales/agent-status';
import SiteVisitModal, { VISIT_STATUS_LABEL } from '@/components/sales/site-visit-modal';
import { getStoredUser, PresenceState, salesApi, SiteVisitRow, SiteVisitStatus, usersApi } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { LeadStatusColorsButton, useLeadStatusColors } from '@/components/leads/lead-status-colors';
import { leadStatusColor, leadStatusRowColor } from '@/lib/lead-options';

// Site visits across the team: what's scheduled, what happened, feedback.

const EXPORT_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'leadNumber', label: 'Lead No.' },
  { key: 'leadName', label: 'Lead name' },
  { key: 'leadMobile', label: 'Mobile' },
  { key: 'projectName', label: 'Project' },
  { key: 'location', label: 'Location' },
  { key: 'agentName', label: 'Sales person' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Feedback' },
  { key: 'completedAt', label: 'Marked done at' },
  { key: 'createdAt', label: 'Logged at' },
];

const stamp = (v: string | null) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function SiteVisitsPage() {
  const toast = useToast();
  // Re-render when the visit status colours load or change.
  useLeadStatusColors();
  const user = getStoredUser();
  const canCreate = hasPermission(user, 'site_visits:create');
  const canEdit = hasPermission(user, 'site_visits:update');
  const canDelete = hasPermission(user, 'site_visits:delete');
  const canExport = hasPermission(user, 'site_visits:export');
  const canPickAgent = hasPermission(user, 'sales:team');
  const [range, setRange] = useState<DateRange>(() => presetRange('7d'));
  const [userId, setUserId] = useState('all');
  const [status, setStatus] = useState<'all' | SiteVisitStatus>('all');
  const [visits, setVisits] = useState<SiteVisitRow[] | null>(null);
  // Every visit in the period (all statuses) and per status, from the server.
  const [totals, setTotals] = useState<{ total: number; matching: number; counts: Record<SiteVisitStatus, number> } | null>(null);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [states, setStates] = useState<Map<number, PresenceState>>(new Map());
  const [editing, setEditing] = useState<SiteVisitRow | 'new' | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await salesApi.listVisits({ ...range, allTime: isAllTime(range) ? 1 : undefined, userId, status });
      setVisits(res.visits);
      setTotals(res.counts ? { total: res.total ?? res.visits.length, matching: res.matching ?? res.visits.length, counts: res.counts } : null);
      // Keep only selections that are still on the page.
      setSelected((prev) => new Set(res.visits.filter((v) => prev.has(v.id)).map((v) => v.id)));
    } catch (err: any) {
      toast.error(err.message || 'Could not load site visits.');
      setVisits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, userId, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (canPickAgent) usersApi.getAssignableUsers().then((r) => setAgents(r.users.map((u) => ({ id: u.id, name: u.name })))).catch(() => {});
    salesApi
      .getActivity()
      .then((res) => setStates(new Map(res.agents.map((a) => [a.userId, a.state]))))
      .catch(() => {});
  }, [canPickAgent]);

  const counts = useMemo(() => {
    if (totals) return totals.counts;
    const c = { scheduled: 0, completed: 0, 'revisit-done': 0, cancelled: 0, 'no-show': 0 } as Record<SiteVisitStatus, number>;
    for (const v of visits || []) c[v.status] += 1;
    return c;
  }, [visits, totals]);
  const totalVisits = totals ? totals.total : (visits || []).length;
  const shownTotal = totals ? totals.matching : (visits || []).length;

  const update = async (v: SiteVisitRow, next: SiteVisitStatus) => {
    try {
      await salesApi.updateVisit(v.id, { status: next });
      load();
    } catch (err: any) {
      toast.error(err.message || 'Could not update the visit.');
    }
  };

  const remove = async (v: SiteVisitRow) => {
    if (!confirm('Delete this site visit?')) return;
    try {
      await salesApi.deleteVisit(v.id);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete the visit.');
    }
  };

  const allSelected = !!visits && visits.length > 0 && visits.every((v) => selected.has(v.id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((visits || []).map((v) => v.id)));

  const bulk = async (action: SiteVisitStatus | 'delete') => {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} site visit${ids.length === 1 ? '' : 's'}?`)) return;
    setBulkBusy(true);
    let failed = 0;
    for (const id of ids) {
      try {
        if (action === 'delete') await salesApi.deleteVisit(id);
        else await salesApi.updateVisit(id, { status: action });
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    if (failed) toast.error(`${failed} of ${ids.length} could not be updated.`);
    else toast.success(`${ids.length} site visit${ids.length === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : 'updated'}.`);
    if (action === 'delete') setSelected(new Set());
    load();
  };

  const toExportRow = (v: SiteVisitRow) => ({
    date: new Date(v.scheduledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: new Date(v.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
    leadNumber: v.leadNumber || '',
    leadName: v.leadName || '',
    leadMobile: v.leadMobile || '',
    projectName: v.projectName || '',
    location: v.location || '',
    agentName: v.agentName || '',
    status: VISIT_STATUS_LABEL[v.status] || v.status,
    notes: v.notes || '',
    completedAt: stamp(v.completedAt),
    createdAt: stamp(v.createdAt),
  });

  const select =
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

  return (
    <>
      <PageHeader
        title="Site Visits"
        description="Property visits scheduled and done by each sales person"
        actions={
          <>
            <Link href="/sales-activity"><Button size="sm" variant="secondary">Sales activity</Button></Link>
            {canExport && <ExportMenu
              fileName={isAllTime(range) ? 'site-visits-all' : `site-visits-${range.from}-to-${range.to}`}
              columns={EXPORT_COLUMNS}
              disabled={!visits || visits.length === 0}
              label={selected.size ? `Export ${selected.size} selected` : 'Export'}
              getRows={async () => {
                // Ticked rows only, or everything matching the filters (without the 500-row page cap).
                if (selected.size) return (visits || []).filter((v) => selected.has(v.id)).map(toExportRow);
                const { visits: all } = await salesApi.listVisits({ ...range, allTime: isAllTime(range) ? 1 : undefined, userId, status, limit: 10000 });
                return all.map(toExportRow);
              }}
            />}
            {canCreate && <Button size="sm" onClick={() => setEditing('new')}><PlusIcon className="h-4 w-4" /> Log site visit</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <DateRangePicker value={range} onChange={setRange} allowAll />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {canPickAgent && (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={select} aria-label="Sales person">
              <option value="all">All sales people</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap gap-1">
            {(['all', 'scheduled', 'completed', 'revisit-done', 'cancelled', 'no-show'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  status === s ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                {s !== 'all' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: leadStatusColor(`visit:${s}`) }} />}
                {s === 'all' ? 'All' : VISIT_STATUS_LABEL[s]}
                {visits ? ` ${(s === 'all' ? totalVisits : counts[s]).toLocaleString('en-IN')}` : ''}
              </button>
            ))}
          </div>
          <LeadStatusColorsButton kind="visit" />
          {visits && (
            <span className="text-sm text-slate-600 sm:ml-auto">
              Total entries: <strong className="text-slate-900">{shownTotal.toLocaleString('en-IN')}</strong>
              {status !== 'all' && <span className="text-slate-400"> of {totalVisits.toLocaleString('en-IN')}</span>}
              {visits.length < shownTotal && <span className="text-slate-400"> (latest {visits.length.toLocaleString('en-IN')} shown, export for all)</span>}
            </span>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--primary)]/30 bg-blue-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-slate-800">{selected.size} selected</span>
          {canEdit && (
            <>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('completed')}>Visit done</Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('revisit-done')}>Revisit done</Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('no-show')}>No show</Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('cancelled')}>Cancelled</Button>
            </>
          )}
          {canDelete && <Button size="sm" variant="ghost" className="text-red-600" disabled={bulkBusy} onClick={() => bulk('delete')}>Delete</Button>}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800">Clear selection</button>
        </div>
      )}

      <Card>
        {!visits ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : visits.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <MapPinIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            No site visits in this period.
          </div>
        ) : (
          <div className="-mx-6 -my-6 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="w-10 pl-6 pr-1 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visits" className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]" />
                  </th>
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Lead</th>
                  <th className="px-3 py-3">Project / location</th>
                  <th className="px-3 py-3">Sales person</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Feedback</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visits.map((v) => (
                  <tr key={v.id} className={cn('align-top', selected.has(v.id) && 'outline outline-2 -outline-offset-2 outline-[var(--primary)]/40')} style={{ backgroundColor: leadStatusRowColor(`visit:${v.status}`) }}>
                    <td className="w-10 pl-6 pr-1 py-3">
                      <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Select visit ${v.leadName || v.id}`} className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {new Date(v.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-3">
                      {v.leadId ? (
                        <Link href={`/leads/${v.leadId}`} className="font-medium text-slate-800 hover:text-[var(--primary)] hover:underline">{v.leadName || v.leadNumber}</Link>
                      ) : '—'}
                      {v.leadMobile && <p className="text-xs text-slate-400">{v.leadMobile}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{[v.projectName, v.location].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <AgentStatusDot state={states.get(v.userId) || 'offline'} />
                        {v.agentName || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="lead-status-badge whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ '--tone': leadStatusColor(`visit:${v.status}`) } as React.CSSProperties}
                      >
                        {VISIT_STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="max-w-xs px-3 py-3 text-slate-600"><p className="line-clamp-2">{v.notes || '—'}</p></td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      {(canEdit || canDelete) && (
                        <div className="flex justify-end gap-1">
                          {canEdit && v.status === 'scheduled' && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => update(v, 'completed')}>Visit done</Button>
                              <Button size="sm" variant="secondary" onClick={() => update(v, 'revisit-done')}>Revisit done</Button>
                              <Button size="sm" variant="ghost" onClick={() => update(v, 'no-show')}>No show</Button>
                            </>
                          )}
                          {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button>}
                          {canDelete && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(v)}>Delete</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <SiteVisitModal
          visit={editing === 'new' ? null : editing}
          agents={agents}
          canPickAgent={canPickAgent}
          currentUserId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
