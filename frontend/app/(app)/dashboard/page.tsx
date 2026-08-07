'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import { leadsApi, dealsApi, contactsApi, campaignsApi, tasksApi, getStoredUser } from '@/lib/api';
import {
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ChartBarIcon,
  MegaphoneIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function DashboardPage() {
  const [userName, setUserName] = useState('there');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalDeals: 0,
    totalContacts: 0,
    conversionRate: 0,
    pipelineValue: 0,
    activeCampaigns: 0,
    tasksDue: 0,
  });
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ stage: string; count: number }[]>([]);
  const [leadsByStatus, setLeadsByStatus] = useState<{ status: string; count: number }[]>([]);
  const [leadsBySource, setLeadsBySource] = useState<{ source: string; count: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ id: string; type: string; title: string; description: string }[]>([]);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.firstName) setUserName(user.firstName);

    async function loadDashboardData() {
      setLoading(true);
      setError(null);
      try {
        const [leadStats, dealStats, contactStats, campaignStats, leadsRes, tasksRes] = await Promise.allSettled([
          leadsApi.getStats(),
          dealsApi.getStats(),
          contactsApi.getStats(),
          campaignsApi.getStats(),
          leadsApi.getLeads({ limit: 5 }),
          tasksApi.getTasks({ status: 'pending' }),
        ]);

        const nextStats = { ...stats };
        if (leadStats.status === 'fulfilled') {
          nextStats.totalLeads = leadStats.value.totalLeads || 0;
          if (leadStats.value.leadsByStatus?.length > 0) {
            setLeadsByStatus(
              leadStats.value.leadsByStatus.map((s: any) => ({
                status: s.status,
                count: Number(s.count ?? s.dataValues?.count) || 0,
              }))
            );
          }
          if (leadStats.value.leadsBySource?.length > 0) {
            setLeadsBySource(
              leadStats.value.leadsBySource.map((s: any) => ({
                source: s.leadSource,
                count: Number(s.count ?? s.dataValues?.count) || 0,
              }))
            );
          }
        }
        if (dealStats.status === 'fulfilled') {
          nextStats.totalDeals = dealStats.value.totalDeals || 0;
          nextStats.pipelineValue = dealStats.value.totalValue || 0;
          nextStats.conversionRate = Math.round(dealStats.value.winRate || 0);
          if (dealStats.value.dealsByStage?.length > 0) {
            setPipelineStages(
              dealStats.value.dealsByStage.map((s: any) => ({ stage: s.stage, count: Number(s.count) || 0 }))
            );
          }
        }
        if (contactStats.status === 'fulfilled') nextStats.totalContacts = contactStats.value.totalContacts || 0;
        if (campaignStats.status === 'fulfilled') nextStats.activeCampaigns = campaignStats.value.activeCampaigns || 0;
        if (tasksRes.status === 'fulfilled') nextStats.tasksDue = tasksRes.value.tasks?.length || 0;

        setStats(nextStats);

        const activity: { id: string; type: string; title: string; description: string }[] = [];
        if (leadsRes.status === 'fulfilled' && leadsRes.value?.leads?.length > 0) {
          setRecentLeads(leadsRes.value.leads.slice(0, 5));
          leadsRes.value.leads.slice(0, 3).forEach((lead: any) => {
            const name = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'A lead';
            activity.push({ id: `lead-${lead.id}`, type: 'lead', title: 'Lead in pipeline', description: `${name} — ${lead.company || 'No company'}` });
          });
        }
        if (tasksRes.status === 'fulfilled' && tasksRes.value?.tasks?.length > 0) {
          tasksRes.value.tasks.slice(0, 2).forEach((task: any) => {
            activity.push({ id: `task-${task.id}`, type: 'task', title: 'Task pending', description: task.title });
          });
        }
        setRecentActivity(activity);
      } catch (err: any) {
        setError('Some dashboard data failed to load. Is the backend running?');
        console.warn('Dashboard load error', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activityColor: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-600',
    deal: 'bg-emerald-100 text-emerald-600',
    campaign: 'bg-purple-100 text-purple-600',
    meeting: 'bg-amber-100 text-amber-600',
    task: 'bg-slate-100 text-slate-600',
  };

  // Consistent palette across all dashboard charts.
  const CHART_COLORS = ['#168eea', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'];

  const formatLabel = (value: string) =>
    (value || 'Unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${userName}. Here's what's happening today.`}
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Leads" value={stats.totalLeads.toLocaleString()} icon={<ClipboardDocumentListIcon className="h-5 w-5" />} />
        <StatCard label="Active Deals" value={stats.totalDeals} icon={<CurrencyDollarIcon className="h-5 w-5" />} />
        <StatCard label="Contacts" value={stats.totalContacts.toLocaleString()} icon={<UserGroupIcon className="h-5 w-5" />} />
        <StatCard label="Win Rate" value={`${stats.conversionRate}%`} icon={<ChartBarIcon className="h-5 w-5" />} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pipeline Value" value={formatCurrency(stats.pipelineValue)} />
        <StatCard label="Active Campaigns" value={stats.activeCampaigns} icon={<MegaphoneIcon className="h-5 w-5" />} />
        <StatCard label="Tasks Due" value={stats.tasksDue} icon={<CheckCircleIcon className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Recent Activity" className="lg:col-span-2">
          <div className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No recent activity yet.</p>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 rounded-md border-2 border-slate-100 p-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${activityColor[activity.type]}`}>
                    {activity.type.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                    <p className="text-xs text-slate-500">{activity.description}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Pipeline Overview">
          {pipelineStages.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No deals yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineStages.map((s) => ({ ...s, label: formatLabel(s.stage) }))} margin={{ left: -20 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#168eea" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <Link href="/deals" className="block pt-2 text-center text-sm font-medium text-[#168eea] hover:underline">
            View full pipeline
          </Link>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Leads by Status">
          {leadsByStatus.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No lead data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={leadsByStatus.map((s) => ({ name: formatLabel(s.status), value: s.count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.name} (${entry.value})`}
                >
                  {leadsByStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Leads by Source">
          {leadsBySource.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No lead data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={leadsBySource.map((s) => ({ name: formatLabel(s.source), value: s.count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.name} (${entry.value})`}
                >
                  {leadsBySource.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Recent Leads"
          action={
            <Link href="/leads" className="text-sm font-medium text-[#168eea] hover:underline">
              View all
            </Link>
          }
        >
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : recentLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No leads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Company</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Score</th>
                    <th className="pb-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLeads.map((lead) => {
                    const leadName = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed';
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-900">{leadName}</p>
                          <p className="text-xs text-slate-500">{lead.email || 'No email'}</p>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{lead.company || '—'}</td>
                        <td className="py-3 pr-4"><StatusBadge status={lead.status} /></td>
                        <td className="py-3 pr-4 text-slate-600">{lead.score || 0}</td>
                        <td className="py-3 text-slate-600">{formatCurrency(lead.value || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
