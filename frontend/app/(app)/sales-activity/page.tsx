'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PhoneIcon, PhoneArrowUpRightIcon, PhoneXMarkIcon, MapPinIcon, ClockIcon, UserPlusIcon, PlusIcon, SignalIcon } from '@heroicons/react/24/outline';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import DateRangePicker, { DateRange, presetRange } from '@/components/sales/date-range';
import { AgentStatusBadge, AgentStatusDot } from '@/components/sales/agent-status';
import SiteVisitModal from '@/components/sales/site-visit-modal';
import { getStoredUser, salesApi, SalesActivity, usersApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { hasPermission } from '@/lib/permissions';

// How many calls and site visits each sales person did, with their live
// green/red status. Managers see the team; everyone else sees themselves.

const POLL_MS = 30000;

const talkTime = (seconds: number) => {
  if (!seconds) return '0m';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function SalesActivityPage() {
  const user = getStoredUser();
  const canLogVisit = hasPermission(user, 'leads:update');
  const canPickAgent = hasPermission(user, 'users:read');
  const [range, setRange] = useState<DateRange>(() => presetRange('today'));
  const [data, setData] = useState<SalesActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [logging, setLogging] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await salesApi.getActivity(range));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load sales activity.');
    } finally {
      inFlight.current = false;
    }
  }, [range]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, POLL_MS);
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

  return (
    <>
      <PageHeader
        title="Sales Activity"
        description="Calls and site visits by each sales person, with who is on call right now"
        actions={
          <>
            <Link href="/call-tracking"><Button size="sm" variant="secondary"><PhoneIcon className="h-4 w-4" /> Call tracking</Button></Link>
            <Link href="/site-visits"><Button size="sm" variant="secondary"><MapPinIcon className="h-4 w-4" /> Site visits</Button></Link>
            {canLogVisit && <Button size="sm" onClick={() => setLogging(true)}><PlusIcon className="h-4 w-4" /> Log site visit</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} />
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
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Calls" value={t.calls} icon={<PhoneIcon className="h-5 w-5" />} />
            <StatCard label="Connected" value={t.connected} change={`${connectRate}% connect rate`} icon={<PhoneArrowUpRightIcon className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Missed" value={t.missed} icon={<PhoneXMarkIcon className="h-5 w-5" />} tone="rose" />
            <StatCard label="Talk time" value={talkTime(t.talkSeconds)} icon={<ClockIcon className="h-5 w-5" />} tone="indigo" />
            <StatCard label="Visits done" value={t.visitsCompleted} change={`${t.visitsScheduled} scheduled`} icon={<MapPinIcon className="h-5 w-5" />} tone="amber" />
            <StatCard label="New leads" value={t.leadsAssigned} icon={<UserPlusIcon className="h-5 w-5" />} tone="violet" />
          </div>

          <Card title="By sales person" className="mb-6">
            <div className="-mx-6 -my-6 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3">Sales person</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Calls</th>
                    <th className="px-3 py-3 text-right">Connected</th>
                    <th className="px-3 py-3 text-right">Missed</th>
                    <th className="px-3 py-3 text-right">Talk time</th>
                    <th className="px-3 py-3 text-right">Avg call</th>
                    <th className="px-3 py-3 text-right">Visits done</th>
                    <th className="px-3 py-3 text-right">Scheduled</th>
                    <th className="px-6 py-3 text-right">Leads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.agents.map((a) => (
                    <tr key={a.userId} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3">
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
                      <td className="px-3 py-3 text-right font-bold text-slate-900">{a.calls}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{a.connected}</td>
                      <td className="px-3 py-3 text-right text-rose-600">{a.missed}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{talkTime(a.talkSeconds)}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{talkTime(a.avgTalkSeconds)}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">{a.visitsCompleted}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{a.visitsScheduled}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{a.leadsAssigned}</td>
                    </tr>
                  ))}
                  {data.agents.length === 0 && (
                    <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">No active team members.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {chart.length > 1 && (
            <Card title="Calls and visits per day">
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
