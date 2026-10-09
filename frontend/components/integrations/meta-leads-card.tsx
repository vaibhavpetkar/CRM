'use client';

import Link from 'next/link';
import { useState } from 'react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { metaLeadsApi, MetaLeadsStatus } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const LEAD_STATUS_STYLE: Record<string, string> = {
  created: 'bg-emerald-50 text-emerald-700',
  duplicate: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-50 text-red-700',
  processing: 'bg-amber-50 text-amber-700',
};
const LEAD_STATUS_LABEL: Record<string, string> = {
  created: 'New lead',
  duplicate: 'Existing lead',
  failed: 'Failed',
  processing: 'Importing',
};

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Facebook / Instagram Lead Ads: connect with Facebook, pick which Pages send
 * their lead form submissions into the CRM, and see the latest ones arrive.
 */
export default function MetaLeadsCard({ status, onChange, bare = false }: { status: MetaLeadsStatus | null; onChange: () => void; bare?: boolean }) {
  // Inside Settings > Integrations' detail view the card's frame is dropped.
  const Box = bare ? 'div' : Card;
  const toast = useToast();
  const [acting, setActing] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setActing(key);
    try {
      await fn();
      onChange();
    } catch (err) {
      toast.error((err as Error).message || 'Something went wrong.');
    } finally {
      setActing(null);
    }
  };

  const connect = async () => {
    setActing('connect');
    try {
      const res = await metaLeadsApi.connect();
      window.location.href = res.url; // hand off to Facebook's consent screen
    } catch (err) {
      toast.error((err as Error).message || 'Could not start the connection.');
      setActing(null);
    }
  };

  const disconnect = () => {
    if (!window.confirm('Disconnect Facebook? Leads from your Pages will stop coming into the CRM.')) return;
    run('disconnect', async () => {
      await metaLeadsApi.disconnect();
      toast.success('Facebook Lead Ads disconnected.');
    });
  };

  const togglePage = (id: number, on: boolean) =>
    run(`page-${id}`, async () => {
      const res = on ? await metaLeadsApi.subscribePage(id) : await metaLeadsApi.unsubscribePage(id);
      toast.success(res.message);
    });

  const syncPage = (id: number) =>
    run(`sync-${id}`, async () => {
      const res = await metaLeadsApi.syncPage(id);
      const parts = [
        `${res.created} new`,
        res.duplicate ? `${res.duplicate} matched existing leads` : '',
        res.failed ? `${res.failed} failed` : '',
      ].filter(Boolean);
      toast.success(`Checked the last 7 days: ${parts.join(', ')}.`);
    });

  const configured = !!status?.configured;
  const connected = !!status?.connected;

  return (
    <Box className={bare ? "" : "sm:col-span-2 lg:col-span-3"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Social &amp; Messaging</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Facebook &amp; Instagram Lead Ads</h3>
        </div>
        {status && <StatusBadge status={connected ? 'active' : 'not_configured'} />}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Every time someone fills in a lead form on your Facebook or Instagram ads, they appear here as a new lead (source
        Facebook or Instagram) with all their answers, within a few seconds. People who are already leads get a timeline
        entry instead of a duplicate.
      </p>

      {status && !configured && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
          Needs your Meta app&apos;s details: set META_APP_ID, META_APP_SECRET and META_VERIFY_TOKEN under{' '}
          <Link href="/settings/developer" className="underline">
            Settings &gt; Developer
          </Link>
          , then restart the app.
        </div>
      )}
      {status && configured && !status.verifyTokenSet && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
          META_VERIFY_TOKEN isn&apos;t set, so Meta can&apos;t verify the webhook yet. Set it under Settings &gt; Developer.
        </div>
      )}
      {status?.lastError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">{status.lastError}</div>
      )}

      {status && configured && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
          <p>
            Webhook URL for your Meta app (Page &gt; <code>leadgen</code>):{' '}
            <code className="break-all font-mono text-slate-800">{status.webhookUrl}</code>
          </p>
          <p className="mt-1">
            OAuth redirect URI: <code className="break-all font-mono text-slate-800">{status.callbackUrl}</code>
          </p>
        </div>
      )}

      {connected && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700">Pages</p>
          {status!.pages.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">No Pages yet. Reconnect and tick the Pages your lead forms run on.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {status!.pages.map((page) => (
                <li key={page.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{page.pageName}</p>
                    <p className="text-[11px] text-slate-400">
                      {page.isSubscribed ? `Receiving leads · ${page.leadsReceived} so far · last ${when(page.lastLeadAt)}` : 'Not receiving leads'}
                    </p>
                    {page.lastError && <p className="mt-0.5 text-[11px] text-red-600">{page.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {page.isSubscribed && (
                      <Button type="button" variant="secondary" size="sm" disabled={!!acting} onClick={() => syncPage(page.id)}>
                        {acting === `sync-${page.id}` ? 'Checking…' : 'Fetch recent leads'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={page.isSubscribed ? 'secondary' : undefined}
                      disabled={!!acting}
                      onClick={() => togglePage(page.id, !page.isSubscribed)}
                    >
                      {page.isSubscribed ? 'Stop leads' : 'Receive leads'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {status!.recentLeads.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700">Latest leads from Meta</p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2.5 py-2 font-medium">Name</th>
                      <th className="px-2.5 py-2 font-medium">Form / campaign</th>
                      <th className="px-2.5 py-2 font-medium">Submitted</th>
                      <th className="px-2.5 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {status!.recentLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="px-2.5 py-2">
                          {lead.leadId ? (
                            <Link href={`/leads/${lead.leadId}`} className="text-[var(--primary)] hover:underline">
                              {lead.name || 'Lead'}
                            </Link>
                          ) : (
                            <span className="text-slate-700">{lead.name || '—'}</span>
                          )}
                          <span className="ml-1 text-[10px] text-slate-400">{lead.platform === 'ig' ? 'Instagram' : 'Facebook'}</span>
                        </td>
                        <td className="px-2.5 py-2 text-slate-600">
                          {[lead.formName, lead.campaignName].filter(Boolean).join(' · ') || lead.pageName}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-slate-500">{when(lead.submittedAt || lead.createdAt)}</td>
                        <td className="px-2.5 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${LEAD_STATUS_STYLE[lead.status] || ''}`} title={lead.error || undefined}>
                            {LEAD_STATUS_LABEL[lead.status] || lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {connected && (
          <Button type="button" variant="secondary" size="sm" disabled={!!acting} onClick={connect}>
            Add more Pages
          </Button>
        )}
        {connected ? (
          <Button type="button" variant="secondary" size="sm" disabled={!!acting} onClick={disconnect}>
            Disconnect
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!!acting || !configured} onClick={connect}>
            Connect with Facebook
          </Button>
        )}
      </div>
    </Box>
  );
}
