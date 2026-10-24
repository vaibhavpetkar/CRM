'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { KpiCard, Panel, PanelLink, PeriodSelect, SelectPill, OwnerChip } from '@/components/ui/analytics';
import { DAY_MS as DAY, dayEnds, dailyCounts, dealMeasures, dealTrend, parseDeals, percentChange } from '@/lib/analytics';
import { formatCurrency, getCurrencySymbol } from '@/lib/utils';
import { leadsApi, dealsApi, contactsApi, tasksApi, salesApi, getStoredUser } from '@/lib/api';
import { isModuleEnabled } from '@/lib/modules';

const DEALS_ON = isModuleEnabled('deals');
const TASKS_ON = isModuleEnabled('tasks');
const CONTACTS_ON = isModuleEnabled('contacts');
const OFF = () => Promise.reject(new Error('module off'));
import { leadSourceLabel } from '@/lib/lead-options';
import {
  UsersIcon,
  UserIcon,
  IdentificationIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  EllipsisHorizontalIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

type Slice = { name: string; value: number; color: string };
type Activity = {
  id: string;
  kind: 'lead' | 'contact' | 'task';
  title: string;
  name: string;
  href: string;
  detail: string;
  when: string;
  at: number;
};

const RANGES = [
  { value: '7', label: 'Last 7 days', compare: 'vs last week' },
  { value: '30', label: 'Last 30 days', compare: 'vs last month' },
  { value: '90', label: 'Last 90 days', compare: 'vs last quarter' },
];

const METRICS = [
  { value: 'value', label: 'Pipeline Value' },
  { value: 'weighted', label: 'Weighted Value' },
  { value: 'count', label: 'Deal Count' },
];

// Lead stages as chevrons, deep navy to pale blue like the reference design.
const PIPELINE_STAGES = [
  { key: 'new', label: 'New', bg: '#0b2a6f', text: '#ffffff' },
  { key: 'contacted', label: 'Contacted', bg: '#0a6cf5', text: '#ffffff' },
  { key: 'qualified', label: 'Qualified', bg: '#a8cdfb', text: '#0b2a6f' },
  { key: 'working', label: 'Working', bg: '#c4ddfc', text: '#0b2a6f' },
  { key: 'converted', label: 'Converted', bg: '#d9e9fd', text: '#0b2a6f' },
  { key: 'lost', label: 'Lost', bg: '#e8f1fe', text: '#0b2a6f' },
];

const STATUS_COLORS: Record<string, string> = {
  contacted: '#ef4444',
  converted: '#f97316',
  lost: '#e11d48',
  new: '#0a6cf5',
  qualified: '#16a34a',
  working: '#8b5cf6',
  unqualified: '#94a3b8',
};

const SOURCE_COLORS: Record<string, string> = {
  other: '#0a6cf5',
  'social-media': '#8b5cf6',
  'cold-call': '#f97316',
  email: '#0ea5e9',
  event: '#f43f5e',
  linkedin: '#0284c7',
  referral: '#16a34a',
  website: '#eab308',
};
const FALLBACK_COLORS = ['#0a6cf5', '#f59e0b', '#10b981', '#6366f1', '#38bdf8', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316'];

const ACTIVITY_BADGE = {
  lead: { label: 'New', cls: 'bg-blue-50 text-blue-700', icon: UserIcon, tile: 'bg-blue-50 text-[var(--primary)]' },
  contact: { label: 'Contact', cls: 'bg-emerald-50 text-emerald-700', icon: IdentificationIcon, tile: 'bg-blue-50 text-[var(--primary)]' },
  task: { label: 'Task', cls: 'bg-orange-50 text-orange-700', icon: ClipboardDocumentCheckIcon, tile: 'bg-orange-50 text-orange-500' },
} as const;

const formatLabel = (value: string) => (value || 'Unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const isoDay = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Compact axis labels (₹4M, 12K) so long currency values don't squeeze the chart.
const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function timeAgo(at: number) {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

function dueLabel(due?: string | null) {
  if (!due) return 'No due date';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return 'No due date';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const time = hasTime ? ` at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  return `${sameDay ? 'Today' : shortDate(d)}${time}`;
}

function Donut({ data, total }: { data: Slice[]; total: number }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-slate-400">No lead data yet.</p>;
  return (
    <div className="w-full">
      <div className="mb-4">
        <p className="text-2xl font-extrabold leading-none text-slate-900">{total.toLocaleString()}</p>
        <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500">Total Leads</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:items-center sm:justify-center 2xl:gap-6">
        <div className="h-[104px] w-[104px] shrink-0 2xl:h-36 2xl:w-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} innerRadius="50%" outerRadius="98%" paddingAngle={data.length > 1 ? 1 : 0} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-1.5 2xl:max-w-[240px]">
          {data.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                <span className="truncate font-medium text-slate-700">{item.name}</span>
              </span>
              <span className="shrink-0 text-slate-500">
                {item.value} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PipelineChevrons({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-[560px]">
        {PIPELINE_STAGES.map((s, i) => {
          const first = i === 0;
          // Each stage is an arrow; every one after the first is notched to
          // take the previous arrow's point, and they overlap by the point width.
          const clip = first
            ? 'polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)'
            : 'polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)';
          return (
            <Link
              key={s.key}
              href={`/leads?status=${s.key}`}
              className={`flex h-[72px] flex-1 flex-col items-center justify-center pl-5 pr-3 text-center transition-opacity hover:opacity-90 ${first ? 'rounded-l-lg' : '-ml-3'} ${i >= 2 ? 'dark:brightness-[0.8]' : ''}`}
              style={{ backgroundColor: s.bg, color: s.text, clipPath: clip }}
              title={`${s.label} leads`}
            >
              <span className="text-xs font-semibold">{s.label}</span>
              <span className="text-xl font-extrabold">{(counts[s.key] || 0).toLocaleString()}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [userName, setUserName] = useState('');
  const [range, setRange] = useState('30');
  const [metric, setMetric] = useState('value');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalLeads: 0, totalContacts: 0, pipelineValue: 0, winRate: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [sourceSlices, setSourceSlices] = useState<Slice[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [dailyLeads, setDailyLeads] = useState<number[] | null>(null);
  const [contactTimes, setContactTimes] = useState<number[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

  const days = Number(range);
  const compareLabel = RANGES.find((r) => r.value === range)?.compare;

  const loadDashboardData = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    const from = new Date(Date.now() - (windowDays * 2 - 1) * DAY);
    const [leadStats, dealStats, contactStats, leadsRes, tasksRes, dealsRes, leadDaily, contactsRes] = await Promise.allSettled([
      leadsApi.getStats(),
      DEALS_ON ? dealsApi.getStats() : OFF(),
      CONTACTS_ON ? contactsApi.getStats() : OFF(),
      leadsApi.getLeads({ limit: 5 }),
      TASKS_ON ? tasksApi.getTasks({ status: 'pending' }) : OFF(),
      DEALS_ON ? dealsApi.getAllDeals() : OFF(),
      salesApi.getLeadSources({ from: isoDay(from), to: isoDay(new Date()) }),
      // Newest contacts, for the activity feed and the contacts trend.
      CONTACTS_ON ? contactsApi.getContacts({ limit: 200 }) : OFF(),
    ]);

    const next = { totalLeads: 0, totalContacts: 0, pipelineValue: 0, winRate: 0 };
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
            name: leadSourceLabel(s.leadSource),
            value: Number(s.count ?? s.dataValues?.count) || 0,
            color: SOURCE_COLORS[String(s.leadSource || '').toLowerCase()] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          }))
          .filter((s: Slice) => s.value > 0)
          .sort((a: Slice, b: Slice) => a.name.localeCompare(b.name))
      );
    }
    if (dealStats.status === 'fulfilled') {
      next.pipelineValue = dealStats.value.totalValue || 0;
      next.winRate = Math.round(dealStats.value.winRate || 0);
    }
    if (contactStats.status === 'fulfilled') next.totalContacts = contactStats.value.totalContacts || 0;
    setDeals(dealsRes.status === 'fulfilled' ? dealsRes.value : []);
    setDailyLeads(leadDaily.status === 'fulfilled' ? leadDaily.value.daily.map((d) => d.leads) : null);
    const contacts = contactsRes.status === 'fulfilled' ? contactsRes.value.contacts || [] : [];
    setContactTimes(contacts.map((c: any) => new Date(c.createdAt).getTime()).filter((t: number) => !Number.isNaN(t)));
    setStats(next);

    const activity: Activity[] = [];
    if (leadsRes.status === 'fulfilled') {
      const leads = leadsRes.value?.leads || [];
      setRecentLeads(leads.slice(0, 5));
      leads.slice(0, 3).forEach((lead: any) => {
        const at = new Date(lead.createdAt).getTime() || 0;
        activity.push({
          id: `lead-${lead.id}`,
          kind: 'lead',
          title: 'Lead added to pipeline',
          name: lead.name?.trim() || 'A lead',
          href: `/leads/${lead.id}`,
          detail: lead.company || 'No company',
          when: at ? timeAgo(at) : '',
          at,
        });
      });
    }
    contacts.slice(0, 1).forEach((c: any) => {
      const at = new Date(c.createdAt).getTime() || 0;
      activity.push({
        id: `contact-${c.id}`,
        kind: 'contact',
        title: 'New contact created',
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || 'A contact',
        href: '/contacts',
        detail: c.company || 'No company',
        when: at ? timeAgo(at) : '',
        at,
      });
    });
    activity.sort((a, b) => b.at - a.at);
    if (tasksRes.status === 'fulfilled') {
      (tasksRes.value?.tasks || []).slice(0, 1).forEach((task: any) => {
        activity.push({
          id: `task-${task.id}`,
          kind: 'task',
          title: 'Task pending',
          name: task.title,
          href: '/tasks',
          detail: '',
          when: dueLabel(task.dueDate),
          at: 0,
        });
      });
    }
    setRecentActivity(activity.slice(0, 4));

    if ([leadStats, dealStats, contactStats, leadsRes].every((r) => r.status === 'rejected')) {
      setError('Dashboard data failed to load. Check your connection and try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.firstName) setUserName(user.firstName);
  }, []);

  useEffect(() => {
    loadDashboardData(days);
  }, [loadDashboardData, days]);

  // Trends over the selected window (and the window before it, for "vs last ...").
  const trends = useMemo(() => {
    const ends = dayEnds(days * 2);
    const current = ends.slice(days);
    const windowStart = current[0] - DAY;
    const parsed = parseDeals(deals);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

    const leadDays = dailyLeads && dailyLeads.length >= days * 2 ? dailyLeads.slice(-days * 2) : null;
    const contactDaily = dailyCounts(contactTimes, ends);
    const dealDaily = dailyCounts(parsed.map((d) => d.at), ends);

    const pick = dealMeasures[metric === 'count' ? 'count' : metric === 'weighted' ? 'weighted' : 'value'];
    const chart = current.map((t) => ({ date: shortDate(new Date(t)), value: pick(parsed, t) }));

    return {
      leads: {
        spark: leadDays ? leadDays.slice(days) : [],
        change: leadDays ? percentChange(sum(leadDays.slice(days)), sum(leadDays.slice(0, days))) : null,
      },
      deals: {
        value: dealMeasures.open(parsed, Date.now()),
        spark: dealTrend(parsed, days, 'open').spark,
        change: percentChange(sum(dealDaily.slice(days)), sum(dealDaily.slice(0, days))),
      },
      contacts: { spark: contactDaily.slice(days), change: percentChange(sum(contactDaily.slice(days)), sum(contactDaily.slice(0, days))) },
      pipeline: dealTrend(parsed, days, 'value'),
      winRate: dealTrend(parsed, days, 'winRate'),
      chart,
      chartNow: pick(parsed, Date.now()),
      chartChange: percentChange(pick(parsed, Date.now()), pick(parsed, windowStart)),
    };
  }, [deals, dailyLeads, contactTimes, days, metric]);

  const statusSlices: Slice[] = Object.entries(statusCounts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, n]) => ({ name: formatLabel(status), value: n, color: STATUS_COLORS[status] || '#64748b' }));

  const chartValue = (v: number) => (metric === 'count' ? v.toLocaleString() : formatCurrency(v));
  const tickEvery = Math.max(1, Math.round(days / 6));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {greeting()}{userName ? `, ${userName}` : ''} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelect value={range} onChange={setRange} options={RANGES} />
          <button
            type="button"
            onClick={() => loadDashboardData(days)}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${DEALS_ON ? 'lg:grid-cols-3 xl:grid-cols-5' : ''}`}>
        <KpiCard
          label="Total Leads"
          value={stats.totalLeads.toLocaleString()}
          icon={<UsersIcon className="h-6 w-6" />}
          tone="blue"
          change={trends.leads.change}
          changeLabel={compareLabel}
          spark={trends.leads.spark}
          href="/leads"
        />
        {DEALS_ON && (
          <KpiCard
            label="Active Deals"
            value={trends.deals.value.toLocaleString()}
            icon={<BriefcaseIcon className="h-6 w-6" />}
            tone="sky"
            change={trends.deals.change}
            changeLabel={compareLabel}
            spark={trends.deals.spark}
            href="/deals"
          />
        )}
        {CONTACTS_ON && (
          <KpiCard
            label="Contacts"
            value={stats.totalContacts.toLocaleString()}
            icon={<IdentificationIcon className="h-6 w-6" />}
            tone="violet"
            change={trends.contacts.change}
            changeLabel={compareLabel}
            spark={trends.contacts.spark}
            href="/contacts"
          />
        )}
        {DEALS_ON && (
          <>
        <KpiCard
          label="Pipeline Value"
          value={formatCurrency(stats.pipelineValue)}
          icon={<span className="text-xl font-bold">{getCurrencySymbol()}</span>}
          tone="amber"
          change={trends.pipeline.change}
          changeLabel={compareLabel}
          spark={trends.pipeline.spark}
          href="/pipeline"
        />
        <KpiCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          icon={<ChartBarIcon className="h-6 w-6" />}
          tone="rose"
          change={trends.winRate.change}
          changeLabel={compareLabel}
          spark={trends.winRate.spark}
          href="/reports"
        />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel
          className={DEALS_ON ? 'xl:col-span-7' : 'xl:col-span-12'}
          title={DEALS_ON ? 'Sales Pipeline' : 'Lead Pipeline'}
          subtitle={DEALS_ON ? 'Track your opportunities across every stage.' : 'Your leads across every stage.'}
          action={DEALS_ON ? <PanelLink href="/pipeline">View Pipeline</PanelLink> : <PanelLink href="/leads">View Leads</PanelLink>}
          bodyClassName="flex items-center"
        >
          <div className="w-full">
            <PipelineChevrons counts={statusCounts} />
          </div>
        </Panel>

        {DEALS_ON && (
        <Panel
          className="xl:col-span-5"
          title="Pipeline Overview"
          subtitle="Total pipeline value and trend over time."
          action={<SelectPill label="Chart metric" value={metric} onChange={setMetric} options={METRICS} />}
          bodyClassName="pt-2"
        >
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-2xl font-extrabold text-slate-900">{chartValue(trends.chartNow)}</span>
            <span className={`text-xs font-bold ${trends.chartChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trends.chartChange >= 0 ? '+' : ''}
              {trends.chartChange}%
            </span>
            <span className="text-xs text-slate-500">{compareLabel}</span>
          </div>
          <div className="h-36 w-full">
            {deals.length === 0 && !loading ? (
              <p className="py-12 text-center text-sm text-slate-400">No deals yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.chart} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pipelineColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0a6cf5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0a6cf5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={tickEvery - 1} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => (metric === 'count' ? compact(v) : `${getCurrencySymbol()}${compact(v)}`)}
                  />
                  <Tooltip formatter={(v) => [chartValue(Number(v)), METRICS.find((m) => m.value === metric)?.label]} />
                  <Area
                    type="linear"
                    dataKey="value"
                    stroke="#0a6cf5"
                    strokeWidth={2.5}
                    fill="url(#pipelineColor)"
                    dot={(props: any) =>
                      props.index % tickEvery === tickEvery - 1 || props.index === trends.chart.length - 1 ? (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={3.5} fill="#0a6cf5" stroke="#fff" strokeWidth={1.5} />
                      ) : (
                        <g key={props.index} />
                      )
                    }
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <Panel
          title="Recent Activity"
          subtitle="Stay updated with your team's latest actions."
          action={<PanelLink href="/leads">View all</PanelLink>}
          className="lg:col-span-2 xl:col-span-1"
        >
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No recent activity yet.</p>
          ) : (
            <ol className="relative">
              {recentActivity.map((a, i) => {
                const b = ACTIVITY_BADGE[a.kind];
                const Icon = b.icon;
                return (
                  <li key={a.id} className="relative flex items-center gap-3 border-b border-slate-100 py-3 pl-5 last:border-b-0">
                    {/* Timeline rail and dot */}
                    <span
                      className={`absolute left-[3px] w-px bg-slate-300 ${i === 0 ? 'top-1/2' : 'top-0'} ${i === recentActivity.length - 1 ? 'h-1/2' : 'bottom-0'}`}
                      aria-hidden="true"
                    />
                    <span className="absolute left-0 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-slate-800" aria-hidden="true" />
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${b.tile}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate text-[13px] font-bold text-slate-900">{a.title}</p>
                      <p className="truncate text-slate-500">
                        <Link href={a.href} className={a.kind === 'lead' ? 'underline decoration-slate-300 underline-offset-2 hover:text-[var(--primary)]' : 'hover:text-[var(--primary)]'}>
                          {a.name}
                        </Link>
                        {a.detail && <> • {a.detail}</>}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[11px] text-slate-500 sm:block">{a.when}</span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-center text-[10px] font-bold ${b.cls}`}>{b.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="Leads by Status" bodyClassName="pt-2">
          <div className="w-full">
            <Donut data={statusSlices} total={stats.totalLeads} />
          </div>
        </Panel>

        <Panel title="Leads by Source" action={<PanelLink href="/reports?step=lead-sources">Report</PanelLink>} bodyClassName="pt-2">
          <div className="w-full">
            <Donut data={sourceSlices} total={stats.totalLeads} />
          </div>
        </Panel>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Recent Leads</h2>
          <PanelLink href="/leads">View all</PanelLink>
        </div>
        {loading && recentLeads.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : recentLeads.length === 0 ? (
          <p className="pb-6 text-center text-sm text-slate-400">No leads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Score</th>
                  <th className="px-4 py-2.5">Value</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Added On</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentLeads.map((lead) => {
                  const leadName = lead.name?.trim() || 'Unnamed';
                  return (
                    <tr key={lead.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-2.5">
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-[var(--primary)]">
                          {leadName}
                        </Link>
                        <p className="text-[11px] text-slate-500">{lead.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{lead.company || '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={lead.status || 'new'} /></td>
                      <td className="px-4 py-2.5">{lead.score || 0}</td>
                      <td className="px-4 py-2.5">{formatCurrency(Number(lead.value) || 0)}</td>
                      <td className="px-4 py-2.5"><OwnerChip name={lead.assignedTo} /></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Open ${leadName}`}
                          title="Open lead"
                        >
                          <EllipsisHorizontalIcon className="h-5 w-5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
