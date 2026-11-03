'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/button';
import { IntegrationActivity, salesApi } from '@/lib/api';
import { when } from './portal-setup';

const RESULT: Record<string, { label: string; className: string }> = {
  created: { label: 'New lead', className: 'bg-emerald-50 text-emerald-700' },
  duplicate: { label: 'Existing lead', className: 'bg-blue-50 text-blue-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-600' },
  processing: { label: 'Processing', className: 'bg-slate-100 text-slate-600' },
};

/** The leads an integration brought in, newest first, with totals and sub sources. */
export default function IntegrationActivityPanel({ appKey, refreshKey }: { appKey: string; refreshKey: number }) {
  const [data, setData] = useState<IntegrationActivity | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [appKey]);
  useEffect(() => {
    let live = true;
    salesApi
      .getIntegrationActivity(appKey, { page, limit: 20 })
      .then((d) => live && (setData(d), setError(null)))
      .catch((err) => live && setError(err.message || 'Could not load activity.'));
    return () => {
      live = false;
    };
  }, [appKey, page, refreshKey]);

  if (error) return <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading...</p>;

  const stat = (label: string, value: number) => (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Leads created', data.stats.leads)}
        {stat('Today', data.stats.today)}
        {stat('Last 7 days', data.stats.last7Days)}
        {stat('Last 30 days', data.stats.last30Days)}
      </div>

      {data.bySubSource.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">By sub source</p>
          <div className="flex flex-wrap gap-1.5">
            {data.bySubSource.map((s) => (
              <span key={s.subSource} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {s.subSource} <span className="font-semibold">{s.leads}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No leads from this app yet. Follow the steps above, then send a test lead.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Lead</th>
                <th className="py-2 pr-3 font-medium">Mobile</th>
                <th className="py-2 pr-3 font-medium">Sub source</th>
                <th className="py-2 pr-3 font-medium">Assigned to</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((r) => (
                <tr key={r.eventId}>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{when(r.at)}</td>
                  <td className="py-2 pr-3">
                    {r.leadId ? (
                      <Link href={`/leads/${r.leadId}`} className="font-medium text-slate-800 hover:text-[var(--primary)] hover:underline">
                        {r.name || r.leadNumber || `Lead #${r.leadId}`}
                      </Link>
                    ) : (
                      <span className="text-slate-700">{r.name || '—'}</span>
                    )}
                    {r.leadNumber && <span className="ml-1 text-[11px] text-slate-400">{r.leadNumber}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{r.mobile || '—'}</td>
                  <td className="py-2 pr-3 text-slate-600">{r.subSource || '—'}</td>
                  <td className="py-2 pr-3 text-slate-600">{r.assignedTo || '—'}</td>
                  <td className="py-2 pr-3 capitalize text-slate-600">{r.leadStatus || '—'}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RESULT[r.result]?.className || ''}`} title={r.error || undefined}>
                      {RESULT[r.result]?.label || r.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {data.page} of {data.pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
