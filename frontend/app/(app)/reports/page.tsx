'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { PeriodSelect } from '@/components/ui/analytics';
import { getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { isModuleEnabled, type ModuleKey } from '@/lib/modules';
import { cn } from '@/lib/utils';
import OverviewStep, { PERIODS } from '@/components/reports/overview-step';
import ForecastStep from '@/components/reports/forecast-step';
import ProfitLossStep from '@/components/reports/profit-loss-step';
import MarketingStep from '@/components/reports/marketing-step';
import LeadSourcesStep from '@/components/reports/lead-sources-step';

// Every report and analytics view on one page, walked through as wizard
// steps. Each step is also linkable as /reports?step=<id>.
const STEPS = [
  { id: 'overview', label: 'Overview', hint: 'Pipeline, leads and money at a glance', permission: 'reports:view', modules: ['deals'] },
  { id: 'forecast', label: 'Sales Forecast', hint: 'Expected closes by month', permission: 'reports:view', modules: ['deals'] },
  { id: 'profit-loss', label: 'Profit & Loss', hint: 'Revenue, expenses and net profit', permission: 'reports:view', modules: ['invoices', 'finance'] },
  { id: 'marketing', label: 'Marketing Analytics', hint: 'Campaign reach and conversions', permission: 'marketing:view', modules: ['marketing'] },
  { id: 'lead-sources', label: 'Lead Sources', hint: 'Where leads come from and convert', permission: 'leads:read', modules: [] },
] as const;

type StepId = (typeof STEPS)[number]['id'];

// Steps whose content follows the header's period dropdown.
const PERIOD_STEPS: StepId[] = ['overview', 'marketing'];

function ReportsWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<ReturnType<typeof getStoredUser> | undefined>(undefined);
  const [period, setPeriod] = useState('month');
  const [visited, setVisited] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const steps = useMemo(() => (user === undefined ? [] : STEPS.filter((s) => (s.modules as readonly ModuleKey[]).every((m) => isModuleEnabled(m)) && hasPermission(user, s.permission))), [user]);
  const requested = searchParams.get('step');
  const current = steps.find((s) => s.id === requested) || steps[0];
  const index = current ? steps.indexOf(current) : -1;

  useEffect(() => {
    if (current) setVisited((v) => (v.has(current.id) ? v : new Set(v).add(current.id)));
  }, [current]);

  const go = (id: string) => {
    router.replace(`${pathname}?step=${id}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (user === undefined) return <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>;

  if (!current) {
    return (
      <>
        <PageHeader title="Reports & Analytics" description="Sales performance, pipeline analysis, and financial insights." />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 shadow-xs">
          Your role doesn&apos;t include any reports. Contact your administrator if you need access.
        </div>
      </>
    );
  }

  const prev = steps[index - 1];
  const next = steps[index + 1];

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Sales performance, pipeline analysis, and financial insights."
        actions={
          <>
            {PERIOD_STEPS.includes(current.id) && <PeriodSelect value={period} onChange={setPeriod} options={PERIODS} className="min-w-36" />}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[var(--primary)] shadow-2xs transition-colors hover:bg-slate-50"
              title="Print or save this report as PDF"
            >
              <ArrowDownTrayIcon className="h-4 w-4" /> Export
            </button>
          </>
        }
      />

      {/* Wizard steps */}
      <nav aria-label="Report steps" className="no-print mb-6 border-b border-slate-200">
        <ol className="-mb-px flex gap-1 overflow-x-auto">
          {steps.map((s, i) => {
            const active = s.id === current.id;
            const done = !active && visited.has(s.id);
            return (
              <li key={s.id} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active ? 'step' : undefined}
                  title={s.hint}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors',
                    active ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-slate-600 hover:text-slate-900'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                      active ? 'bg-[var(--primary)] text-white' : done ? 'bg-blue-50 text-[var(--primary)]' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5 stroke-[3]" /> : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < steps.length - 1 && <span className="mx-1 hidden h-px w-6 bg-slate-200 md:block" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </nav>

      {current.id === 'overview' && <OverviewStep period={period} onPeriodChange={setPeriod} onOpenProfitLoss={() => go('profit-loss')} />}
      {current.id === 'forecast' && <ForecastStep />}
      {current.id === 'profit-loss' && <ProfitLossStep />}
      {current.id === 'marketing' && <MarketingStep period={period} onPeriodChange={setPeriod} />}
      {current.id === 'lead-sources' && <LeadSourcesStep />}

      <div className="no-print mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
        {prev ? (
          <button
            type="button"
            onClick={() => go(prev.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            <ArrowLeftIcon className="h-4 w-4" /> {prev.label}
          </button>
        ) : (
          <span />
        )}
        <span className="text-xs font-medium text-slate-500">
          Step {index + 1} of {steps.length}
        </span>
        {next ? (
          <button
            type="button"
            onClick={() => go(next.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--primary-hover)]"
          >
            Next: {next.label} <ArrowRightIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go(steps[0].id)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            Back to {steps[0].label}
          </button>
        )}
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>}>
      <ReportsWizard />
    </Suspense>
  );
}
