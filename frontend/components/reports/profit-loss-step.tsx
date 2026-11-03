'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { KpiCard, Panel } from '@/components/ui/analytics';
import { reportsApi, ProfitLossReport } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { dateInputClass, fillMonths, monthLabel } from './report-utils';
import { ExpenseBreakdown } from './overview-step';

export default function ProfitLossStep() {
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
            className={dateInputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={dateInputClass}
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
            <KpiCard label="Revenue" value={formatCurrency(report.totalRevenue)} icon={<ArrowTrendingUpIcon className="h-6 w-6" />} tone="emerald" caption="Payments collected" />
            <KpiCard label="Expenses" value={formatCurrency(report.totalExpenses)} icon={<ArrowTrendingDownIcon className="h-6 w-6" />} tone="rose" caption="Recorded under Expenses" />
            <KpiCard
              label="Net Profit"
              value={formatCurrency(report.netProfit)}
              icon={<BanknotesIcon className="h-6 w-6" />}
              tone={report.netProfit >= 0 ? 'blue' : 'orange'}
              caption={report.netProfit >= 0 ? 'Revenue minus expenses' : 'Spending more than collected'}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Revenue vs Expenses by Month">
              {report.monthly.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No payments or expenses recorded in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={fillMonths(report.monthly, startDate, endDate).map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
                    <Bar dataKey="revenue" name="Revenue" fill="#0a6cf5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#f05252" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Net Profit Trend">
              {report.monthly.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No data in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={fillMonths(report.monthly, startDate, endDate).map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Line type="monotone" dataKey="net" name="Net Profit" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Expenses by Category" subtitle="Breakdown of expenses by category." className="lg:col-span-2">
              <ExpenseBreakdown categories={report.expensesByCategory} total={report.totalExpenses} />
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
