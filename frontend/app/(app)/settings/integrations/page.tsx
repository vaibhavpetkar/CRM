'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircleIcon, ExclamationCircleIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/solid';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import {
  callsApi,
  googleBusinessApi,
  googleMeetApi,
  IncomingCallSettings,
  integrationsApi,
  IntegrationRow,
  metaLeadsApi,
  MetaLeadsStatus,
  PortalConnectionRow,
  RotationSettings,
  salesApi,
} from '@/lib/api';
import { CATEGORY_LABEL, findIntegration, INTEGRATIONS, IntegrationApp, IntegrationCategory, matchesSearch } from '@/lib/integration-catalog';
import MetaLeadsCard from '@/components/integrations/meta-leads-card';
import CallerNumbersCard from '@/components/integrations/caller-numbers-card';
import LeadRotationCard from '@/components/integrations/lead-rotation-card';
import IncomingCallsCard from '@/components/integrations/incoming-calls-card';
import PortalSetup from '@/components/integrations/portal-setup';
import ImportSetup from '@/components/integrations/import-setup';
import IntegrationActivityPanel from '@/components/integrations/integration-activity';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type GoogleConnectionStatus = { configured: boolean; connected: boolean; lastSyncAt: string | null; lastError: string | null };
type Health = { tone: 'ok' | 'warn' | 'off'; label: string; count?: number };

const FILTERS: { key: 'all' | 'connected' | IntegrationCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'connected', label: 'Connected' },
  { key: 'leads', label: CATEGORY_LABEL.leads },
  { key: 'calling', label: CATEGORY_LABEL.calling },
  { key: 'meetings', label: CATEGORY_LABEL.meetings },
  { key: 'marketing', label: CATEGORY_LABEL.marketing },
];

function AppBadge({ app, size = 'md' }: { app: IntegrationApp; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight',
        size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm',
        app.badge.className
      )}
      aria-hidden
    >
      {app.badge.text}
    </span>
  );
}

function HealthPill({ health }: { health: Health }) {
  if (health.tone === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
        <CheckCircleIcon className="h-4 w-4" /> {health.label}
      </span>
    );
  if (health.tone === 'warn')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
        <ExclamationCircleIcon className="h-4 w-4" /> {health.label}
      </span>
    );
  return <span className="text-[11px] font-medium text-slate-400">{health.label}</span>;
}

