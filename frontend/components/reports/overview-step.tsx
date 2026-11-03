'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChartBarIcon,
  UserIcon,
  ViewfinderCircleIcon,
  CircleStackIcon,
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  ComputerDesktopIcon,
  MapPinIcon,
  MegaphoneIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
  BoltIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { KpiCard, Panel, PeriodSelect } from '@/components/ui/analytics';
import { dealsApi, leadsApi, reportsApi, salesApi, ProfitLossReport } from '@/lib/api';
import { dealTrend, parseDeals, percentChange } from '@/lib/analytics';
import { formatCurrency } from '@/lib/utils';
import { fillMonths, monthLabel, toDayString } from './report-utils';

export const PERIODS = [
  { value: 'month', label: 'This Month', days: 30, compare: 'vs last month' },
  { value: 'quarter', label: 'This Quarter', days: 90, compare: 'vs last quarter' },
  { value: 'year', label: 'This Year', days: 365, compare: 'vs last year' },
];

/**
 * Date range for the money charts. "This Month" also shows last month so
 * the bars have something to compare against, as in the reference design.
 */
export function periodRange(period: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'year') return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  if (period === 'quarter') return { startDate: toDayString(new Date(y, m - 2, 1)), endDate: toDayString(new Date(y, m + 1, 0)) };
  return { startDate: toDayString(new Date(y, m - 1, 1)), endDate: toDayString(new Date(y, m + 1, 0)) };
}

