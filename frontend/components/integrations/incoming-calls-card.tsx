'use client';

import { useEffect, useState } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { IncomingCallSettings, salesApi } from '@/lib/api';

/**
 * Incoming calls on the company's Vi (or Exotel) number: the provider sends
 * each call's events to this URL, and the call shows in Call Tracking against
 * the matching lead, with its recording.
 */
export default function IncomingCallsCard({ bare = false }: { bare?: boolean } = {}) {
  // Inside Settings > Integrations' detail view the card's frame is dropped.
  const Box = bare ? 'div' : Card;
  const toast = useToast();
  const [settings, setSettings] = useState<IncomingCallSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    salesApi.getIncomingCalls().then(setSettings).catch((err) => setError(err.message || 'Could not load incoming call settings.'));
  }, []);

  const save = async (payload: { createLeads?: boolean; regenerate?: boolean }, done?: string) => {
    setSaving(true);
    try {
      setSettings(await salesApi.saveIncomingCalls(payload));
      if (done) toast.success(done);
    } catch (err) {
      toast.error((err as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!settings?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(settings.webhookUrl);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it.');
    }
  };

  return (
    <Box className={bare ? "" : "sm:col-span-2 lg:col-span-3"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Calling</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Incoming calls (Vi)</h3>
        </div>
        {settings && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${settings.callsLast7Days ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {settings.callsLast7Days ? `${settings.callsLast7Days} incoming call${settings.callsLast7Days === 1 ? '' : 's'} this week` : 'No incoming calls yet'}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        When a buyer calls your Vi number, the call appears in Call Tracking and on the lead&apos;s timeline with who answered, the talk time and the recording.
        The caller is matched to a lead by mobile number. Missed calls are sent to the lead&apos;s owner to call back.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
      {!settings && !error && <p className="mt-3 text-sm text-slate-400">Loading...</p>}

      {settings && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Call events URL</p>
            <div className="mt-1 flex items-center gap-1">
              <code className="block min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">{settings.webhookUrl}</code>
              <button type="button" onClick={copy} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copy link">
                <ClipboardDocumentIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Give this URL to Vi Business support and ask them to send incoming call events (ringing, answered, ended, recording link) to it.
              In Exotel, add it as a Passthru applet in your incoming call flow.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.createLeads}
              disabled={saving}
              onChange={(e) => save({ createLeads: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
            />
            <span>
              Create a lead for callers who aren&apos;t leads yet
              <span className="block text-xs text-slate-400">Source &quot;Incoming Call&quot;, given to whoever answered (or the next person in the lead rotation).</span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                if (confirm('Make a new URL? The old one stops working, so you will need to send the new one to Vi.')) save({ regenerate: true }, 'New URL made.');
              }}
            >
              Make a new URL
            </Button>
          </div>
        </div>
      )}
    </Box>
  );
}
