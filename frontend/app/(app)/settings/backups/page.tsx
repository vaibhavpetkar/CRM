'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { backupsApi, getStoredUser, type BackupInfo, type BackupList } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const KIND_LABELS: Record<BackupInfo['kind'], { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-blue-50 text-blue-700' },
  auto: { label: 'Daily', className: 'bg-emerald-50 text-emerald-700' },
  'pre-restore': { label: 'Before restore', className: 'bg-amber-50 text-amber-700' },
  uploaded: { label: 'Uploaded', className: 'bg-purple-50 text-purple-700' },
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
};

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

type RestoreTarget = { mode: 'existing'; backup: BackupInfo } | { mode: 'upload'; file: File };

export default function BackupsPage() {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  // null until the stored user is read on the client (localStorage).
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<BackupList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // What this page is doing right now: 'create', 'restore', 'delete:<name>', 'download:<name>'.
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<BackupInfo | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await backupsApi.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, 'Could not load backups.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const allowed = !!getStoredUser()?.isSuperAdmin;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only, so this must run after mount
    setIsSuperAdmin(allowed);
    if (!allowed) {
      router.push('/dashboard');
      return;
    }
    load();
  }, [router]);

  const handleCreate = async () => {
    setBusy('create');
    setMessage(null);
    try {
      const res = await backupsApi.create();
      if (res.backup.warning) {
        toast.warning(res.backup.warning);
      } else {
        toast.success(`Backup created (${formatSize(res.backup.size)}).`);
      }
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Backup failed.') });
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (fileName: string) => {
    setBusy(`download:${fileName}`);
    try {
      await backupsApi.download(fileName);
    } catch (err) {
      toast.error(errorText(err, 'Download failed.'));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const name = deleting.name;
    setBusy(`delete:${name}`);
    try {
      await backupsApi.remove(name);
      toast.success('Backup deleted.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the backup.'));
    } finally {
      setBusy(null);
    }
  };

  const openRestore = (t: RestoreTarget) => {
    setTarget(t);
    setConfirmText('');
    setRestoreUploads(true);
    setUploadProgress(null);
  };

  const closeRestore = () => {
    if (busy === 'restore') return;
    setTarget(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dump')) {
      toast.error('Choose a .dump file (made with Back up now or pg_dump -Fc).');
      e.target.value = '';
      return;
    }
    openRestore({ mode: 'upload', file });
  };

  const handleRestore = async () => {
    if (!target || confirmText !== 'RESTORE') return;
    setBusy('restore');
    setMessage(null);
    try {
      const res =
        target.mode === 'existing'
          ? await backupsApi.restore(target.backup.name, restoreUploads && !!target.backup.uploadsArchive)
          : await backupsApi.uploadAndRestore(target.file, setUploadProgress);
      setTarget(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage({
        type: 'success',
        text:
          `Restored ${res.restored}${res.uploadsRestored ? ' (database and uploaded files)' : ''}. ` +
          `What was there before is saved as ${res.safetyBackup}. ` +
          'If anything looks out of date, sign out and sign in again.',
      });
      toast.success('Restore complete.');
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Restore failed. Nothing was changed.') });
      setTarget(null);
      if (fileInput.current) fileInput.current.value = '';
    } finally {
      setBusy(null);
      setUploadProgress(null);
    }
  };

  if (!isSuperAdmin) return null;

  const serverBusy = !!data?.running;
  const anyBusy = !!busy || serverBusy;
  const toolsMissing = data && (!data.tools.pgDump || !data.tools.pgRestore);

  return (
    <>
      <PageHeader
        title="Backups"
        description="Back up the whole database and uploaded files, download copies, and restore (Super Admin only)"
        actions={
          <>
            <Button variant="secondary" onClick={load} disabled={loading || !!busy}>
              <ArrowPathIcon className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={anyBusy}>
              <ArrowUpTrayIcon className="h-4 w-4" /> Upload a backup and restore
            </Button>
            <Button onClick={handleCreate} disabled={anyBusy}>
              <CircleStackIcon className="h-4 w-4" /> {busy === 'create' ? 'Backing up…' : 'Back up now'}
            </Button>
          </>
        }
      />

      <input ref={fileInput} type="file" accept=".dump" className="hidden" onChange={onFileChosen} />

      {message && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          {message.text}
        </div>
      )}

      {serverBusy && !busy && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          A {data?.running} is running on the server. Refresh in a moment.
        </div>
      )}

      {busy === 'create' && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          Taking a backup of the database and uploaded files. This can take a few minutes for a large database; keep this page open.
        </div>
      )}

      {toolsMissing && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          The PostgreSQL backup tools (pg_dump / pg_restore) are not installed on the server. Rebuild the backend image:{' '}
          <code className="rounded bg-white px-1">docker compose up -d --build backend</code>
        </div>
      )}

      <Card title="Saved backups">
        {loading && !data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : !data || data.backups.length === 0 ? (
          <p className="text-sm text-slate-500">No backups yet. Click &ldquo;Back up now&rdquo; to take the first one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">Taken</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Database</th>
                  <th className="py-2 pr-4 font-medium">Uploaded files</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.backups.map((b) => (
                  <tr key={b.name} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{formatDate(b.createdAt)}</div>
                      <div className="text-xs text-slate-400">{b.name}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${KIND_LABELS[b.kind].className}`}>
                        {KIND_LABELS[b.kind].label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{formatSize(b.size)}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {b.uploadsArchive ? (
                        <button
                          className="text-[var(--primary)] hover:underline disabled:opacity-50"
                          onClick={() => handleDownload(b.uploadsArchive!.name)}
                          disabled={!!busy}
                          title="Download the uploaded files archive (.tar.gz)"
                        >
                          {formatSize(b.uploadsArchive.size)}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => handleDownload(b.name)} disabled={!!busy}>
                          <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                          {busy === `download:${b.name}` ? 'Preparing…' : 'Download'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openRestore({ mode: 'existing', backup: b })} disabled={anyBusy}>
                          <ArrowPathIcon className="h-3.5 w-3.5" /> Restore
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(b)} disabled={anyBusy} title="Delete this backup">
                          <TrashIcon className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && (
        <p className="mt-3 text-xs text-slate-400">
          {data.keep > 0 ? `The newest ${data.keep} backups are kept; older ones are removed automatically.` : 'All backups are kept.'}{' '}
          {data.dailyAt ? `A backup is also taken every day at ${data.dailyAt} IST.` : 'Daily automatic backups are off (set BACKUP_DAILY_AT to turn them on).'}{' '}
          Backups are stored on the server; download a copy now and then and keep it somewhere else too.
          {data.tools.pgDump && <span className="block">{data.tools.pgDump}</span>}
        </p>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Restore a backup</h3>
              <button onClick={closeRestore} disabled={busy === 'restore'} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">All current data will be replaced.</p>
                  <p className="mt-1">
                    Every company&apos;s leads, deals, quotes, invoices, users and settings go back to how they were in this backup.
                    Anything added since then is lost. A safety backup of the current data is taken first.
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                {target.mode === 'existing' ? (
                  <>
                    <p className="font-medium text-slate-800">{formatDate(target.backup.createdAt)}</p>
                    <p className="text-xs text-slate-500">
                      {target.backup.name} · {formatSize(target.backup.size)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-slate-800">{target.file.name}</p>
                    <p className="text-xs text-slate-500">Uploaded file · {formatSize(target.file.size)}</p>
                  </>
                )}
              </div>

              {target.mode === 'existing' && target.backup.uploadsArchive && (
                <label className="flex items-start gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={restoreUploads}
                    onChange={(e) => setRestoreUploads(e.target.checked)}
                    disabled={busy === 'restore'}
                  />
                  <span>Also restore uploaded files (attachments, PDFs, call recordings) from this backup</span>
                </label>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Type <strong>RESTORE</strong> to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  disabled={busy === 'restore'}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              {busy === 'restore' && (
                <div className="space-y-2 text-slate-600">
                  {uploadProgress !== null && uploadProgress < 1 ? (
                    <>
                      <p>Uploading… {Math.round(uploadProgress * 100)}%</p>
                      <div className="h-2 overflow-hidden rounded bg-slate-100">
                        <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p>Restoring… this can take a few minutes. Keep this page open.</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={closeRestore} disabled={busy === 'restore'}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRestore} disabled={confirmText !== 'RESTORE' || busy === 'restore'}>
                {busy === 'restore' ? 'Restoring…' : 'Replace all data'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete this backup?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {formatDate(deleting.createdAt)} ({deleting.name}) will be removed from the server
              {deleting.uploadsArchive ? ', with its uploaded files archive' : ''}. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={!!busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={!!busy}>
                {busy === `delete:${deleting.name}` ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