/** Days from `startDate` to today, for counting things in a period. */
export function periodStart(period: string) {
  const now = new Date();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  if (period === 'quarter') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const CATEGORY_STYLES = [
  { match: /travel|flight|trip/i, icon: PaperAirplaneIcon, tile: 'bg-red-50 text-red-500', bar: '#f87171' },
  { match: /software|subscription|saas|tool/i, icon: ComputerDesktopIcon, tile: 'bg-blue-50 text-[var(--primary)]', bar: '#0a6cf5' },
  { match: /field|visit|site|fuel/i, icon: MapPinIcon, tile: 'bg-amber-50 text-amber-500', bar: '#fbbf24' },
  { match: /market|ads?\b|advert|campaign/i, icon: MegaphoneIcon, tile: 'bg-violet-50 text-violet-500', bar: '#8b5cf6' },
  { match: /office|rent/i, icon: BuildingOffice2Icon, tile: 'bg-cyan-50 text-cyan-600', bar: '#06b6d4' },
  { match: /utilit|electric|internet|phone/i, icon: BoltIcon, tile: 'bg-yellow-50 text-yellow-600', bar: '#eab308' },
  { match: /salar|payroll|staff/i, icon: UsersIcon, tile: 'bg-emerald-50 text-emerald-600', bar: '#10b981' },
];
const FALLBACK_STYLE = { icon: BanknotesIcon, tile: 'bg-slate-100 text-slate-500', bar: '#94a3b8' };

/** Expenses by category as labelled progress bars with an icon per category. */
export function ExpenseBreakdown({ categories, total }: { categories: { category: string; total: number }[]; total: number }) {
  if (categories.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">No expenses recorded yet. Add some under Expenses to see a breakdown here.</p>;
  }
  return (
    <ul className="space-y-3">
      {categories.map((c) => {
        const pct = total > 0 ? (c.total / total) * 100 : 0;
        const st = CATEGORY_STYLES.find((s) => s.match.test(c.category)) || FALLBACK_STYLE;
        const Icon = st.icon;
        return (
          <li key={c.category} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,14rem)_1fr_auto]">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${st.tile}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="truncate text-sm font-bold text-slate-900">{c.category}</span>
            <div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: st.bar }} />
            </div>
            <span className="col-span-2 whitespace-nowrap text-right text-sm font-bold text-slate-900 sm:col-span-1 sm:w-32">
              {formatCurrency(c.total)} <span className="font-medium text-slate-500">({pct.toFixed(0)}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const iso = (d: Date) => toDayString(d);

export default function OverviewStep({ period, onPeriodChange, onOpenProfitLoss }: {
  period: string;
  onPeriodChange: (p: string) => void;
  onOpenProfitLoss: () => void;
}) {
  const p = PERIODS.find((x) => x.value === period) || PERIODS[0];
  const [dealStats, setDealStats] = useState<any>(null);
  const [leadStats, setLeadStats] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [leadDaily, setLeadDaily] = useState<number[] | null>(null);
  const [pl, setPl] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const days = p.days;
    const from = new Date(Date.now() - (days * 2 - 1) * 86400000);
    const [dStats, lStats, dealsRes, plRes, daily] = await Promise.allSettled([
      dealsApi.getStats(),
      leadsApi.getStats(),
      dealsApi.getAllDeals(),
      reportsApi.getProfitLoss(periodRange(p.value)),
      // The lead report allows up to a year per request.
      salesApi.getLeadSources({ from: iso(days * 2 > 366 ? new Date(Date.now() - 365 * 86400000) : from), to: iso(new Date()) }),
    ]);
    if (dStats.status === 'fulfilled') setDealStats(dStats.value);
    if (lStats.status === 'fulfilled') setLeadStats(lStats.value);
    setDeals(dealsRes.status === 'fulfilled' ? dealsRes.value : []);
    setPl(plRes.status === 'fulfilled' ? plRes.value : null);
    setLeadDaily(daily.status === 'fulfilled' ? daily.value.daily.map((d) => d.leads) : null);
    if (dStats.status === 'rejected' && lStats.status === 'rejected') {
      setError((dStats.reason as Error)?.message || 'Failed to load reports. Is the backend running?');
    }
    setLoading(false);
  }, [p.days, p.value]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const trends = useMemo(() => {
    const parsed = parseDeals(deals);
    const days = p.days;
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const half = leadDaily ? Math.floor(leadDaily.length / 2) : 0;
    return {
      pipeline: dealTrend(parsed, days, 'value'),
      winRate: dealTrend(parsed, days, 'winRate'),
      average: dealTrend(parsed, days, 'average'),
      leads: leadDaily
        ? { spark: leadDaily.slice(half), change: percentChange(sum(leadDaily.slice(half)), sum(leadDaily.slice(0, half))) }
        : { spark: [], change: null },
    };
  }, [deals, leadDaily, p.days]);

  const repPerformance = useMemo(() => {
    const byRep: Record<string, { deals: number; revenue: number }> = {};
    deals.forEach((deal) => {
      const rep = deal.assignedTo || 'Unassigned';
      if (!byRep[rep]) byRep[rep] = { deals: 0, revenue: 0 };
      byRep[rep].deals += 1;
      byRep[rep].revenue += Number(deal.value) || 0;
    });
    return Object.entries(byRep)
      .map(([rep, data]) => ({ rep, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [deals]);

  const stageBreakdown = useMemo(() => {
    const stats: any[] = dealStats?.dealsByStage || [];
    const order = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
    const rank = (stage: string) => (order.indexOf(stage) + 1 || order.length + 1);
    return stats
      .map((s: any) => ({ stage: String(s.stage), count: Number(s.get ? s.get('count') : s.count) || 0 }))
      .sort((a, b) => rank(a.stage) - rank(b.stage));
  }, [dealStats]);
  const maxStage = Math.max(1, ...stageBreakdown.map((s) => s.count));

  const range = periodRange(p.value);
  const monthly = pl ? fillMonths(pl.monthly, range.startDate, range.endDate).map((m) => ({ ...m, label: monthLabel(m.month) })) : [];
  const hasMoney = monthly.some((m) => m.revenue || m.expenses);

  if (loading && !dealStats) return <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>;

  const chartMenu = (
    <>
      <PeriodSelect value={period} onChange={onPeriodChange} options={PERIODS} />
      <button
        type="button"
        onClick={onOpenProfitLoss}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Open the Profit & Loss report"
        title="Open the Profit & Loss report"
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>
    </>
  );

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pipeline Value"
          value={formatCurrency(dealStats?.totalValue ?? 0)}
          caption="Current pipeline"
          icon={<ChartBarIcon className="h-6 w-6" />}
          tone="blue"
          change={trends.pipeline.change}
          changeLabel={p.compare}
          spark={trends.pipeline.spark}
          href="/pipeline"
        />
        <KpiCard
          label="Total Leads"
          value={(leadStats?.totalLeads ?? 0).toLocaleString()}
          caption="Across all sources"
          icon={<UserIcon className="h-6 w-6" />}
          tone="cyan"
          change={trends.leads.change}
          changeLabel={p.compare}
          spark={trends.leads.spark}
          href="/leads"
        />
        <KpiCard
          label="Win Rate"
          value={`${Math.round(dealStats?.winRate ?? 0)}%`}
          caption="Current conversion rate"
          icon={<ViewfinderCircleIcon className="h-6 w-6" />}
          tone="violet"
          change={trends.winRate.change}
          changeLabel={p.compare}
          spark={trends.winRate.spark}
          href="/deals"
        />
        <KpiCard
          label="Avg. Deal Size"
          value={formatCurrency(dealStats?.averageValue ?? 0)}
          caption="Average deal value"
          icon={<CircleStackIcon className="h-6 w-6" />}
          tone="orange"
          change={trends.average.change}
          changeLabel={p.compare}
          spark={trends.average.spark}
          href="/deals"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Revenue vs Expenses" subtitle="Track income and spending over time." action={chartMenu}>
          {!hasMoney ? (
            <p className="py-12 text-center text-sm text-slate-400">No payments or expenses recorded in this period.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: -12, right: 8, top: 4 }} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toLocaleString()} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
                  <Bar dataKey="revenue" name="Revenue" fill="#0a6cf5" radius={[3, 3, 0, 0]} maxBarSize={56} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f05252" radius={[3, 3, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Net Profit Trend" subtitle="Monitor your profitability over time." action={chartMenu}>
          {!hasMoney ? (
            <p className="py-12 text-center text-sm text-slate-400">No data in this period.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ left: -4, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="netProfitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0a6cf5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0a6cf5" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toLocaleString()} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Net profit']} />
                  <Area type="linear" dataKey="net" stroke="#0a6cf5" strokeWidth={2.5} fill="url(#netProfitFill)" dot={{ r: 4, fill: '#0a6cf5', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Expenses by Category" subtitle="Breakdown of expenses by category.">
        <ExpenseBreakdown categories={pl?.expensesByCategory || []} total={pl?.totalExpenses || 0} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Rep Performance" subtitle="Deals and deal value by owner.">
          {repPerformance.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No deals yet. Assign deals to reps to see performance here.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">#</th>
                    <th className="px-3 py-2.5">Rep</th>
                    <th className="px-3 py-2.5">Deals</th>
                    <th className="px-5 py-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {repPerformance.map((rep, i) => (
                    <tr key={rep.rep}>
                      <td className="px-5 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{rep.rep}</td>
                      <td className="px-3 py-2.5 text-slate-600">{rep.deals}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-slate-900">{formatCurrency(rep.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Pipeline Stage Analysis" subtitle="How many deals sit in each stage.">
          {stageBreakdown.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No pipeline data yet.</p>
          ) : (
            <ul className="space-y-3">
              {stageBreakdown.map((s) => (
                <li key={s.stage} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-xs">
                  <span className="truncate font-semibold capitalize text-slate-900">{s.stage.replace('-', ' ')}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right font-semibold text-slate-700">
                    {s.count} deal{s.count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
