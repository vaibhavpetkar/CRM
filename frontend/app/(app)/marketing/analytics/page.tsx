'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { campaignsApi } from '@/lib/api';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

export default function MarketingAnalyticsPage() {
  const [dateRange, setDateRange] = useState('this-month');
  const [stats, setStats] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, campaignsRes] = await Promise.all([
        campaignsApi.getStats(),
        campaignsApi.getCampaigns(),
      ]);
      setStats(statsRes);
      setCampaigns(campaignsRes.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics. Is the backend running?');
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
        title="Marketing Analytics"
        description="Track campaign performance and ROI"
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
            <StatCard label="Total Reach" value={(stats?.sent ?? 0).toLocaleString()} />
            <StatCard label="Open Rate" value={`${stats?.openRate ?? 0}%`} changeType="positive" />
            <StatCard label="Click Rate" value={`${stats?.clickRate ?? 0}%`} changeType="positive" />
            <StatCard label="Conversion Rate" value={`${stats?.conversionRate ?? 0}%`} changeType="positive" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Campaign Performance">
              <div className="space-y-4">
                {campaigns.filter((c) => c.sent > 0).length === 0 ? (
                  <p className="text-sm text-slate-400">No campaign data yet — send a campaign to see performance here.</p>
                ) : (
                  campaigns
                    .filter((c) => c.sent > 0)
                    .map((campaign) => {
                      const openRate = campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
                      return (
                        <div key={campaign.id}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-900">{campaign.name}</span>
                            <span className="text-slate-500">{openRate}% open rate</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-[#168eea]" style={{ width: `${openRate}%` }} />
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </Card>

            <Card title="Campaigns by Channel">
              <div className="space-y-4">
                {['email', 'sms'].map((channel) => {
                  const channelCampaigns = campaigns.filter((c) => c.type === channel);
                  const percentage = campaigns.length > 0 ? Math.round((channelCampaigns.length / campaigns.length) * 100) : 0;
                  return (
                    <div key={channel}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium capitalize text-slate-900">{channel}</span>
                        <span className="text-slate-500">{channelCampaigns.length} campaign{channelCampaigns.length === 1 ? '' : 's'} &middot; {percentage}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${channel === 'email' ? 'bg-[#168eea]' : 'bg-emerald-500'}`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
