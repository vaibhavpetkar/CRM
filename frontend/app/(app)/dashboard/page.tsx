'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatCurrency, getCurrencySymbol } from '@/lib/utils';
import { leadsApi, dealsApi, contactsApi, tasksApi, getStoredUser } from '@/lib/api';
import {
  UsersIcon,
  BriefcaseIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChevronRightIcon,
  CalendarIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Slice = { name: string; value: number; color: string };
type Activity = { id: string; type: 'lead' | 'task'; title: string; name: string; detail: string; badge: string };

const TREND_DAYS = 30;

// Lead stages left to right, coloured from deep navy to pale sky like the
// reference design. Text colours are fixed hex so they stay readable in dark mode.
const PIPELINE_STAGES = [
  { key: 'new', label: 'New', bg: '#0a2540', text: '#ffffff', sub: '#cbd5e1' },
  { key: 'contacted', label: 'Contacted', bg: '#0066ff', text: '#ffffff', sub: '#dbeafe' },
  { key: 'qualified', label: 'Qualified', bg: '#38bdf8', text: '#ffffff', sub: '#e0f2fe' },
  { key: 'working', label: 'Working', bg: '#7dd3fc', text: '#0f172a', sub: '#334155' },
  { key: 'converted', label: 'Converted', bg: '#e0f2fe', text: '#0f172a', sub: '#475569' },
  { key: 'lost', label: 'Lost', bg: '#f1f5f9', text: '#475569', sub: '#64748b' },
];

const STATUS_COLORS: Record<string, string> = {
  new: '#0066ff',
  contacted: '#f97316',
  qualified: '#10b981',
  working: '#06b6d4',
  converted: '#8b5cf6',
  unqualified: '#94a3b8',
  lost: '#ef4444',
};

const SOURCE_COLORS = ['#0066ff', '#f59e0b', '#10b981', '#6366f1', '#38bdf8', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316'];

const formatLabel = (value: string) =>
  (value || 'Unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const initialsOf = (name?: string | null) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Compact axis labels (12K, 1.2M) so long currency values don't squeeze the chart.
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Cumulative deal value at the end of each of the last TREND_DAYS days. */
function buildTrend(deals: any[]) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const points: { date: string; value: number }[] = [];
  const sorted = deals
    .map((d) => ({ at: new Date(d.createdAt).getTime(), value: Number(d.value) || 0 }))
    .filter((d) => !Number.isNaN(d.at))
    .sort((a, b) => a.at - b.at);
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(today.getDate() - i);
    const cutoff = end.getTime();
    let sum = 0;
    for (const d of sorted) {
      if (d.at > cutoff) break;
      sum += d.value;
    }
    points.push({ date: shortDate(end), value: sum });
  }
  return points;
}

function Panel({ title, subtitle, action, children, className = '' }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, icon, tone, foot, small }: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: string;
  foot?: React.ReactNode;
  /** Smaller value text for long figures such as currency. */
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`truncate font-extrabold text-slate-900 ${small ? 'text-lg' : 'text-xl'}`} title={typeof value === 'string' ? value : undefined}>
          {value}
        </div>
        {foot && <div className="truncate text-[11px] font-semibold text-slate-400">{foot}</div>}
      </div>
    </div>
  );
}

