'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/button';
import PlanPicker from './plan-picker';
import { getStoredUser, removeAuthToken, subscriptionApi, type Subscription } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const BANNER_STYLES = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

/**
 * Shows the company's trial / payment alert above every page, and replaces
 * the app with a renewal screen when the company is locked (trial over,
 * unpaid past the grace period, or blocked).
 */
export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    subscriptionApi
      .get()
      .then(setSubscription)
      .catch(() => {
        // Backend unavailable: don't block the app over the banner.
      });
  }, []);

  if (subscription?.locked) {
    const signOut = () => {
      removeAuthToken();
      router.push('/login');
    };
    return (
      <div className="mx-auto max-w-4xl py-6">
        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            {subscription.status === 'blocked' ? 'Your company account is blocked' : 'Your subscription has ended'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{subscription.alert?.message}</p>
          <p className="mt-1 text-sm text-slate-500">Your data is safe and will be available again as soon as the plan is active.</p>
          {subscription.status !== 'blocked' && (
            <div className="mt-6">
              <PlanPicker plans={subscription.plans} currentPlan={subscription.plan} />
            </div>
          )}
          <Button variant="secondary" className="mt-6" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {subscription?.alert && (
        <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm', BANNER_STYLES[subscription.alert.level])}>
          <span>{subscription.alert.message}</span>
          {hasPermission(getStoredUser(), 'company:manage') && (
            <Link href="/settings/subscription" className="font-semibold underline">
              View plans
            </Link>
          )}
        </div>
      )}
      {children}
    </>
  );
}
