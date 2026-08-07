'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { campaignsApi } from '@/lib/api';
import { PlusIcon, EnvelopeIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';

export default function EmailMarketingPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignsRes, statsRes] = await Promise.all([
        campaignsApi.getCampaigns({ status: 'all' }),
        campaignsApi.getStats().catch(() => null),
      ]);
      setCampaigns((campaignsRes.campaigns || []).filter((c: any) => c.type === 'email'));
      setStats(statsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load email campaigns. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <>
      <PageHeader
        title="Email Marketing"
        description="Send targeted email campaigns to your contacts"
        actions={
          <Link href="/marketing/campaigns">
            <Button size="sm"><PlusIcon className="h-4 w-4" /> Compose Email</Button>
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Emails Sent (Total)" value={(stats?.sent ?? 0).toLocaleString()} icon={<EnvelopeIcon className="h-5 w-5" />} />
        <StatCard label="Open Rate" value={`${stats?.openRate ?? 0}%`} changeType="positive" />
        <StatCard label="Click Rate" value={`${stats?.clickRate ?? 0}%`} changeType="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Recent Email Campaigns">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><LoadingSpinner size="md" /></div>
          ) : campaigns.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No email campaigns yet.{' '}
              <Link href="/marketing/campaigns" className="font-medium text-[#168eea] hover:underline">Create one</Link>.
            </p>
          ) : (
            <div className="space-y-3">
              {campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between rounded-md border-2 border-slate-100 p-3">
                  <div className="flex items-center gap-3">
                    <EnvelopeIcon className="h-5 w-5 text-[#168eea]" />
                    <span className="text-sm font-medium text-slate-900">{campaign.name}</span>
                  </div>
                  <span className="text-xs capitalize text-slate-400">{campaign.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/marketing/campaigns" className="rounded-md border-2 border-slate-200 p-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              New Campaign
            </Link>
            <Link href="/marketing/templates" className="rounded-md border-2 border-slate-200 p-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Browse Templates
            </Link>
            <Link href="/contacts" className="rounded-md border-2 border-slate-200 p-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Import List
            </Link>
            <Link href="/marketing/analytics" className="rounded-md border-2 border-slate-200 p-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View Analytics
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="SMS Marketing">
          <div className="flex items-center gap-4">
            <DevicePhoneMobileIcon className="h-8 w-8 text-[#168eea]" />
            <div>
              <p className="text-sm font-medium text-slate-900">SMS campaigns</p>
              <p className="text-xs text-slate-500">Create an SMS-type campaign from the Campaigns page to get started</p>
            </div>
            <Link href="/marketing/campaigns" className="ml-auto">
              <Button variant="secondary" size="sm">Go to Campaigns</Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
