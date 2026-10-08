'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowTopRightOnSquareIcon, FunnelIcon, InboxArrowDownIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import DateRangePicker, { DateRange, presetRange } from '@/components/sales/date-range';
import { LeadSourceReport, salesApi } from '@/lib/api';
import { leadSourceLabel } from '@/lib/lead-options';

// Where leads come from: 99acres, MagicBricks, Housing.com, Facebook, walk-ins...
// with how many of each turned into qualified and converted leads.

const COLORS = ['#0066ff', '#f59e0b', '#10b981', '#6366f1', '#38bdf8', '#ec4899', '#06b6d4', '#8b5cf6', '#84cc16', '#f97316'];
const TOP_IN_TREND = 5;

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function LeadSourcesPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));
  const [data, setData] = useState<LeadSourceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    salesApi
      .getLeadSources(range)
      .then((res) => !cancelled && (setData(res), setError(null)))
      .catch((err) => !cancelled && setError(err.message || 'Could not load lead sources.'));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const bars = useMemo(
    () => (data?.bySource || []).map((s, i) => ({ name: leadSourceLabel(s.source), leads: s.total, converted: s.converted, color: COLORS[i % COLORS.length] })),
    [data]
  );

  // Daily leads for the biggest sources, everything else grouped as "Others".
  const trend = useMemo(() => {
    if (!data) return { rows: [] as any[], keys: [] as string[] };
    const top = data.bySource.slice(0, TOP_IN_TREND);
    const rest = data.bySource.slice(TOP_IN_TREND);
    const keys = [...top.map((s) => leadSourceLabel(s.source)), ...(rest.length ? ['Others'] : [])];
    const rows = data.days.map((d, i) => {
      const row: Record<string, string | number> = { label: shortDay(d) };
      top.forEach((s) => (row[leadSourceLabel(s.source)] = s.daily[i]));
      if (rest.length) row.Others = rest.reduce((n, s) => n + s.daily[i], 0);
      return row;
    });
    return { rows, keys };
  }, [data]);

  const best = data?.bySource.filter((s) => s.total >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0];
  const converted = data?.bySource.reduce((n, s) => n + s.converted, 0) || 0;
  const leadsHref = (source: string) => `/leads?leadSource=${encodeURIComponent(source)}&dateFrom=${data?.from}&dateTo=${data?.to}`;

  return (
    <>
      <PageHeader title="Lead Sources" description="Which portals and channels your leads come from, and which ones convert" />

      <div className="mb-4"><DateRangePicker value={range} onChange={setRange} /></div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data && !error && <div className="flex justify-center py-16"><LoadingSpinner /></div>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Leads captured" value={data.total} icon={<InboxArrowDownIcon className="h-5 w-5" />} />
            <StatCard label="Sources" value={data.bySource.length} icon={<FunnelIcon className="h-5 w-5" />} tone="indigo" />
            <StatCard label="Converted" value={converted} change={data.total ? `${((converted / data.total) * 100).toFixed(1)}% of leads` : undefined} icon={<TrophyIcon className="h-5 w-5" />} tone="emerald" />
            <StatCard
              label="Best converting"
              value={best ? leadSourceLabel(best.source) : '—'}
              change={best ? `${best.conversionRate}% converted` : 'Needs 3+ leads per source'}
              icon={<TrophyIcon className="h-5 w-5" />}
              tone="amber"
            />
          </div>

          {data.total === 0 ? (
            <Card><p className="py-10 text-center text-sm text-slate-400">No leads captured in this period.</p></Card>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
                <Card title="Leads by source" className="lg:col-span-2">
                  <div style={{ height: Math.max(200, bars.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bars} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="leads" name="Leads" fill="#0066ff" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="converted" name="Converted" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Leads per day" className="lg:col-span-3">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend.rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={16} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {trend.keys.map((k, i) => (
                          <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <Card title="Source performance">
                <div className="-mx-6 -my-6 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="px-6 py-3">Source</th>
                        <th className="px-3 py-3 text-right">Leads</th>
                        <th className="px-3 py-3">Share</th>
                        <th className="px-3 py-3 text-right">Qualified</th>
                        <th className="px-3 py-3 text-right">Converted</th>
                        <th className="px-3 py-3 text-right">Conversion</th>
                        <th className="px-3 py-3 text-right">Lost</th>
                        <th className="px-3 py-3 text-right">Unassigned</th>
                        <th className="px-6 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.bySource.map((s, i) => (
                        <tr key={s.source} className="hover:bg-slate-50/60">
                          <td className="px-6 py-3">
                            <span className="flex items-center gap-2 font-semibold text-slate-900">
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              {leadSourceLabel(s.source)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-slate-900">{s.total}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${s.share}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{s.share}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">{s.qualified}</td>
                          <td className="px-3 py-3 text-right text-emerald-700">{s.converted}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-700">{s.conversionRate}%</td>
                          <td className="px-3 py-3 text-right text-rose-600">{s.lost}</td>
                          <td className="px-3 py-3 text-right text-slate-500">{s.unassigned}</td>
                          <td className="px-6 py-3 text-right">
                            <Link href={leadsHref(s.source)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline">
                              View leads <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
