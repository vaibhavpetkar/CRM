'use client';

import { useEffect, useState } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { salesApi, ViAuthType, ViCpaasForm, ViCpaasSettings, ViSecretField } from '@/lib/api';
import { copyText, when } from '@/components/integrations/portal-setup';

type Field = { key: keyof ViCpaasForm; label: string; placeholder?: string; secret?: boolean; multiline?: boolean; help?: string };
type Section = { title: string; help: string; fields: Field[]; auth?: 'authType'; pull?: boolean };

// Same order and names as the Vi CPaaS portal's Configuration menu.
const SECTIONS: Section[] = [
  {
    title: 'CTC configuration',
    help: "Vi's initiate-call API is built in: only the Vi number is needed here. In Vi, set Click To Call Pingback to the Call events URL above.",
    fields: [
      { key: 'ctcUrl', label: 'CTC API URL (leave empty)', placeholder: 'https://cts.myvi.in:8443/Cpaas/api/v1/clicktocall/initiate-call' },
      { key: 'callerId', label: 'Vi number customers see (CLI)', placeholder: '85540 00444', help: 'The Callee number on the Vi CTC Configuration page.' },
      {
        key: 'requestTemplate',
        label: 'Request body (JSON, leave empty)',
        multiline: true,
        placeholder: '{"cli":"{{callerId}}","apartyno":"{{agent}}","bpartyno":"{{customer}}","reference_id":"{{reference}}","channelflag":0,"dtmfflag":0,"recordingflag":0}',
        help: 'Only to change Vi\'s default. Placeholders: {{agent}}, {{customer}}, {{callerId}}, {{callbackUrl}}, {{reference}}, {{username}}, {{password}}, {{accountId}}, {{record}}.',
      },
      { key: 'statusUrl', label: 'Call status URL (leave empty)', placeholder: 'https://.../status?call_id={{callId}}' },
    ],
  },
  {
    title: 'CTC login (OBD API credential)',
    help: 'The Username and Password on the Vi page Click To Call > CTC Configuration > Configure Click To Call API.',
    auth: 'authType',
    fields: [
      { key: 'username', label: 'API username' },
      { key: 'password', label: 'API password / key / token', secret: true },
      { key: 'accountId', label: 'Account / customer id (optional)' },
    ],
  },
  {
    title: 'Pull API credential',
    help: "Vi's Pull Report API (incoming and click-to-call reports). The CRM reads it every few minutes so calls Vi could not push still arrive.",
    pull: true,
    fields: [
      { key: 'pullUsername', label: 'Pull API username' },
      { key: 'pullPassword', label: 'Pull API password', secret: true },
      { key: 'dni', label: 'DNI (your Vi service number)', placeholder: '97xxxxxx42', help: 'Leave empty to use the Vi number above.' },
      { key: 'pullUrl', label: 'Pull API address (leave empty)', placeholder: 'https://cts.myvi.in:8443/Cpaas/api/v1/pullcalldetails' },
    ],
  },
  {
    title: 'Schema credential',
    help: 'If Vi asks for a username and password to use when it pushes to your URL, make them up, type them in Vi and here. Leave empty if Vi does not ask.',
    fields: [
      { key: 'webhookUsername', label: 'Push username' },
      { key: 'webhookPassword', label: 'Push password', secret: true },
    ],
  },
  {
    title: 'OBD time',
    help: 'The same calling hours as in Vi (India time). Outside them the CRM tells the caller instead of failing at Vi.',
    fields: [
      { key: 'callStart', label: 'From', placeholder: '09:00' },
      { key: 'callEnd', label: 'To', placeholder: '21:00' },
    ],
  },
  {
    title: 'OBD encryption key & IV for AES 256 CBC',
    help: 'Copy both from Vi. Encrypted pushes and replies from Vi are opened automatically once these are saved.',
    fields: [
      { key: 'aesKey', label: 'Encryption key (32 characters)', secret: true },
      { key: 'aesIv', label: 'IV (16 characters)', secret: true },
      { key: 'encryptedTemplate', label: 'Encrypted body (JSON)', placeholder: '{"data":"{{encrypted}}"}', help: 'How the encrypted request is wrapped, per the Vi document.' },
    ],
  },
];

const AUTH_LABEL: Record<ViAuthType, string> = {
  bearer: 'Bearer token header',
  basic: 'Username + password (Basic, recommended)',
  header: 'API key in a custom header',
  none: 'Inside the request body',
};

const inputClass = 'w-full rounded-lg border border-slate-200 p-2 text-xs focus:border-[var(--primary)] focus:outline-none';

