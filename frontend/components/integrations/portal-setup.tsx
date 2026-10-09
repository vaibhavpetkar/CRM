'use client';

import { useState } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PortalConnectionRow, salesApi } from '@/lib/api';

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);

export const copyText = async (text: string, toast: ReturnType<typeof useToast>) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied.');
  } catch {
    toast.error('Could not copy. Select the text and copy it.');
  }
};

/**
 * One property portal / lead app: on-off switch, its secret lead push URL,
 * the API login it is read with, "Check now" and "Send a test lead".
 */
export default function PortalSetup({ row, onChange }: { row: PortalConnectionRow; onChange: (row: PortalConnectionRow) => void }) {
  const toast = useToast();
  const [acting, setActing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

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

  const saveLogin = () =>
    run('save', async () => {
      const credentials: Record<string, string> = {};
      for (const f of row.credentialFields) if (form[f.key] !== undefined && (form[f.key] !== '' || !f.secret)) credentials[f.key] = form[f.key];
      onChange(await salesApi.updatePortal(row.source, { credentials }));
      setForm({});
      toast.success('Saved.');
    });

  const loginLabel = row.canPull ? 'API login' : 'Key';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {row.leadsReceived} lead{row.leadsReceived === 1 ? '' : 's'} received{row.lastLeadAt ? `, last ${when(row.lastLeadAt)}` : ''}
          {row.lastPolledAt ? ` · last checked ${when(row.lastPolledAt)}` : ''}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={row.isEnabled}
            disabled={acting === 'on'}
            onChange={(e) => run('on', async () => onChange(await salesApi.updatePortal(row.source, { isEnabled: e.target.checked })))}
            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
          />
          {row.isEnabled ? 'On' : 'Off'}
        </label>
      </div>

      {row.lastError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{row.lastError}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {row.webhookUrl && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lead push URL</p>
            <div className="mt-1 flex items-center gap-1">
              <code className="block min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">{row.webhookUrl}</code>
              <button type="button" onClick={() => copyText(row.webhookUrl!, toast)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copy link">
                <ClipboardDocumentIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{row.pushHelp}</p>
          </div>
        )}

        {row.credentialFields.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{loginLabel}</p>
            {row.credentialFields.map((f) => (
              <input
                key={f.key}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={form[f.key] ?? (f.secret ? '' : f.value)}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.secret && f.isSet ? `${f.label} (saved)` : f.label}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:border-[var(--primary)] focus:outline-none"
              />
            ))}
            {row.pullHelp && <p className="text-[11px] text-slate-400">{row.pullHelp}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" disabled={acting === 'save' || !Object.keys(form).length} onClick={saveLogin}>
                Save
              </Button>
              {row.canPull && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!row.hasCredentials || acting === 'sync'}
                  onClick={() =>
                    run('sync', async () => {
                      const res = await salesApi.syncPortal(row.source);
                      onChange(res.portal);
                      toast.success(res.created || res.duplicate ? `${res.created} new, ${res.duplicate} existing lead${res.duplicate === 1 ? '' : 's'}.` : 'No new leads.');
                    })
                  }
                >
                  {acting === 'sync' ? 'Checking...' : 'Check now'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {row.webhookUrl && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={acting === 'test'}
            onClick={() =>
              run('test', async () => {
                const res = await salesApi.sendPortalTestLead(row.source);
                onChange(res.portal);
                toast.success(res.result === 'failed' ? 'The test lead failed; see the error above.' : 'Test lead added. See Activity below.');
              })
            }
          >
            Send a test lead
          </Button>
        </div>
      )}
    </div>
  );
}
