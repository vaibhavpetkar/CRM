'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import PlanPicker from '@/components/subscription/plan-picker';
import { subscriptionApi, type Subscription } from '@/lib/api';

const STATUS_LABELS: Record<Subscription['status'], string> = {
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment pending',
  expired: 'Expired',
  blocked: 'Blocked',
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry';

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    subscriptionApi.get().then(setSubscription).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!subscription) return <LoadingSpinner />;

  const rows: [string, string][] = [
    ['Plan', subscription.planName],
    ['Status', STATUS_LABELS[subscription.status]],
    [subscription.status === 'trial' ? 'Trial ends' : 'Paid until', formatDate(subscription.endsAt)],
    ['Users', `${subscription.activeUsers} of ${subscription.maxUsers ?? 'unlimited'}`],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription" description={`Plan and billing for ${subscription.company.name}`} />
      <Card title="Current plan">
        <dl className="grid gap-4 sm:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Plans">
        <p className="mb-4 text-sm text-slate-500">
          Choose a plan and we will contact you to complete payment. Your plan is activated as soon as payment is received.
        </p>
        <PlanPicker plans={subscription.plans} currentPlan={subscription.plan} />
      </Card>
    </div>
  );
}
