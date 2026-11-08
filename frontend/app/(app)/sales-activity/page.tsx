'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PhoneIcon, PhoneArrowUpRightIcon, MapPinIcon, ClockIcon, UserPlusIcon, PlusIcon, SignalIcon, UsersIcon, CalendarDaysIcon, ArrowPathIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import ExportMenu from '@/components/ui/export-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import DateRangePicker, { DateRange, presetRange } from '@/components/sales/date-range';
import { AgentStatusBadge, AgentStatusDot } from '@/components/sales/agent-status';
import SiteVisitModal from '@/components/sales/site-visit-modal';
import NotesActivityCard from '@/components/sales/notes-activity';
import { getStoredUser, salesApi, SalesActivity, SalesAgentActivity, usersApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { hasPermission } from '@/lib/permissions';

// Per sales person performance: calls today and in the range, average call
// length, leads worked, follow-ups, status changes and site visits, with
// their live green/red status. Managers see the team; everyone else sees
// themselves.

const POLL_MS = 30000;

const talkTime = (seconds: number) => {
  if (!seconds) return '0m';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const clock = (v: string | null) => (v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

type SortKey = keyof SalesAgentActivity;

// Columns of the performance table, in order. `num` columns sort high to low first.
const COLUMNS: { key: SortKey; label: string; title?: string; render?: (a: SalesAgentActivity) => React.ReactNode; className?: string }[] = [
  { key: 'callsToday', label: 'Calls today', title: 'Calls made today, whatever range is picked', render: (a) => <><b className="text-slate-900">{a.callsToday}</b>{a.connectedToday > 0 && <span className="block text-[11px] text-emerald-700">{a.connectedToday} connected</span>}</> },
  { key: 'leadsWorkedToday', label: 'Leads today', title: 'Different leads worked on today (called, updated, follow-up or remark)' },
  { key: 'calls', label: 'Calls', render: (a) => <><b className="text-slate-900">{a.calls}</b>{a.incoming > 0 && <span className="block text-[11px] text-slate-400">{a.incoming} in</span>}</> },
  { key: 'connected', label: 'Connected', render: (a) => <><span className="text-emerald-700">{a.connected}</span><span className="block text-[11px] text-slate-400">{a.connectRate}%</span></> },
  { key: 'missed', label: 'Missed', className: 'text-rose-600' },
  { key: 'avgTalkSeconds', label: 'Avg call', title: 'Average length of a connected call', render: (a) => talkTime(a.avgTalkSeconds) },
  { key: 'talkSeconds', label: 'Talk time', render: (a) => talkTime(a.talkSeconds) },
  { key: 'longestCallSeconds', label: 'Longest', render: (a) => talkTime(a.longestCallSeconds) },
  { key: 'avgCallsPerDay', label: 'Calls / day', title: 'Average calls per day worked' },
  { key: 'leadsWorked', label: 'Leads worked', title: 'Different leads called, updated, followed up or visited', render: (a) => <b className="text-slate-900">{a.leadsWorked}</b> },
  { key: 'leadsCalled', label: 'Leads called', title: 'Different leads called' },
  { key: 'followUpsDone', label: 'Follow-ups', title: 'Follow-ups and remarks written' },
  { key: 'notesWritten', label: 'Notes', title: 'Call notes written (by the date on the note)', render: (a) => <b className="text-slate-900">{a.notesWritten}</b> },
  { key: 'leadsNoted', label: 'Leads noted', title: 'Different leads with a call note' },
  { key: 'followUpsOverdue', label: 'Overdue', title: 'Open assigned leads whose follow-up date has passed', render: (a) => <span className={a.followUpsOverdue ? 'font-semibold text-rose-600' : ''}>{a.followUpsOverdue}</span> },
  { key: 'statusChanges', label: 'Status changes' },
  { key: 'visitsCompleted', label: 'Visits done', render: (a) => <b className="text-slate-900">{a.visitsCompleted}</b> },
  { key: 'visitsScheduled', label: 'Visits booked' },
  { key: 'conversions', label: 'Converted' },
  { key: 'leadsAssigned', label: 'New leads', title: 'New leads assigned in the range' },
  { key: 'activeDays', label: 'Days active' },
  { key: 'firstActivityAt', label: 'First action', render: (a) => <span className="whitespace-nowrap text-xs">{clock(a.firstActivityAt)}</span> },
  { key: 'lastActivityAt', label: 'Last action', render: (a) => <span className="whitespace-nowrap text-xs">{clock(a.lastActivityAt)}</span> },
];

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Sales person' },
  { key: 'state', label: 'Status now' },
  { key: 'callsToday', label: 'Calls today' },
  { key: 'connectedToday', label: 'Connected today' },
  { key: 'leadsWorkedToday', label: 'Leads worked today' },
  { key: 'calls', label: 'Calls' },
  { key: 'incoming', label: 'Incoming' },
  { key: 'connected', label: 'Connected' },
  { key: 'connectRate', label: 'Connect rate %' },
  { key: 'missed', label: 'Missed' },
  { key: 'avgCall', label: 'Avg call' },
  { key: 'talkTime', label: 'Talk time' },
  { key: 'longest', label: 'Longest call' },
  { key: 'avgCallsPerDay', label: 'Calls per day' },
  { key: 'leadsWorked', label: 'Leads worked' },
  { key: 'leadsCalled', label: 'Leads called' },
  { key: 'followUpsDone', label: 'Follow-ups done' },
  { key: 'notesWritten', label: 'Call notes' },
  { key: 'leadsNoted', label: 'Leads noted' },
  { key: 'followUpsOverdue', label: 'Follow-ups overdue' },
  { key: 'followUpsDueToday', label: 'Follow-ups due today' },
  { key: 'statusChanges', label: 'Status changes' },
  { key: 'visitsCompleted', label: 'Visits done' },
  { key: 'visitsScheduled', label: 'Visits booked' },
  { key: 'visitsCancelled', label: 'Visits cancelled / no-show' },
  { key: 'conversions', label: 'Converted' },
  { key: 'leadsAssigned', label: 'New leads' },
  { key: 'activeDays', label: 'Days active' },
  { key: 'first', label: 'First action' },
  { key: 'last', label: 'Last action' },
];

export default function SalesActivityPage() {
  const user = getStoredUser();
  const canLogVisit = hasPermission(user, 'site_visits:create');
  const canSeeVisits = hasPermission(user, 'site_visits:read');
  const canExport = hasPermission(user, 'sales:export');
  const canPickAgent = hasPermission(user, 'sales:team');
  const [range, setRange] = useState<DateRange>(() => presetRange('today'));
  const [data, setData] = useState<SalesActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [logging, setLogging] = useState(false);
  const [userId, setUserId] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey | 'name'; desc: boolean }>({ key: 'calls', desc: true });
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await salesApi.getActivity({ ...range, userId }));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load sales activity.');
    } finally {
      inFlight.current = false;
    }
  }, [range, userId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    // Managers get a nudge whenever someone's call or online status changes.
    const socket = getSocket();
    socket?.on('presence:changed', load);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      socket?.off('presence:changed', load);
    };
  }, [load]);

  useEffect(() => {
    if (canPickAgent) usersApi.getAssignableUsers().then((r) => setAgents(r.users.map((u) => ({ id: u.id, name: u.name })))).catch(() => {});
  }, [canPickAgent]);

  const chart = useMemo(() => (data?.daily || []).map((d) => ({ ...d, label: shortDay(d.date) })), [data]);
  const t = data?.totals;
  const connectRate = t && t.calls ? Math.round((t.connected / t.calls) * 100) : 0;
  const isToday = !!data && data.from === data.to && data.from === presetRange('today').from;

  const rows = useMemo(() => {
    const list = [...(data?.agents || [])];
    const { key, desc } = sort;
    list.sort((a, b) => {
      const av: unknown = key === 'name' ? a.name : a[key];
      const bv: unknown = key === 'name' ? b.name : b[key];
      const cmp =
        typeof av === 'number' || typeof bv === 'number'
          ? (Number(av) || 0) - (Number(bv) || 0)
          : String(av || '').localeCompare(String(bv || ''));
      return (desc ? -cmp : cmp) || a.name.localeCompare(b.name);
    });
    return list;
  }, [data, sort]);

  const sortBy = (key: SortKey | 'name') =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const exportRows = () =>
    rows.map((a) => ({
      ...a,
      state: a.state === 'on_call' ? 'On call' : a.state === 'offline' ? 'Offline' : 'Online',
      avgCall: talkTime(a.avgTalkSeconds),
      talkTime: talkTime(a.talkSeconds),
      longest: talkTime(a.longestCallSeconds),
      first: a.firstActivityAt ? new Date(a.firstActivityAt).toLocaleString('en-IN') : '',
      last: a.lastActivityAt ? new Date(a.lastActivityAt).toLocaleString('en-IN') : '',
    }));

  return (
    <>
      <PageHeader
        title="Sales Activity"
        description="How each sales person is performing: calls, call time, leads worked, follow-ups and site visits"
        actions={
          <>
            <Link href="/call-tracking"><Button size="sm" variant="secondary"><PhoneIcon className="h-4 w-4" /> Call tracking</Button></Link>
            {canSeeVisits && <Link href="/site-visits"><Button size="sm" variant="secondary"><MapPinIcon className="h-4 w-4" /> Site visits</Button></Link>}
            {canExport && <ExportMenu
              fileName={`sales-performance-${range.from}-to-${range.to}`}
              columns={EXPORT_COLUMNS}
              disabled={!data || data.agents.length === 0}
              getRows={exportRows}
            />}
            {canLogVisit && <Button size="sm" onClick={() => setLogging(true)}><PlusIcon className="h-4 w-4" /> Log site visit</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker value={range} onChange={setRange} />
          {canPickAgent && (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="Sales person"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            >
              <option value="all">All sales people</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
        {t && data?.canSeeTeam && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-700"><AgentStatusDot state="available" /> {t.online} online</span>
            <span className="flex items-center gap-1.5 text-emerald-700"><AgentStatusDot state="on_call" /> {t.onCall} on call</span>
            <span className="flex items-center gap-1.5 text-red-600"><AgentStatusDot state="offline" /> {data.agents.length - t.online} offline</span>
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data && !error && <div className="flex justify-center py-16"><LoadingSpinner /></div>}

      {data && t && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Calls today" value={t.callsToday} change={isToday ? `${connectRate}% connected` : `${t.calls} in this range`} icon={<PhoneIcon className="h-5 w-5" />} />
            <StatCard label="Connected calls" value={t.connected} change={`${connectRate}% of ${t.calls} · ${t.missed} missed`} icon={<PhoneArrowUpRightIcon className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Avg call time" value={talkTime(t.avgTalkSeconds)} change={`${talkTime(t.talkSeconds)} total talk time`} icon={<ClockIcon className="h-5 w-5" />} tone="indigo" />
            <StatCard label="Leads worked" value={t.leadsWorked} change={`${t.notesWritten || 0} call notes · ${t.statusChanges} status changes`} icon={<UsersIcon className="h-5 w-5" />} tone="sky" />
            <StatCard label="Follow-ups done" value={t.followUpsDone} change={t.followUpsOverdue ? `${t.followUpsOverdue} overdue now` : 'None overdue'} changeType={t.followUpsOverdue ? 'negative' : 'positive'} icon={<CalendarDaysIcon className="h-5 w-5" />} tone="violet" />
            <StatCard label="Visits done" value={t.visitsCompleted} change={`${t.visitsScheduled} booked`} icon={<MapPinIcon className="h-5 w-5" />} tone="amber" />
            <StatCard label="Converted" value={t.conversions} icon={<ArrowPathIcon className="h-5 w-5" />} tone="emerald" />
            <StatCard label="New leads" value={t.leadsAssigned} change={t.incoming ? `${t.incoming} incoming calls` : undefined} icon={<UserPlusIcon className="h-5 w-5" />} tone="rose" />
          </div>

          <Card title="Performance by sales person" className="mb-6">
            <div className="-mx-6 -my-6 overflow-x-auto">
              <table className="w-full min-w-[1600px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="sticky left-0 z-10 bg-white px-6 py-3">
                      <SortButton label="Sales person" active={sort.key === 'name'} desc={sort.desc} onClick={() => sortBy('name')} />
                    </th>
                    <th className="px-3 py-3">Status</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="px-3 py-3 text-right" title={c.title}>
                        <SortButton label={c.label} active={sort.key === c.key} desc={sort.desc} onClick={() => sortBy(c.key)} right />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <tr key={a.userId} className="group hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-6 py-3 group-hover:bg-slate-50">
                        <div className="flex items-center gap-2.5">
                          <AgentStatusDot state={a.state} />
                          <div className="min-w-0">
                            <Link href={`/call-tracking?userId=${a.userId}&from=${data.from}&to=${data.to}`} className="font-semibold text-slate-900 hover:text-[var(--primary)] hover:underline">
                              {a.name}
                            </Link>
                            {(a.position || a.department) && <p className="truncate text-xs text-slate-400">{a.position || a.department}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><AgentStatusBadge state={a.state} detail={a.onCallWith} /></td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className={`px-3 py-3 text-right text-slate-600 ${c.className || ''}`}>
                          {c.render ? c.render(a) : String(a[c.key] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + 2} className="px-6 py-10 text-center text-slate-400">No active team members.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <NotesActivityCard from={data.from} to={data.to} userId={userId} />

          {chart.length > 1 && (
            <Card title="Calls, leads worked and visits per day">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="calls" name="Calls" fill="#0066ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="connected" name="Connected" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="leadsWorked" name="Leads worked" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="visits" name="Site visits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {!data.canSeeTeam && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400"><SignalIcon className="h-4 w-4" /> You are seeing your own activity. Managers see the whole team.</p>
          )}
        </>
      )}

      {logging && (
        <SiteVisitModal
          agents={agents}
          canPickAgent={canPickAgent}
          currentUserId={user?.id}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            load();
          }}
        />
      )}
    </>
  );
}

function SortButton({ label, active, desc, onClick, right }: { label: string; active: boolean; desc: boolean; onClick: () => void; right?: boolean }) {
  const Icon = desc ? ChevronDownIcon : ChevronUpIcon;
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 uppercase hover:text-slate-700 ${active ? 'text-slate-700' : ''} ${right ? 'flex-row-reverse' : ''}`}>
      <span className="whitespace-nowrap">{label}</span>
      <Icon className={`h-3 w-3 ${active ? '' : 'invisible'}`} />
    </button>
  );
}
