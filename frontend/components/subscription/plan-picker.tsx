'use client';

import { useState } from 'react';
import Button from '@/components/ui/button';
import { getStoredUser, subscriptionApi, type SubscriptionPlan } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const formatPrice = (amount: number | null) =>
  amount == null ? 'Custom' : `₹${amount.toLocaleString('en-IN')}`;

/**
 * Plan cards with a "Request" button. There is no online payment yet: a
 * request alerts the platform admin, who collects payment and activates it.
 */
export default function PlanPicker({ plans, currentPlan }: { plans: SubscriptionPlan[]; currentPlan?: string }) {
  const canRequest = hasPermission(getStoredUser(), 'company:manage');
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const request = async (plan: string) => {
    setSending(plan);
    setResult(null);
    try {
      const res = await subscriptionApi.requestPlan(plan);
      setResult({ ok: true, message: res.message });
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message || 'Could not send the request.' });
    } finally {
      setSending(null);
    }
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const current = plan.key === currentPlan;
          return (
            <div
              key={plan.key}
              className={cn(
                'flex flex-col rounded-xl border bg-white p-5',
                current ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-slate-200'
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                {current && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-[var(--primary)]">Current</span>}
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatPrice(plan.priceMonthly)}
                <span className="text-sm font-normal text-slate-500"> / month</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {plan.maxUsers == null ? 'Unlimited users' : `Up to ${plan.maxUsers} users`}
              </p>
              {canRequest && (
                <Button className="mt-4" variant={current ? 'secondary' : 'primary'} disabled={!!sending} onClick={() => request(plan.key)}>
                  {sending === plan.key ? 'Sending...' : current ? 'Renew' : 'Request this plan'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {!canRequest && <p className="mt-4 text-sm text-slate-500">Ask your company administrator to choose a plan.</p>}
      {result && (
        <p className={cn('mt-4 rounded-md border p-3 text-sm', result.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600')}>
          {result.message}
        </p>
      )}
    </div>
  );
}
