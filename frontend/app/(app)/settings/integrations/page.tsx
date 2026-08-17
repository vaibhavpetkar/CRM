'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { integrationsApi, googleMeetApi, googleBusinessApi, IntegrationRow } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social & Messaging',
  'local-business': 'Local Business',
  professional: 'Professional / B2B',
  scheduling: 'Scheduling',
  video: 'Video Meetings',
  marketing: 'Email Marketing',
};

type GoogleConnectionStatus = { configured: boolean; connected: boolean; lastSyncAt: string | null; lastError: string | null };

function RealGoogleCard({
  categoryLabel,
  label,
  description,
  docsUrl,
  status,
  acting,
  onConnect,
  onDisconnect,
}: {
  categoryLabel: string;
  label: string;
  description: string;
  docsUrl?: string;
  status: GoogleConnectionStatus | null;
  acting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{categoryLabel}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{label}</h3>
        </div>
        {status && <StatusBadge status={status.connected ? 'active' : status.configured ? 'not_configured' : 'not_configured'} />}
      </div>

      <p className="mt-3 text-xs text-slate-500">{description}</p>

      {status && !status.configured && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
          Needs backend credentials — set them under Settings &gt; Developer, then restart the app.
        </div>
      )}

      {status?.lastError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">{status.lastError}</div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Last sync: {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '—'}</span>
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noreferrer" className="text-[#168eea] hover:underline">
            Docs
          </a>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        {status?.connected ? (
          <Button type="button" variant="secondary" size="sm" disabled={acting} onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={acting || !status?.configured} onClick={onConnect}>
            Connect
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function IntegrationsSettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const [meetStatus, setMeetStatus] = useState<GoogleConnectionStatus | null>(null);
  const [businessStatus, setBusinessStatus] = useState<GoogleConnectionStatus | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      integrationsApi.getIntegrations().then((res) => setIntegrations(res.integrations)),
      googleMeetApi.getStatus().then(setMeetStatus).catch(() => setMeetStatus(null)),
      googleBusinessApi.getStatus().then(setBusinessStatus).catch(() => setBusinessStatus(null)),
    ])
      .catch((err) => setError(err.message || 'Failed to load integrations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Google redirects the browser back here after the OAuth consent screen
  // (see googleMeetController/googleBusinessController callbacks).
  useEffect(() => {
    const meetResult = searchParams.get('googleMeet');
    const businessResult = searchParams.get('googleBusiness');
    if (meetResult === 'connected') toast.success('Google Meet connected.');
    else if (meetResult === 'error') toast.error('Could not connect Google Meet — please try again.');
    if (businessResult === 'connected') toast.success('Google Business Profile connected.');
    else if (businessResult === 'error') toast.error('Could not connect Google Business Profile — please try again.');
    if (meetResult || businessResult) {
      load();
      router.replace('/settings/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = async (provider: string) => {
    setActingOn(provider);
    try {
      await integrationsApi.connect(provider);
      toast.success('Connected.');
      load();
    } catch (err: any) {
      // Expected for now — Meta/LinkedIn/Calendly/Mailchimp still need
      // credentials and a real OAuth flow this server doesn't have yet.
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

  const handleGoogleConnect = async (which: 'meet' | 'business') => {
    setActingOn(which);
    try {
      const api = which === 'meet' ? googleMeetApi : googleBusinessApi;
      const res = await api.connect();
      window.location.href = res.url; // hand off to Google's consent screen
    } catch (err: any) {
      toast.error(err.message || 'Could not start the connection.');
      setActingOn(null);
    }
  };

  const handleGoogleDisconnect = async (which: 'meet' | 'business') => {
    setActingOn(which);
    try {
      const api = which === 'meet' ? googleMeetApi : googleBusinessApi;
      await api.disconnect();
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
          <RealGoogleCard
            categoryLabel="Video Meetings"
            label="Google Meet"
            description="Automatically creates a real Google Meet link (via Calendar) for every video meeting scheduled in the CRM."
            docsUrl="https://developers.google.com/meet"
            status={meetStatus}
            acting={actingOn === 'meet'}
            onConnect={() => handleGoogleConnect('meet')}
            onDisconnect={() => handleGoogleDisconnect('meet')}
          />

          <RealGoogleCard
            categoryLabel="Local Business"
            label="Google Business Profile"
            description="Sync store info, reviews, and leads for local/store-front businesses. Note: pulling real data additionally requires Google's Business Profile API access approval for this app — the connection itself works before that, but syncing won't until Google approves it."
            docsUrl="https://developers.google.com/my-business"
            status={businessStatus}
            acting={actingOn === 'business'}
            onConnect={() => handleGoogleConnect('business')}
            onDisconnect={() => handleGoogleDisconnect('business')}
          />

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
