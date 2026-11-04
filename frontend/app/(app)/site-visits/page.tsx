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
import DateRangePicker, { DateRange, presetRange } from '@/components/sales/date-range';
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
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [states, setStates] = useState<Map<number, PresenceState>>(new Map());
  const [editing, setEditing] = useState<SiteVisitRow | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await salesApi.listVisits({ ...range, userId, status });
      setVisits(res.visits);
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
    const c = { scheduled: 0, completed: 0, 'revisit-done': 0, cancelled: 0, 'no-show': 0 } as Record<SiteVisitStatus, number>;
    for (const v of visits || []) c[v.status] += 1;
    return c;
  }, [visits]);

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
              fileName={`site-visits-${range.from}-to-${range.to}`}
              columns={EXPORT_COLUMNS}
              disabled={!visits || visits.length === 0}
              getRows={async () => {
                // Same filters as the table, without the 500-row page cap.
                const { visits: all } = await salesApi.listVisits({ ...range, userId, status, limit: 10000 });
                return all.map((v) => ({
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
                }));
              }}
            />}
            {canCreate && <Button size="sm" onClick={() => setEditing('new')}><PlusIcon className="h-4 w-4" /> Log site visit</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <DateRangePicker value={range} onChange={setRange} />
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
                {s !== 'all' && status === 'all' && visits ? ` ${counts[s]}` : ''}
              </button>
            ))}
          </div>
          <LeadStatusColorsButton kind="visit" />
        </div>
      </div>

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
                  <th className="px-6 py-3">When</th>
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
                  <tr key={v.id} className="align-top" style={{ backgroundColor: leadStatusRowColor(`visit:${v.status}`) }}>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-700">
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
