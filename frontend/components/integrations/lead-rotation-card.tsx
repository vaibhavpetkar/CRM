'use client';

import { useEffect, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { RotationSettings, salesApi, usersApi } from '@/lib/api';
import { LEAD_SOURCE_OPTIONS, leadSourceLabel } from '@/lib/lead-options';

/**
 * Rotational calling: new leads go to the sales team in turn (round robin),
 * skipping anyone offline or already on a call. The same order can route
 * incoming calls through the calling provider's dynamic routing URL.
 */
export default function LeadRotationCard() {
  const toast = useToast();
  const [settings, setSettings] = useState<RotationSettings | null>(null);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState('');
  const [addingSource, setAddingSource] = useState('');

  useEffect(() => {
    salesApi.getRotation().then(setSettings).catch((err) => setError(err.message || 'Could not load lead rotation.'));
    usersApi.getAssignableUsers().then((r) => setUsers(r.users.map((u) => ({ id: u.id, name: u.name })))).catch(() => {});
  }, []);

  const save = async (patch: Partial<RotationSettings>, done?: string) => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await salesApi.saveRotation({
        enabled: patch.enabled ?? settings.enabled,
        userIds: patch.userIds ?? settings.userIds,
        onlyAvailable: patch.onlyAvailable ?? settings.onlyAvailable,
        sources: patch.sources ?? settings.sources,
      });
      setSettings(next);
      if (done) toast.success(done);
    } catch (err: any) {
      toast.error(err.message || 'Could not save lead rotation.');
    } finally {
      setSaving(false);
    }
  };

  const distribute = async () => {
    if (!confirm('Assign every unassigned open lead to the rotation, in turn?')) return;
    setSaving(true);
    try {
      const res = await salesApi.distributeUnassigned();
      toast.success(res.assigned ? `Assigned ${res.assigned} lead${res.assigned === 1 ? '' : 's'}.` : 'There were no unassigned leads.');
      setSettings(await salesApi.getRotation());
    } catch (err: any) {
      toast.error(err.message || 'Could not assign leads.');
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: number) => users.find((u) => u.id === id)?.name || `User #${id}`;
  const move = (index: number, delta: number) => {
    if (!settings) return;
    const ids = [...settings.userIds];
    const [x] = ids.splice(index, 1);
    ids.splice(index + delta, 0, x);
    save({ userIds: ids });
  };

  const routingUrl = settings?.routingPath && typeof window !== 'undefined' ? `${window.location.origin}${settings.routingPath}` : null;
  const select = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none';

  return (
    <Card className="sm:col-span-2 lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Calling</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Lead rotation (rotational calling)</h3>
        </div>
        {settings && (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={saving}
              onChange={(e) => save({ enabled: e.target.checked }, e.target.checked ? 'Lead rotation is on.' : 'Lead rotation is off.')}
              className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
            />
            {settings.enabled ? 'On' : 'Off'}
          </label>
        )}
      </div>
      <div className="mt-3" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!settings && !error && <p className="text-sm text-slate-400">Loading...</p>}
      {settings && (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">
            New leads with no owner (from portals, Facebook, the website form, imports or added by hand) go to these sales people in turn. The next one in line gets the next lead.
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Rotation order</h3>
              {settings.userIds.length === 0 ? (
                <p className="text-sm text-slate-400">Nobody yet. Add your sales team below.</p>
              ) : (
                <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {settings.userIds.map((id, i) => (
                    <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-xs font-bold text-slate-400">{i + 1}</span>
                        <span className="font-medium text-slate-800">{nameOf(id)}</span>
                        {settings.lastUserId === id && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">got the last lead</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        <button disabled={saving || i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUpIcon className="h-4 w-4" /></button>
                        <button disabled={saving || i === settings.userIds.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDownIcon className="h-4 w-4" /></button>
                        <button disabled={saving} onClick={() => save({ userIds: settings.userIds.filter((x) => x !== id), enabled: settings.userIds.length > 1 ? settings.enabled : false })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><XMarkIcon className="h-4 w-4" /></button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <select value={adding} onChange={(e) => setAdding(e.target.value)} className={select}>
                  <option value="">Add a sales person...</option>
                  {users.filter((u) => !settings.userIds.includes(u.id)).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" disabled={!adding || saving} onClick={() => { save({ userIds: [...settings.userIds, Number(adding)] }); setAdding(''); }}>Add</Button>
                <Button size="sm" variant="secondary" disabled={!settings.userIds.length || saving} onClick={() => save({ userIds: users.map((u) => u.id) })}>Add everyone</Button>
              </div>
            </div>

            <div className="space-y-5">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={settings.onlyAvailable} disabled={saving} onChange={(e) => save({ onlyAvailable: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--primary)]" />
                <span>
                  Only give leads to people who are online and not on a call
                  <span className="block text-xs text-slate-400">If nobody is free, the next person in line still gets it, so no lead waits unassigned.</span>
                </span>
              </label>

              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Sources that rotate</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {settings.sources.length === 0 && <span className="text-sm text-slate-500">All sources</span>}
                  {settings.sources.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {leadSourceLabel(s)}
                      <button onClick={() => save({ sources: settings.sources.filter((x) => x !== s) })} aria-label={`Remove ${s}`}><XMarkIcon className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <select value={addingSource} onChange={(e) => { if (e.target.value) save({ sources: [...settings.sources, e.target.value] }); setAddingSource(''); }} className={`${select} py-1 text-xs`}>
                    <option value="">Only some sources...</option>
                    {LEAD_SOURCE_OPTIONS.filter((o) => !settings.sources.includes(o.value)).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {routingUrl && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Incoming calls in rotation</p>
              <p className="mt-1">Point your calling provider&apos;s dynamic routing (Exotel: Connect applet, &quot;dynamic URL&quot;) at this address, and incoming calls ring the same people in the same order:</p>
              <code className="mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-[11px] text-slate-700">{routingUrl}</code>
              <p className="mt-1 text-slate-400">Add <code>?format=text</code> for providers that want just one number. Each person needs their mobile saved in their profile.</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="secondary" disabled={saving || !settings.userIds.length} onClick={distribute}>Assign unassigned leads now</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
