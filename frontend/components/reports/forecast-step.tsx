'use client';

import { useCallback, useEffect, useState } from 'react';
import { BanknotesIcon, ScaleIcon, TrophyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StatusBadge from '@/components/ui/status-badge';
import { KpiCard, Panel } from '@/components/ui/analytics';
import { reportsApi, SalesForecastReport } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { dateInputClass, formatDay, monthLabel, toDayString } from './report-utils';

export default function ForecastStep() {
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
            <KpiCard
              label="Open Pipeline"
              value={formatCurrency(t.pipeline)}
              icon={<BanknotesIcon className="h-6 w-6" />}
              caption={`${t.openDeals} deal${t.openDeals === 1 ? '' : 's'} expected to close`}
            />
            <KpiCard label="Weighted Forecast" value={formatCurrency(t.weighted)} icon={<ScaleIcon className="h-6 w-6" />} tone="violet" caption="Value × probability" />
            <KpiCard label="Won" value={formatCurrency(t.won)} icon={<TrophyIcon className="h-6 w-6" />} tone="emerald" caption="Closed-won in range" />
            <KpiCard
              label="Past Close Date"
              value={formatCurrency(t.slippedValue)}
              icon={<ExclamationTriangleIcon className="h-6 w-6" />}
              tone={t.slippedCount > 0 ? 'rose' : 'amber'}
              caption={`${t.slippedCount} open deal${t.slippedCount === 1 ? '' : 's'} slipped`}
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
            <Panel title="Forecast by Month" className="lg:col-span-2">
              {report.monthly.every((m) => m.pipeline === 0 && m.won === 0) ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No open deals are expected to close in this range, and none were won.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={report.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      width={56}
                      tickFormatter={(v) => new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(v))}
                    />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
                    <Bar dataKey="pipeline" name="Open pipeline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weighted" name="Weighted" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Line type="linear" dataKey="won" name="Won" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="By Stage">
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
            </Panel>

            <Panel title="By Owner">
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
            </Panel>

            {report.slipped.length > 0 && (
              <Panel title="Past Expected Close Date" className="lg:col-span-2">
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
              </Panel>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}

