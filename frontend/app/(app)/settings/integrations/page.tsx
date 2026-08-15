'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { integrationsApi, IntegrationRow } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social & Messaging',
  'local-business': 'Local Business',
  professional: 'Professional / B2B',
  scheduling: 'Scheduling',
  video: 'Video Meetings',
  marketing: 'Email Marketing',
};

export default function IntegrationsSettingsPage() {
  const toast = useToast();
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    integrationsApi
      .getIntegrations()
      .then((res) => setIntegrations(res.integrations))
      .catch((err) => setError(err.message || 'Failed to load integrations.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleConnect = async (provider: string) => {
    setActingOn(provider);
    try {
      await integrationsApi.connect(provider);
      toast.success('Connected.');
      load();
    } catch (err: any) {
      // Expected for now — every provider needs credentials this server
      // doesn't have yet. Surface the real reason rather than a generic error.
      toast.warning(err.message || 'Could not connect.');
    } finally {
      setActingOn(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setActingOn(provider);
    try {
      await integrationsApi.disconnect(provider);
      toast.success('Disconnected.');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect.');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect the CRM to the tools your business already uses. Nothing here is faked — an integration only shows as connected once it actually is."
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.provider}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {CATEGORY_LABELS[integration.category] || integration.category}
                  </p>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{integration.label}</h3>
                </div>
                <StatusBadge status={integration.isEnabled ? 'active' : integration.status} />
              </div>

              <p className="mt-3 text-xs text-slate-500">{integration.description}</p>

              {!integration.credentialsConfigured && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
                  Needs backend credentials:{' '}
                  <code className="rounded bg-white/60 px-1 py-0.5 font-mono">{integration.missingEnvVars.join(', ')}</code>
                </div>
              )}

              {integration.lastError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">
                  {integration.lastError}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Last sync: {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : '—'}</span>
                {integration.docsUrl && (
                  <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="text-[#168eea] hover:underline">
                    Docs
                  </a>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                {integration.isEnabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={actingOn === integration.provider}
                    onClick={() => handleDisconnect(integration.provider)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={actingOn === integration.provider}
                    onClick={() => handleConnect(integration.provider)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
