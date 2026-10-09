'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PortalConnectionRow, salesApi } from '@/lib/api';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);

const STATUS_CLASS: Record<string, string> = {
  created: 'bg-emerald-50 text-emerald-700',
  duplicate: 'bg-blue-50 text-blue-700',
  failed: 'bg-red-50 text-red-600',
};
const STATUS_LABEL: Record<string, string> = { created: 'New lead', duplicate: 'Existing lead', failed: 'Failed' };

/**
 * Leads from property portals (99acres, MagicBricks, Housing.com) arrive by
 * themselves: either the portal pushes each enquiry to the company's secret
 * URL, or the CRM reads new ones every few minutes with the saved API login.
 */
export default function PropertyPortalsCard() {
  const toast = useToast();
  const [rows, setRows] = useState<PortalConnectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(() => {
    salesApi
      .listPortals()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load property portals.'));
  }, []);

  useEffect(load, [load]);

  const replace = (row: PortalConnectionRow) => setRows((rs) => (rs || []).map((r) => (r.source === row.source ? row : r)));

  const run = async (key: string, fn: () => Promise<void>) => {
    setActing(key);
    try {
      await fn();
    } catch (err) {
      toast.error((err as Error).message || 'Something went wrong.');
    } finally {
      setActing(null);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it.');
    }
  };

  const setField = (source: string, key: string, value: string) => setForms((f) => ({ ...f, [source]: { ...(f[source] || {}), [key]: value } }));

  const saveLogin = (row: PortalConnectionRow) =>
    run(`save-${row.source}`, async () => {
      const form = forms[row.source] || {};
      const credentials: Record<string, string> = {};
      for (const f of row.credentialFields) if (form[f.key] !== undefined && (form[f.key] !== '' || !f.secret)) credentials[f.key] = form[f.key];
      replace(await salesApi.updatePortal(row.source, { credentials }));
      setForms((f) => ({ ...f, [row.source]: {} }));
      toast.success(`${row.label} login saved.`);
    });

  return (
    <Card className="sm:col-span-2 lg:col-span-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Lead capture</p>
        <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Property portals</h3>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Enquiries from 99acres, MagicBricks and Housing.com come into Leads by themselves, with the project, locality, BHK and budget filled in.
        A buyer who is already a lead gets a note on their timeline instead of a second lead. New leads go to the lead rotation when it is on.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
      {!rows && !error && <p className="mt-3 text-sm text-slate-400">Loading...</p>}

      {rows && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {rows.map((row) => {
            const form = forms[row.source] || {};
            return (
              <div key={row.source} className={`rounded-xl border border-slate-200 p-3 ${row.isEnabled ? '' : 'opacity-60'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={row.isEnabled}
                      disabled={acting === `on-${row.source}`}
                      onChange={(e) => run(`on-${row.source}`, async () => replace(await salesApi.updatePortal(row.source, { isEnabled: e.target.checked })))}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
                    />
                    {row.isEnabled ? 'On' : 'Off'}
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {row.leadsReceived} lead{row.leadsReceived === 1 ? '' : 's'} received
                  {row.lastLeadAt ? `, last ${when(row.lastLeadAt)}` : ''}
                </p>

                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lead push URL</p>
                  <div className="mt-1 flex items-center gap-1">
                    <code className="block min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700" title={row.webhookUrl}>
                      {row.webhookUrl}
                    </code>
                    <button type="button" onClick={() => copy(row.webhookUrl)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copy link">
                      <ClipboardDocumentIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{row.pushHelp}</p>
                </div>

                {row.canPull && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">API login</p>
                    {row.credentialFields.map((f) => (
                      <input
                        key={f.key}
                        type={f.secret ? 'password' : 'text'}
                        autoComplete="off"
                        value={form[f.key] ?? (f.secret ? '' : f.value)}
                        onChange={(e) => setField(row.source, f.key, e.target.value)}
                        placeholder={f.secret && f.isSet ? `${f.label} (saved)` : f.label}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:border-[var(--primary)] focus:outline-none"
                      />
                    ))}
                    <p className="text-[11px] text-slate-400">{row.pullHelp}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" disabled={acting === `save-${row.source}` || !Object.keys(form).length} onClick={() => saveLogin(row)}>
                        Save login
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!row.hasCredentials || acting === `sync-${row.source}`}
                        onClick={() =>
                          run(`sync-${row.source}`, async () => {
                            const res = await salesApi.syncPortal(row.source);
                            replace(res.portal);
                            toast.success(res.created || res.duplicate ? `${res.created} new, ${res.duplicate} existing lead${res.duplicate === 1 ? '' : 's'}.` : 'No new leads.');
                          })
                        }
                      >
                        {acting === `sync-${row.source}` ? 'Checking...' : 'Check now'}
                      </Button>
                    </div>
                    {row.lastPolledAt && <p className="text-[11px] text-slate-400">Last checked {when(row.lastPolledAt)}</p>}
                  </div>
                )}

                {row.lastError && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] text-red-600">{row.lastError}</p>}

                {row.recent.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {row.recent.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
                        <span className="min-w-0 truncate text-slate-700">
                          {e.leadId ? (
                            <Link href={`/leads/${e.leadId}`} className="font-medium hover:text-[var(--primary)]">
                              {e.name || e.mobile || 'Lead'}
                            </Link>
                          ) : (
                            <span className="font-medium">{e.name || e.mobile || 'Lead'}</span>
                          )}
                          {e.projectName && <span className="text-slate-400"> · {e.projectName}</span>}
                        </span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${STATUS_CLASS[e.status] || ''}`} title={e.error || undefined}>
                          {STATUS_LABEL[e.status] || e.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-slate-500 hover:text-[var(--primary)] disabled:opacity-40"
                    disabled={acting === `test-${row.source}`}
                    onClick={() =>
                      run(`test-${row.source}`, async () => {
                        const res = await salesApi.sendPortalTestLead(row.source);
                        replace(res.portal);
                        toast.success(res.result === 'failed' ? 'The test lead failed; see the error on the card.' : 'Test lead added to Leads.');
                      })
                    }
                  >
                    Send a test lead
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
