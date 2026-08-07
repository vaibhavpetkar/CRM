'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { dealsApi, leadsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

export default function ReportsPage() {
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
        description="Sales performance, pipeline analysis, and team metrics"
        actions={
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
        }
      />

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
  );
}
