'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MegaphoneIcon,
  EnvelopeIcon,
  CursorArrowRaysIcon,
  ViewfinderCircleIcon,
  ChartBarIcon,
  ChartPieIcon,
  DocumentTextIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StatusBadge from '@/components/ui/status-badge';
import { EmptyState, KpiCard, Panel, PanelLink, PeriodSelect } from '@/components/ui/analytics';
import { campaignsApi } from '@/lib/api';
import { PERIODS, periodStart } from './overview-step';

const CHANNEL_COLORS: Record<string, string> = { email: '#0a6cf5', sms: '#10b981', social: '#8b5cf6' };

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function CreateCampaign() {
  return (
    <Link
      href="/marketing/campaigns"
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--primary-hover)]"
    >
      Create Campaign
    </Link>
  );
}

function PlusBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-white ring-2 ring-white">
      <PlusIcon className="h-4 w-4 stroke-[2.5]" />
    </span>
  );
}

export default function MarketingStep({ period, onPeriodChange }: { period: string; onPeriodChange: (p: string) => void }) {
  const p = PERIODS.find((x) => x.value === period) || PERIODS[0];
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await campaignsApi.getCampaigns();
      setCampaigns(res.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Campaigns that started (or were created) within the selected period.
  const inPeriod = useMemo(() => {
    const from = periodStart(p.value).getTime();
    return campaigns.filter((c) => new Date(c.startDate || c.createdAt).getTime() >= from);
  }, [campaigns, p.value]);

  const totals = useMemo(() => {
    const t = inPeriod.reduce(
      (acc, c) => ({
        sent: acc.sent + (Number(c.sent) || 0),
        opened: acc.opened + (Number(c.opened) || 0),
        clicked: acc.clicked + (Number(c.clicked) || 0),
        converted: acc.converted + (Number(c.converted) || 0),
      }),
      { sent: 0, opened: 0, clicked: 0, converted: 0 }
    );
    return { ...t, openRate: rate(t.opened, t.sent), clickRate: rate(t.clicked, t.sent), conversionRate: rate(t.converted, t.sent) };
  }, [inPeriod]);

  const performance = useMemo(
    () =>
      inPeriod
        .filter((c) => Number(c.sent) > 0)
        .sort((a, b) => Number(b.sent) - Number(a.sent))
        .slice(0, 6)
        .map((c) => ({ name: c.name, Reach: Number(c.sent) || 0, Opens: Number(c.opened) || 0, Clicks: Number(c.clicked) || 0, Conversions: Number(c.converted) || 0 })),
    [inPeriod]
  );

  const channels = useMemo(() => {
    const by: Record<string, number> = {};
    inPeriod.forEach((c) => (by[c.type || 'email'] = (by[c.type || 'email'] || 0) + (Number(c.sent) || 0)));
    return Object.entries(by)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => ({ name: type.charAt(0).toUpperCase() + type.slice(1), value: n, color: CHANNEL_COLORS[type] || '#f59e0b' }));
  }, [inPeriod]);

  const recent = useMemo(
    () => campaigns.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [campaigns]
  );

  if (loading) return <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>;

  const periodPick = <PeriodSelect value={period} onChange={onPeriodChange} options={PERIODS} />;

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Reach" value={totals.sent.toLocaleString()} caption="Across all campaigns" icon={<MegaphoneIcon className="h-6 w-6" />} tone="blue" bars href="/marketing/campaigns" />
        <KpiCard label="Open Rate" value={`${totals.openRate}%`} caption="Email campaign opens" icon={<EnvelopeIcon className="h-6 w-6" />} tone="cyan" bars href="/marketing/email" />
        <KpiCard label="Click Rate" value={`${totals.clickRate}%`} caption="Campaign click-through rate" icon={<CursorArrowRaysIcon className="h-6 w-6" />} tone="violet" bars href="/marketing/campaigns" />
        <KpiCard label="Conversion Rate" value={`${totals.conversionRate}%`} caption="Leads converted from campaigns" icon={<ViewfinderCircleIcon className="h-6 w-6" />} tone="orange" bars href="/marketing/campaigns" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Campaign Performance" subtitle="Track reach, opens, clicks and conversions over time." action={periodPick}>
          {performance.length === 0 ? (
            <EmptyState
              icon={<><ChartBarIcon className="h-10 w-10" /><PlusBadge /></>}
              title="No campaign data yet"
              text="Create a campaign to start seeing performance analytics."
              action={<CreateCampaign />}
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performance} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Reach" fill="#0a6cf5" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Opens" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Clicks" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Conversions" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Channel Performance" subtitle="Compare performance across marketing channels." action={periodPick}>
          {channels.length === 0 ? (
            <EmptyState
              icon={<><ChartPieIcon className="h-10 w-10" /><PlusBadge /></>}
              title="No channel data yet"
              text="Run campaigns across different channels to see performance breakdown."
              action={<CreateCampaign />}
            />
          ) : (
            <div className="flex h-64 items-center gap-6">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={channels} dataKey="value" innerRadius="50%" outerRadius="100%" stroke="none">
                      {channels.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 text-xs">
                {channels.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                    <span className="text-slate-500">
                      {c.value.toLocaleString()} ({rate(c.value, totals.sent)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent Campaigns" subtitle="Your latest marketing campaigns and their performance." action={<PanelLink href="/marketing/campaigns">View All</PanelLink>} bodyClassName="px-0 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Campaign Name</th>
                <th className="px-3 py-2.5">Channel</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Reach</th>
                <th className="px-3 py-2.5">Opens</th>
                <th className="px-3 py-2.5">Clicks</th>
                <th className="px-3 py-2.5">Conversions</th>
                <th className="px-5 py-2.5">Created On</th>
              </tr>
            </thead>
            {recent.length > 0 && (
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recent.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-2.5 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-3 py-2.5 capitalize">{c.type || 'email'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={c.status || 'draft'} /></td>
                    <td className="px-3 py-2.5">{(Number(c.sent) || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5">{(Number(c.opened) || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5">{(Number(c.clicked) || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5">{(Number(c.converted) || 0).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-slate-500">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {recent.length === 0 && (
          <EmptyState
            icon={<DocumentTextIcon className="h-9 w-9" />}
            title="No campaigns yet"
            text="Create your first marketing campaign to see it here."
            action={<CreateCampaign />}
          />
        )}
      </Panel>
    </div>
  );
}