export default function ViCpaasCard({ onChange }: { onChange?: (s: ViCpaasSettings) => void }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ViCpaasSettings | null>(null);
  const [form, setForm] = useState<Partial<ViCpaasForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const apply = (s: ViCpaasSettings) => {
    setSettings(s);
    onChange?.(s);
  };

  useEffect(() => {
    salesApi.getViCpaas().then(apply).catch((err) => setError(err.message || 'Could not load the Vi CPaaS settings.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (error) return <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>;
  if (!settings) return <p className="text-sm text-slate-400">Loading...</p>;

  const value = (f: Field) => {
    const typed = form[f.key];
    if (typed !== undefined) return String(typed);
    return f.secret ? '' : String((settings as unknown as Record<string, unknown>)[f.key] ?? '');
  };
  const set = (key: keyof ViCpaasForm, v: string | boolean) => setForm((x) => ({ ...x, [key]: v }));
  const dirty = Object.keys(form).length > 0;

  const save = (extra: { isEnabled?: boolean } = {}) =>
    run('save', async () => {
      apply(await salesApi.saveViCpaas({ ...form, ...extra }));
      setForm({});
      toast.success(extra.isEnabled === undefined ? 'Saved.' : extra.isEnabled ? 'Vi CPaaS is on.' : 'Vi CPaaS is off.');
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {settings.isEnabled ? 'Click-to-call from the CRM goes out through Vi.' : 'Fill in the sections below, then switch it on.'}
          {settings.lastPullAt ? ` · last call report read ${when(settings.lastPullAt)}` : ''}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={settings.isEnabled}
            disabled={acting === 'save'}
            onChange={(e) => save({ isEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
          />
          {settings.isEnabled ? 'On' : 'Off'}
        </label>
      </div>

      {settings.lastError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{settings.lastError}</p>}

      {settings.eventsUrl && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Call events URL (paste this in Vi)</p>
          <div className="mt-1 flex items-center gap-1">
            <code className="block min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">{settings.eventsUrl}</code>
            <button type="button" onClick={() => copyText(settings.eventsUrl!, toast)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copy link">
              <ClipboardDocumentIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            One URL for both directions: the status of calls made from the CRM and every incoming call to your Vi number. JSON, form fields or AES-encrypted bodies all work.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1.5 rounded-lg border border-slate-100 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
            <p className="text-[11px] text-slate-400">{section.help}</p>
            {section.auth && (
              <select
                value={(form[section.auth] as string) ?? settings[section.auth]}
                onChange={(e) => set(section.auth!, e.target.value)}
                className={inputClass}
                aria-label="How the credential is sent"
              >
                {(Object.keys(AUTH_LABEL) as ViAuthType[]).map((k) => (
                  <option key={k} value={k}>
                    {AUTH_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
            {section.auth === 'authType' && ((form.authType ?? settings.authType) === 'header') && (
              <input value={value({ key: 'authHeader', label: '' })} onChange={(e) => set('authHeader', e.target.value)} placeholder="Header name, e.g. x-api-key" className={inputClass} />
            )}
            {section.fields.map((f) => {
              const saved = f.secret && settings.secretsSet[f.key as ViSecretField];
              const placeholder = saved ? `${f.label} (saved; type "-" to remove)` : f.placeholder ? `${f.label}: ${f.placeholder}` : f.label;
              return (
                <div key={f.key}>
                  {f.multiline ? (
                    <textarea rows={3} value={value(f)} onChange={(e) => set(f.key, e.target.value)} placeholder={placeholder} className={`${inputClass} font-mono`} />
                  ) : (
                    <input
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="off"
                      value={value(f)}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={placeholder}
                      className={inputClass}
                    />
                  )}
                  {f.help && <p className="mt-0.5 text-[11px] text-slate-400">{f.help}</p>}
                </div>
              );
            })}
            {section.title.startsWith('OBD encryption') && (
              <label className="flex items-center gap-2 pt-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={form.encryptRequests ?? settings.encryptRequests}
                  onChange={(e) => set('encryptRequests', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
                />
                Encrypt the requests the CRM sends to Vi
              </label>
            )}
            {section.pull && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!settings.pullUsername || !settings.secretsSet.pullPassword || dirty || acting === 'pull'}
                  onClick={() =>
                    run('pull', async () => {
                      const res = await salesApi.pullViCpaas();
                      apply(res.settings);
                      toast.success(res.records ? `${res.records} call report${res.records === 1 ? '' : 's'}: ${res.outgoing} outgoing, ${res.incoming} incoming.` : 'No calls in the last hour.');
                    })
                  }
                >
                  {acting === 'pull' ? 'Reading...' : 'Read call reports now'}
                </Button>
                <p className="mt-0.5 text-[11px] text-slate-400">Read automatically every {settings.pullEveryMinutes} minutes while Vi CPaaS is on.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {dirty && (
          <Button size="sm" variant="secondary" disabled={acting === 'save'} onClick={() => setForm({})}>
            Undo changes
          </Button>
        )}
        <Button size="sm" disabled={!dirty || acting === 'save'} onClick={() => save()}>
          {acting === 'save' ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
