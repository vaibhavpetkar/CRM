'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { googleTasksApi, getStoredUser } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export default function ProfilePage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = typeof window !== 'undefined' ? getStoredUser() : null;

  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; lastSyncAt: string | null; lastError: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = () => {
    setLoading(true);
    googleTasksApi
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Backend redirects here after the Google OAuth round-trip completes.
  useEffect(() => {
    const result = searchParams.get('googleTasks');
    if (result === 'connected') {
      toast.success('Google Tasks connected.');
      load();
      router.replace('/profile');
    } else if (result === 'error') {
      toast.error('Could not connect Google Tasks — please try again.');
      router.replace('/profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = async () => {
    setActing(true);
    try {
      const res = await googleTasksApi.connect();
      window.location.href = res.url; // hand off to Google's consent screen
    } catch (err: any) {
      toast.error(err.message || 'Could not start the Google Tasks connection.');
      setActing(false);
    }
  };

  const handleDisconnect = async () => {
    setActing(true);
    try {
      await googleTasksApi.disconnect();
      toast.success('Google Tasks disconnected.');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect.');
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <PageHeader title="My Profile" description="Your account and personal integrations." />

      <Card title="Account">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-400">Name</p>
            <p className="text-slate-800">{currentUser?.firstName} {currentUser?.lastName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Email</p>
            <p className="text-slate-800">{currentUser?.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Role</p>
            <p className="text-slate-800">{currentUser?.role?.name || '—'}</p>
          </div>
        </div>
      </Card>

      <Card title="Google Tasks" className="mt-6">
        <p className="mb-4 text-xs text-slate-500">
          Connect your own Google account so tasks assigned to you here automatically show up in your Google Tasks list.
          This is personal — connecting doesn't affect any other user.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : !status?.configured ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Not available yet — an admin needs to set <code className="rounded bg-white/60 px-1 py-0.5">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="rounded bg-white/60 px-1 py-0.5">GOOGLE_CLIENT_SECRET</code> on the server first.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <StatusBadge status={status.connected ? 'active' : 'not_configured'} />
              {status.connected ? (
                <Button type="button" variant="secondary" size="sm" disabled={acting} onClick={handleDisconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={acting} onClick={handleConnect}>
                  Connect Google Tasks
                </Button>
              )}
            </div>
            {status.connected && (
              <p className="text-[11px] text-slate-400">
                Last sync: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'not yet — assign yourself a task to try it'}
              </p>
            )}
            {status.lastError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">{status.lastError}</div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