function Donut({ data, total }: { data: Slice[]; total: number }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-400">No lead data yet.</p>;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} innerRadius={42} outerRadius={60} paddingAngle={data.length > 1 ? 2 : 0} dataKey="value" stroke="none">
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [v, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold text-slate-900">{total.toLocaleString()}</span>
          <span className="text-[9px] font-medium text-slate-400">Total Leads</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="truncate font-medium text-slate-700">{item.name}</span>
            </div>
            <span className="shrink-0 font-semibold text-slate-500">
              {item.value} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalLeads: 0, totalDeals: 0, totalContacts: 0, pipelineValue: 0, winRate: 0, wonDeals: 0, lostDeals: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [sourceSlices, setSourceSlices] = useState<Slice[]>([]);
  const [trend, setTrend] = useState<{ date: string; value: number }[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [leadStats, dealStats, contactStats, leadsRes, tasksRes, dealsRes] = await Promise.allSettled([
      leadsApi.getStats(),
      dealsApi.getStats(),
      contactsApi.getStats(),
      leadsApi.getLeads({ limit: 5 }),
      tasksApi.getTasks({ status: 'pending' }),
      dealsApi.getAllDeals(),
    ]);

    const next = { totalLeads: 0, totalDeals: 0, totalContacts: 0, pipelineValue: 0, winRate: 0, wonDeals: 0, lostDeals: 0 };
    if (leadStats.status === 'fulfilled') {
      next.totalLeads = leadStats.value.totalLeads || 0;
      const counts: Record<string, number> = {};
      (leadStats.value.leadsByStatus || []).forEach((s: any) => {
        counts[s.status] = Number(s.count ?? s.dataValues?.count) || 0;
      });
      setStatusCounts(counts);
      setSourceSlices(
        (leadStats.value.leadsBySource || [])
          .map((s: any, i: number) => ({
            name: formatLabel(s.leadSource),
            value: Number(s.count ?? s.dataValues?.count) || 0,
            color: SOURCE_COLORS[i % SOURCE_COLORS.length],
          }))
          .filter((s: Slice) => s.value > 0)
      );
    }
    if (dealStats.status === 'fulfilled') {
      const v = dealStats.value;
      next.totalDeals = v.totalDeals || 0;
      next.pipelineValue = v.totalValue || 0;
      next.winRate = Math.round(v.winRate || 0);
      next.wonDeals = v.wonDeals || 0;
      next.lostDeals = v.lostDeals || 0;
    }
    if (contactStats.status === 'fulfilled') next.totalContacts = contactStats.value.totalContacts || 0;
    if (dealsRes.status === 'fulfilled') setTrend(buildTrend(dealsRes.value));
    setStats(next);

    const activity: Activity[] = [];
    if (leadsRes.status === 'fulfilled') {
      const leads = leadsRes.value?.leads || [];
      setRecentLeads(leads.slice(0, 5));
      leads.slice(0, 3).forEach((lead: any) => {
        activity.push({
          id: `lead-${lead.id}`,
          type: 'lead',
          title: 'Lead added to pipeline',
          name: lead.name?.trim() || 'A lead',
          detail: lead.company || 'No company',
          badge: formatLabel(lead.status || 'new'),
        });
      });
    }
    if (tasksRes.status === 'fulfilled') {
      (tasksRes.value?.tasks || []).slice(0, 2).forEach((task: any) => {
        activity.push({
          id: `task-${task.id}`,
          type: 'task',
          title: 'Task pending',
          name: task.title,
          detail: task.dueDate ? `Due ${shortDate(new Date(task.dueDate))}` : 'No due date',
          badge: 'Task',
        });
      });
    }
    setRecentActivity(activity);

    if ([leadStats, dealStats, contactStats, leadsRes].every((r) => r.status === 'rejected')) {
      setError('Dashboard data failed to load. Check your connection and try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.firstName) setUserName(user.firstName);
    loadDashboardData();
  }, [loadDashboardData]);

  const statusSlices: Slice[] = Object.entries(statusCounts)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => ({ name: formatLabel(status), value: n, color: STATUS_COLORS[status] || '#64748b' }));

  const totalByStatus = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const openLeads = totalByStatus - (statusCounts.converted || 0) - (statusCounts.lost || 0) - (statusCounts.unqualified || 0);
  const conversionRate = totalByStatus > 0 ? Math.round(((statusCounts.converted || 0) / totalByStatus) * 1000) / 10 : 0;

  const trendStart = trend[0]?.value ?? 0;
  const trendEnd = trend[trend.length - 1]?.value ?? 0;
  const trendChange = trendStart > 0 ? Math.round(((trendEnd - trendStart) / trendStart) * 1000) / 10 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {greeting()}{userName ? `, ${userName}` : ''} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs">
            <CalendarIcon className="h-4 w-4 text-slate-400" />
            <span>Last {TREND_DAYS} days</span>
          </div>
          <button
            type="button"
            onClick={loadDashboardData}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total Leads" value={stats.totalLeads.toLocaleString()} tone="bg-blue-50 text-[var(--primary)]" icon={<UsersIcon className="h-5 w-5" />} />
        <Kpi label="Active Deals" value={stats.totalDeals.toLocaleString()} tone="bg-cyan-50 text-cyan-600" icon={<BriefcaseIcon className="h-5 w-5" />} />
        <Kpi label="Contacts" value={stats.totalContacts.toLocaleString()} tone="bg-sky-50 text-sky-600" icon={<UserGroupIcon className="h-5 w-5" />} />
        <Kpi
          label="Pipeline Value"
          value={formatCurrency(stats.pipelineValue)}
          small
          tone="bg-blue-50 text-[var(--primary)] text-lg font-bold"
          icon={<span>{getCurrencySymbol()}</span>}
          foot={
            trendChange !== null && (
              <span className={`inline-flex items-center gap-1 ${trendChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {trendChange >= 0 ? <ArrowTrendingUpIcon className="h-3 w-3" /> : <ArrowTrendingDownIcon className="h-3 w-3" />}
                {trendChange >= 0 ? '+' : ''}{trendChange}%<span className="font-normal text-slate-400">in {TREND_DAYS} days</span>
              </span>
            )
          }
        />
        <Kpi
          label="Win Rate"
          value={`${stats.winRate}%`}
          tone="bg-indigo-50 text-indigo-600"
          icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
          foot={`${stats.wonDeals} won · ${stats.lostDeals} lost`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Sales Pipeline"
          subtitle="Track your leads across every stage."
          action={
            <Link href="/pipeline" className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
              View Pipeline <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-1 pt-2 sm:grid-cols-6">
            {PIPELINE_STAGES.map((s, i) => (
              <div
                key={s.key}
                className={`p-3 text-center ${i === 0 ? 'rounded-l-lg' : ''} ${i === PIPELINE_STAGES.length - 1 ? 'rounded-r-lg' : ''}`}
                style={{ backgroundColor: s.bg, color: s.text }}
              >
                <span className="block truncate text-[10px] font-medium" style={{ color: s.sub }}>{s.label}</span>
                <span className="text-lg font-bold">{(statusCounts[s.key] || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-xs">
            <div>
              <p className="font-semibold text-slate-400">Open leads</p>
              <p className="text-base font-extrabold text-slate-900">{openLeads.toLocaleString()}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400">Converted</p>
              <p className="text-base font-extrabold text-slate-900">{(statusCounts.converted || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400">Conversion rate</p>
              <p className="text-base font-extrabold text-slate-900">{conversionRate}%</p>
            </div>
          </div>
        </Panel>

        <Panel
          className="lg:col-span-5"
          title="Pipeline Overview"
          subtitle="Total deal value and trend over time."
          action={
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-lg font-extrabold text-slate-900">{formatCurrency(stats.pipelineValue)}</span>
              {trendChange !== null && (
                <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${trendChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {trendChange >= 0 ? '+' : ''}{trendChange}%
                </span>
              )}
            </div>
          }
        >
          <div className="h-44 w-full">
            {trend.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No deals yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -10, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="pipelineColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0066ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0066ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} interval={6} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={compact} width={48} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Pipeline']} />
                  <Area type="monotone" dataKey="value" stroke="#0066ff" strokeWidth={3} fillOpacity={1} fill="url(#pipelineColor)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          className="lg:col-span-4"
          title="Recent Activity"
          action={<Link href="/leads" className="shrink-0 text-xs font-bold text-[var(--primary)] hover:underline">View all →</Link>}
        >
          {recentActivity.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No recent activity yet.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-xs">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      a.type === 'lead' ? 'bg-blue-50 text-[var(--primary)]' : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {a.type === 'lead' ? <UsersIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">{a.title}</p>
                    <p className="truncate font-semibold text-slate-500">
                      {a.name} <span className="font-normal text-slate-400">• {a.detail}</span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                      a.type === 'lead' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {a.badge}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="Leads by Status">
          <Donut data={statusSlices} total={stats.totalLeads} />
        </Panel>

        <Panel
          className="lg:col-span-4"
          title="Leads by Source"
          action={
            <Link href="/lead-sources" className="text-xs font-semibold text-[var(--primary)] hover:underline">
              View report
            </Link>
          }
        >
          <Donut data={sourceSlices} total={stats.totalLeads} />
        </Panel>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h2 className="text-base font-bold text-slate-900">Recent Leads</h2>
          <Link href="/leads" className="text-xs font-bold text-[var(--primary)] hover:underline">View all →</Link>
        </div>
        {loading && recentLeads.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : recentLeads.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No leads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Added On</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {recentLeads.map((lead) => {
                  const leadName = lead.name?.trim() || 'Unnamed';
                  return (
                    <tr key={lead.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-bold uppercase text-slate-900 hover:text-[var(--primary)]">
                          {leadName}
                        </Link>
                        <p className="text-[11px] font-normal text-slate-400">{lead.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{lead.company || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={lead.status || 'new'} /></td>
                      <td className="px-4 py-3 font-bold">{lead.score || 0}</td>
                      <td className="px-4 py-3 font-bold">{formatCurrency(Number(lead.value) || 0)}</td>
                      <td className="px-4 py-3">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
                              {initialsOf(lead.assignedTo)}
                            </span>
                            <span className="truncate">{lead.assignedTo}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label={`Open ${leadName}`}
                          title="Open lead"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
