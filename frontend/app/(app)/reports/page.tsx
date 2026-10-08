'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StatusBadge from '@/components/ui/status-badge';
import { dealsApi, leadsApi, reportsApi, ProfitLossReport, SalesForecastReport } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, ComposedChart, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'forecast', label: 'Sales Forecast' },
  { id: 'profit-loss', label: 'Profit & Loss' },
] as const;

export default function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');
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
        dealsApi.getAllDeals(),
      ]);
      setDealStats(dStats);
      setLeadStats(lStats);
      setDeals(dealsRes);
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
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
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

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
                        <div key={s.stage} className="flex items-center justify-between rounded-lg border-2 border-slate-100 p-3">
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

      {tab === 'forecast' && <ForecastTab />}
      {tab === 'profit-loss' && <ProfitLossTab />}
    </>
  );
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

const formatDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// Local-time YYYY-MM-DD (toISOString would shift the day for users ahead of UTC).
const toDayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dateInputClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

function ForecastTab() {
  const now = new Date();
  const [startDate, setStartDate] = useState(() => toDayString(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(() => toDayString(new Date(now.getFullYear(), now.getMonth() + 6, 0)));
  const [report, setReport] = useState<SalesForecastReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await reportsApi.getForecast({ startDate, endDate }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to load the sales forecast.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const t = report?.totals;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Expected close from</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={dateInputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateInputClass} />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : report && t ? (
        <>
          <p className="mb-4 text-xs text-slate-400">
            Open deals are placed in the month of their expected close date. Weighted value is each deal&apos;s value
            multiplied by its win probability. Won counts deals closed as won within the range.
          </p>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open Pipeline"
              value={formatCurrency(t.pipeline)}
              change={`${t.openDeals} deal${t.openDeals === 1 ? '' : 's'} expected to close`}
            />
            <StatCard label="Weighted Forecast" value={formatCurrency(t.weighted)} change="Value × probability" />
            <StatCard label="Won" value={formatCurrency(t.won)} changeType="positive" change="Closed-won in range" />
            <StatCard
              label="Past Close Date"
              value={formatCurrency(t.slippedValue)}
              changeType={t.slippedCount > 0 ? 'negative' : 'neutral'}
              change={`${t.slippedCount} open deal${t.slippedCount === 1 ? '' : 's'} slipped`}
            />
          </div>

          {t.undatedCount > 0 && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t.undatedCount} open deal{t.undatedCount === 1 ? ' has' : 's have'} no expected close date (
              {formatCurrency(t.undatedValue)}) and {t.undatedCount === 1 ? 'is' : 'are'} left out of this forecast. Add a
              date on the Deals page to include {t.undatedCount === 1 ? 'it' : 'them'}.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Forecast by Month" className="lg:col-span-2">
              {report.monthly.every((m) => m.pipeline === 0 && m.won === 0) ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No open deals are expected to close in this range, and none were won.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={report.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      width={56}
                      tickFormatter={(v) => new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(v))}
                    />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend />
                    <Bar dataKey="pipeline" name="Open pipeline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weighted" name="Weighted" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Line type="linear" dataKey="won" name="Won" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="By Stage">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="pb-3 pr-4">Stage</th>
                      <th className="pb-3 pr-4">Deals</th>
                      <th className="pb-3 pr-4">Pipeline</th>
                      <th className="pb-3">Weighted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byStage.map((s) => (
                      <tr key={s.stage}>
                        <td className="py-3 pr-4"><StatusBadge status={s.stage} /></td>
                        <td className="py-3 pr-4 text-slate-600">{s.count}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatCurrency(s.pipeline)}</td>
                        <td className="py-3 font-medium text-slate-900">{formatCurrency(s.weighted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="By Owner">
              {report.byOwner.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No deals in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        <th className="pb-3 pr-4">Owner</th>
                        <th className="pb-3 pr-4">Deals</th>
                        <th className="pb-3 pr-4">Weighted</th>
                        <th className="pb-3">Won</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.byOwner.map((o) => (
                        <tr key={o.owner}>
                          <td className="py-3 pr-4 font-medium text-slate-900">{o.owner}</td>
                          <td className="py-3 pr-4 text-slate-600">{o.count}</td>
                          <td className="py-3 pr-4 text-slate-600">{formatCurrency(o.weighted)}</td>
                          <td className="py-3 text-emerald-600">{formatCurrency(o.won)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {report.slipped.length > 0 && (
              <Card title="Past Expected Close Date" className="lg:col-span-2">
                <p className="mb-3 text-xs text-slate-400">
                  Open deals whose expected close date has passed, oldest first
                  {t.slippedCount > report.slipped.length ? ` (showing ${report.slipped.length} of ${t.slippedCount})` : ''}.
                  Update their dates or stages on the Deals page so they count again.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        <th className="pb-3 pr-4">Deal</th>
                        <th className="pb-3 pr-4">Stage</th>
                        <th className="pb-3 pr-4">Owner</th>
                        <th className="pb-3 pr-4">Expected close</th>
                        <th className="pb-3">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.slipped.map((d) => (
                        <tr key={d.id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-900">{d.title}</p>
                            <p className="text-xs text-slate-500">{d.client}</p>
                          </td>
                          <td className="py-3 pr-4"><StatusBadge status={d.stage} /></td>
                          <td className="py-3 pr-4 text-slate-600">{d.owner}</td>
                          <td className="py-3 pr-4 text-red-500">{formatDay(d.expectedCloseDate)}</td>
                          <td className="py-3 text-slate-900">{formatCurrency(d.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
      ) : null}
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

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

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