export default function IntegrationsSettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailRef = useRef<HTMLDivElement>(null);

  const [portals, setPortals] = useState<PortalConnectionRow[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [metaStatus, setMetaStatus] = useState<MetaLeadsStatus | null>(null);
  const [meetStatus, setMeetStatus] = useState<GoogleConnectionStatus | null>(null);
  const [businessStatus, setBusinessStatus] = useState<GoogleConnectionStatus | null>(null);
  const [rotation, setRotation] = useState<RotationSettings | null>(null);
  const [incoming, setIncoming] = useState<IncomingCallSettings | null>(null);
  const [numbers, setNumbers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const selectedKey = searchParams.get('app');
  const selected = findIntegration(selectedKey);

  const load = useCallback(() => {
    Promise.all([
      salesApi.listPortals().then(setPortals),
      integrationsApi.getIntegrations().then((res) => setIntegrations(res.integrations)),
      metaLeadsApi.getStatus().then(setMetaStatus).catch(() => setMetaStatus(null)),
      googleMeetApi.getStatus().then(setMeetStatus).catch(() => setMeetStatus(null)),
      googleBusinessApi.getStatus().then(setBusinessStatus).catch(() => setBusinessStatus(null)),
      salesApi.getRotation().then(setRotation).catch(() => setRotation(null)),
      salesApi.getIncomingCalls().then(setIncoming).catch(() => setIncoming(null)),
      callsApi.listNumbers().then((r) => setNumbers(r.filter((n) => n.isActive).length)).catch(() => setNumbers(0)),
    ])
      .then(() => setError(null))
      .catch((err) => setError(err.message || 'Failed to load integrations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const open = (key: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set('app', key);
    else params.delete('app');
    router.replace(`/settings/integrations${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };

  useEffect(() => {
    if (selected) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [selected]);

  // OAuth providers send the browser back here after their consent screen.
  useEffect(() => {
    const meet = searchParams.get('googleMeet');
    const business = searchParams.get('googleBusiness');
    const meta = searchParams.get('meta');
    if (!meet && !business && !meta) return;
    if (meet === 'connected') toast.success('Google Meet connected.');
    else if (meet === 'error') toast.error('Could not connect Google Meet. Please try again.');
    if (business === 'connected') toast.success('Google Business Profile connected.');
    else if (business === 'error') toast.error('Could not connect Google Business Profile. Please try again.');
    if (meta === 'connected') toast.success('Facebook connected. Choose which Pages should send leads.');
    else if (meta === 'error') toast.error('Could not connect Facebook. Please try again.');
    load();
    router.replace(`/settings/integrations?app=${meta ? 'meta' : meet ? 'google-meet' : 'google-business'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const portalFor = (key: string) => portals.find((p) => p.source === key);

  const healthOf = (app: IntegrationApp): Health => {
    switch (app.kind) {
      case 'portal': {
        const row = portalFor(app.key);
        if (!row) return { tone: 'off', label: 'Not set up' };
        if (!row.isEnabled) return { tone: 'off', label: 'Switched off' };
        if (row.lastError) return { tone: 'warn', label: 'Needs attention', count: row.leadsReceived };
        if (row.leadsReceived > 0) return { tone: 'ok', label: 'Receiving leads', count: row.leadsReceived };
        if (row.canPull && row.hasCredentials) return { tone: 'ok', label: 'Connected', count: 0 };
        return { tone: 'off', label: 'Not set up' };
      }
      case 'import': {
        const n = portalFor('import')?.leadsReceived || 0;
        return n ? { tone: 'ok', label: 'Imported', count: n } : { tone: 'off', label: 'Ready to use' };
      }
      case 'meta': {
        if (!metaStatus) return { tone: 'off', label: 'Not set up' };
        const pages = metaStatus.pages.filter((p) => p.isSubscribed);
        const count = metaStatus.pages.reduce((n, p) => n + p.leadsReceived, 0);
        if (metaStatus.lastError || pages.some((p) => p.lastError)) return { tone: 'warn', label: 'Needs attention', count };
        if (metaStatus.connected && pages.length) return { tone: 'ok', label: count ? 'Receiving leads' : 'Connected', count };
        if (!metaStatus.configured) return { tone: 'off', label: 'Server setup needed' };
        return { tone: 'off', label: metaStatus.connected ? 'Choose Pages' : 'Not connected' };
      }
      case 'incoming-calls':
        return incoming?.callsLast7Days ? { tone: 'ok', label: `${incoming.callsLast7Days} calls this week` } : { tone: 'off', label: 'No calls yet' };
      case 'caller-numbers':
        return numbers ? { tone: 'ok', label: `${numbers} number${numbers === 1 ? '' : 's'}` } : { tone: 'off', label: 'Using server number' };
      case 'rotation':
        return rotation?.enabled ? { tone: 'ok', label: `On · ${rotation.userIds.length} people` } : { tone: 'off', label: 'Off' };
      case 'google-meet':
      case 'google-business': {
        const s = app.kind === 'google-meet' ? meetStatus : businessStatus;
        if (s?.lastError) return { tone: 'warn', label: 'Needs attention' };
        if (s?.connected) return { tone: 'ok', label: 'Connected' };
        return { tone: 'off', label: s && !s.configured ? 'Server setup needed' : 'Not connected' };
      }
      default: {
        const row = integrations.find((i) => i.provider === app.key);
        if (row?.isEnabled) return { tone: 'ok', label: 'Connected' };
        return { tone: 'off', label: row && !row.credentialsConfigured ? 'Server setup needed' : 'Not connected' };
      }
    }
  };

  const visible = useMemo(
    () =>
      INTEGRATIONS.filter((app) => {
        if (search.trim() && !matchesSearch(app, search)) return false;
        if (filter === 'connected') return healthOf(app).tone !== 'off';
        if (filter !== 'all') return app.category === filter;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, filter, portals, metaStatus, meetStatus, businessStatus, rotation, incoming, numbers, integrations]
  );
  const connectedCount = INTEGRATIONS.filter((a) => healthOf(a).tone === 'ok').length;

  const runGoogle = async (which: 'meet' | 'business', action: 'connect' | 'disconnect') => {
    setActing(which);
    try {
      const api = which === 'meet' ? googleMeetApi : googleBusinessApi;
      if (action === 'connect') {
        window.location.href = (await api.connect()).url;
        return;
      }
      await api.disconnect();
      toast.success('Disconnected.');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong.');
    }
    setActing(null);
  };

  const runGeneric = async (provider: string, action: 'connect' | 'disconnect') => {
    setActing(provider);
    try {
      await (action === 'connect' ? integrationsApi.connect(provider) : integrationsApi.disconnect(provider));
      toast.success(action === 'connect' ? 'Connected.' : 'Disconnected.');
      load();
    } catch (err: any) {
      toast.warning(err.message || 'Could not connect.');
    } finally {
      setActing(null);
    }
  };

  const setup = (app: IntegrationApp) => {
    const changed = () => {
      load();
      setRefreshKey((k) => k + 1);
    };
    switch (app.kind) {
      case 'portal': {
        const row = portalFor(app.key);
        return row ? (
          <PortalSetup
            row={row}
            onChange={(next) => {
              setPortals((rs) => rs.map((r) => (r.source === next.source ? next : r)));
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : (
          <p className="text-sm text-slate-400">Loading...</p>
        );
      }
      case 'import':
        return <ImportSetup onImported={changed} />;
      case 'meta':
        return <MetaLeadsCard bare status={metaStatus} onChange={changed} />;
      case 'incoming-calls':
        return <IncomingCallsCard bare />;
      case 'caller-numbers':
        return <CallerNumbersCard bare />;
      case 'rotation':
        return <LeadRotationCard bare />;
      case 'google-meet':
      case 'google-business': {
        const which = app.kind === 'google-meet' ? 'meet' : 'business';
        const s = which === 'meet' ? meetStatus : businessStatus;
        return (
          <div className="space-y-3">
            {s && !s.configured && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">Needs Google credentials on the server (Settings &gt; Developer), then a restart.</p>}
            {s?.lastError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{s.lastError}</p>}
            <p className="text-xs text-slate-500">Last sync: {s?.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : '—'}</p>
            {s?.connected ? (
              <Button size="sm" variant="secondary" disabled={acting === which} onClick={() => runGoogle(which, 'disconnect')}>Disconnect</Button>
            ) : (
              <Button size="sm" disabled={acting === which || !s?.configured} onClick={() => runGoogle(which, 'connect')}>Connect</Button>
            )}
          </div>
        );
      }
      default: {
        const row = integrations.find((i) => i.provider === app.key);
        return (
          <div className="space-y-3">
            {row && !row.credentialsConfigured && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                Needs server credentials: <code className="font-mono">{row.missingEnvVars.join(', ')}</code>
              </p>
            )}
            {row?.lastError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{row.lastError}</p>}
            {row?.isEnabled ? (
              <Button size="sm" variant="secondary" disabled={acting === app.key} onClick={() => runGeneric(app.key, 'disconnect')}>Disconnect</Button>
            ) : (
              <Button size="sm" disabled={acting === app.key} onClick={() => runGeneric(app.key, 'connect')}>Connect</Button>
            )}
          </div>
        );
      }
    }
  };

  const detail = selected && (
    <div ref={detailRef} className="scroll-mt-20 sm:col-span-2 lg:col-span-3 xl:col-span-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AppBadge app={selected} size="lg" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{CATEGORY_LABEL[selected.category]}</p>
              <h2 className="text-base font-semibold text-slate-900">{selected.name}</h2>
              <div className="mt-0.5"><HealthPill health={healthOf(selected)} /></div>
            </div>
          </div>
          <button type="button" onClick={() => open(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-600">{selected.description}</p>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Set up</h3>
            {setup(selected)}
          </section>
          <section className="lg:col-span-2">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">How to connect</h3>
            <ol className="space-y-2">
              {selected.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            {selected.subSource && (
              <p className="mt-3 rounded-lg bg-blue-50 p-2 text-xs text-blue-700">
                <span className="font-semibold">Sub source</span> is filled in automatically: {selected.subSource}.
              </p>
            )}
          </section>
        </div>

        {selected.activity && (
          <section className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Activity: leads from {selected.name}</h3>
            <IntegrationActivityPanel appKey={selected.key} refreshKey={refreshKey} />
          </section>
        )}
      </Card>
    </div>
  );

  // The detail opens right under the row of the app that was clicked.
  const cols = 4;
  const selectedIndex = selected ? visible.findIndex((a) => a.key === selected.key) : -1;
  const insertAfter = selectedIndex < 0 ? -1 : Math.min(visible.length - 1, Math.floor(selectedIndex / cols) * cols + cols - 1);

  return (
    <>
      <PageHeader
        title="Integrations"
        description={`Connect lead sources, calling and meetings. ${connectedCount} of ${INTEGRATIONS.length} connected. An app shows a green tick only once it really works.`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps, e.g. 99acres, Google, Excel"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === f.key ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.length === 0 && <p className="text-sm text-slate-500">No app matches &quot;{search}&quot;.</p>}
          {visible.map((app, i) => {
            const health = healthOf(app);
            const active = selected?.key === app.key;
            return (
              <FragmentWithDetail key={app.key} detail={i === insertAfter ? detail : null}>
                <button
                  type="button"
                  onClick={() => open(active ? null : app.key)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow',
                    active ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-slate-200'
                  )}
                >
                  <AppBadge app={app} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{app.name}</span>
                      {health.tone === 'ok' && <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Connected" />}
                      {health.tone === 'warn' && <ExclamationCircleIcon className="h-5 w-5 shrink-0 text-amber-500" aria-label="Needs attention" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{app.description}</span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <HealthPill health={health} />
                      {health.count ? <span className="text-[11px] font-medium text-slate-500">{health.count} lead{health.count === 1 ? '' : 's'}</span> : null}
                    </span>
                  </span>
                </button>
              </FragmentWithDetail>
            );
          })}
          {selected && selectedIndex < 0 && detail}
        </div>
      )}
    </>
  );
}

function FragmentWithDetail({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) {
  return (
    <>
      {children}
      {detail}
    </>
  );
}
