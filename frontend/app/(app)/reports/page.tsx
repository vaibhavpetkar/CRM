'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { dealsApi, leadsApi, reportsApi, ProfitLossReport } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'profit-loss', label: 'Profit & Loss' },
] as const;

export default function ReportsPage() {
  const [tab, setTab] = useState<'overview' | 'profit-loss'>('overview');
  const [dateRange, setDateRange] = useState('this-month');
  const [dealStats, setDealStats] = useState<any>(null);
  const [leadStats, setLeadStats] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dStats, lStats, dealsRes] = await Promise.all([
        dealsApi.getStats(),
        leadsApi.getStats(),
        dealsApi.getDeals({ limit: 500 }),
      ]);
      setDealStats(dStats);
      setLeadStats(lStats);
      setDeals(dealsRes.deals || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate deals by assigned rep, computed from real data (no hardcoded names)
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
    return stats.map((s: any) => ({
      stage: s.stage,
      count: Number(s.get ? s.get('count') : s.count) || 0,
    }));
  }, [dealStats]);

  const avgDealSize = dealStats?.averageValue ?? 0;
  const winRate = dealStats?.winRate ?? 0;

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Sales performance, pipeline analysis, and financials"
        actions={
          tab === 'overview' ? (
            <div className="flex gap-2">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
              >
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="this-year">This Year</option>
              </select>
              <Button variant="secondary" size="sm"><ArrowDownTrayIcon className="h-4 w-4" /> Export</Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {loading ? (
            <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Pipeline Value" value={formatCurrency(dealStats?.totalValue ?? 0)} />
                <StatCard label="Total Leads" value={(leadStats?.totalLeads ?? 0).toLocaleString()} />
                <StatCard label="Win Rate" value={`${winRate}%`} changeType="positive" />
                <StatCard label="Avg. Deal Size" value={formatCurrency(avgDealSize)} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card title="Rep Performance">
                  {repPerformance.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">No deals yet — assign deals to reps to see performance here.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <th className="pb-3 pr-4">#</th>
                            <th className="pb-3 pr-4">Rep</th>
                            <th className="pb-3 pr-4">Deals</th>
                            <th className="pb-3">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {repPerformance.map((rep, i) => (
                            <tr key={rep.rep}>
                              <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                              <td className="py-3 pr-4 font-medium text-slate-900">{rep.rep}</td>
                              <td className="py-3 pr-4 text-slate-600">{rep.deals}</td>
                              <td className="py-3 text-slate-600">{formatCurrency(rep.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card title="Pipeline Stage Analysis">
                  {stageBreakdown.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">No pipeline data yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {stageBreakdown.map((s: any) => (
                        <div key={s.stage} className="flex items-center justify-between rounded-md border-2 border-slate-100 p-3">
                          <span className="text-sm font-medium capitalize text-slate-900">{String(s.stage).replace('-', ' ')}</span>
                          <p className="text-sm font-medium text-slate-900">{s.count} deal{s.count === 1 ? '' : 's'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'profit-loss' && <ProfitLossTab />}
    </>
  );
}

function ProfitLossTab() {
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-01-01`;
  const defaultEnd = `${now.getFullYear()}-12-31`;

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.getProfitLoss({ startDate, endDate });
      setReport(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load the profit & loss report.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : report ? (
        <>
          <p className="mb-4 text-xs text-slate-400">
            Cash basis — revenue is money actually collected (from recorded payments) and expenses are amounts entered
            under Expenses, both within the selected range. This isn&apos;t full accrual accounting (no AR/AP aging or
            depreciation).
          </p>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Revenue" value={formatCurrency(report.totalRevenue)} changeType="positive" />
            <StatCard label="Expenses" value={formatCurrency(report.totalExpenses)} changeType="negative" />
            <StatCard
              label="Net Profit"
              value={formatCurrency(report.netProfit)}
              changeType={report.netProfit >= 0 ? 'positive' : 'negative'}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Revenue vs Expenses by Month">
              {report.monthly.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No payments or expenses recorded in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={report.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Net Profit Trend">
              {report.monthly.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No data in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={report.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Line type="monotone" dataKey="net" name="Net Profit" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Expenses by Category" className="lg:col-span-2">
              {report.expensesByCategory.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  No expenses recorded yet — add some under Expenses to see a breakdown here.
                </p>
              ) : (
                <div className="space-y-3">
                  {report.expensesByCategory.map((c) => {
                    const pct = report.totalExpenses > 0 ? (c.total / report.totalExpenses) * 100 : 0;
                    return (
                      <div key={c.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-900">{c.category}</span>
                          <span className="text-slate-500">{formatCurrency(c.total)} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
