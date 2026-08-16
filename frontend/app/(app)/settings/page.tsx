'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { authApi, googleTasksApi, getStoredUser } from '@/lib/api';
import Link from 'next/link';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
] as const;

type Tab = { id: string; label: string; icon?: React.ReactNode };

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getStoredUser());
    authApi.getMe().then(setUser).catch(() => {});
  }, []);

  // Deep-link support: /settings?tab=security, etc.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  // ─── My Profile: Google Tasks personal integration (moved here from the
  // old standalone /profile page) ─────────────────────────────────────────
  const [gTasksStatus, setGTasksStatus] = useState<{ configured: boolean; connected: boolean; lastSyncAt: string | null; lastError: string | null } | null>(null);
  const [gTasksLoading, setGTasksLoading] = useState(true);
  const [gTasksActing, setGTasksActing] = useState(false);

  const loadGTasksStatus = () => {
    setGTasksLoading(true);
    googleTasksApi
      .getStatus()
      .then(setGTasksStatus)
      .catch(() => setGTasksStatus(null))
      .finally(() => setGTasksLoading(false));
  };

  useEffect(loadGTasksStatus, []);

  // Backend redirects here (with ?tab=profile) after the Google OAuth round-trip completes.
  useEffect(() => {
    const result = searchParams.get('googleTasks');
    if (result === 'connected') {
      toast.success('Google Tasks connected.');
      loadGTasksStatus();
      router.replace('/settings?tab=profile');
    } else if (result === 'error') {
      toast.error('Could not connect Google Tasks — please try again.');
      router.replace('/settings?tab=profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleGTasksConnect = async () => {
    setGTasksActing(true);
    try {
      const res = await googleTasksApi.connect();
      window.location.href = res.url; // hand off to Google's consent screen
    } catch (err: any) {
      toast.error(err.message || 'Could not start the Google Tasks connection.');
      setGTasksActing(false);
    }
  };

  const handleGTasksDisconnect = async () => {
    setGTasksActing(true);
    try {
      await googleTasksApi.disconnect();
      toast.success('Google Tasks disconnected.');
      loadGTasksStatus();
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect.');
    } finally {
      setGTasksActing(false);
    }
  };

  const isSuperAdmin = user?.isSuperAdmin;

  const superAdminTabs: Tab[] = isSuperAdmin
    ? [{ id: 'developer', label: 'Developer', icon: <Cog6ToothIcon className="h-4 w-4" /> }]
    : [];

  const allTabs: Tab[] = [...tabs, ...superAdminTabs];

  // ─── Change password form state ────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    setPwSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPwMessage({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwMessage({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'developer') {
                window.location.href = '/settings/developer';
              } else {
                setActiveTab(tab.id);
              }
            }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id || (tab.id === 'developer' && window.location.pathname === '/settings/developer')
                ? 'border-b-2 border-[#168eea] text-[#168eea]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <Card title="Profile Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">First Name</label>
              <input
                readOnly
                value={user?.firstName || ''}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Last Name</label>
              <input
                readOnly
                value={user?.lastName || ''}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                readOnly
                value={user?.email || ''}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
              <input
                readOnly
                value={user?.isSuperAdmin ? 'Administrator (Super Admin)' : user?.role?.name || 'No role assigned'}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Profile details are managed by your administrator. Contact them to update this information.
          </p>
        </Card>
      )}

      {activeTab === 'profile' && (
        <Card title="Google Tasks" className="mt-6">
          <p className="mb-4 text-xs text-slate-500">
            Connect your own Google account so tasks assigned to you here automatically show up in your Google Tasks list.
            This is personal — connecting doesn&apos;t affect any other user.
          </p>

          {gTasksLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : !gTasksStatus?.configured ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              Not available yet — an admin needs to set <code className="rounded bg-white/60 px-1 py-0.5">GOOGLE_CLIENT_ID</code> and{' '}
              <code className="rounded bg-white/60 px-1 py-0.5">GOOGLE_CLIENT_SECRET</code> on the server first.
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <StatusBadge status={gTasksStatus.connected ? 'active' : 'not_configured'} />
                {gTasksStatus.connected ? (
                  <Button type="button" variant="secondary" size="sm" disabled={gTasksActing} onClick={handleGTasksDisconnect}>
                    Disconnect
                  </Button>
                ) : (
                  <Button type="button" size="sm" disabled={gTasksActing} onClick={handleGTasksConnect}>
                    Connect Google Tasks
                  </Button>
                )}
              </div>
              {gTasksStatus.connected && (
                <p className="text-[11px] text-slate-400">
                  Last sync: {gTasksStatus.lastSyncAt ? new Date(gTasksStatus.lastSyncAt).toLocaleString() : 'not yet — assign yourself a task to try it'}
                </p>
              )}
              {gTasksStatus.lastError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">{gTasksStatus.lastError}</div>
              )}
            </>
          )}
        </Card>
      )}

      {activeTab === 'security' && (
        <Card title="Change Password">
          {pwMessage && (
            <div
              className={`mb-4 rounded-md border p-3 text-sm ${
                pwMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}
            >
              {pwMessage.text}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
              />
            </div>
            <Button type="submit" disabled={pwSubmitting}>
              {pwSubmitting ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card title="Notification Preferences">
          <div className="space-y-4">
            {[
              { id: 'email', label: 'Email Notifications', desc: 'Receive updates via email' },
              { id: 'push', label: 'Push Notifications', desc: 'Instant alerts on your device' },
              { id: 'sms', label: 'SMS Notifications', desc: 'Critical alerts via text message' },
              { id: 'activity', label: 'Activity Reminders', desc: 'Reminders for tasks and meetings' },
            ].map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border border-slate-100 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <input type="checkbox" defaultChecked={item.id !== 'sms'} className="h-4 w-4 rounded border-slate-300 text-[#168eea]" />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Notification delivery isn&apos;t wired up yet — this panel is for preference capture only.</p>
        </Card>
      )}

      {activeTab === 'preferences' && (
        <Card title="Preferences">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: 'Language', options: ['English', 'Spanish', 'French'] },
              { label: 'Timezone', options: ['UTC', 'EST', 'PST', 'IST'] },
              { label: 'Date Format', options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] },
            ].map((pref) => (
              <div key={pref.label}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{pref.label}</label>
                <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]">
                  {pref.options.map((opt) => <option key={opt}>{opt}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Currency is an organization-wide setting, not a personal preference — manage it under{' '}
            <Link href="/settings/company" className="font-medium text-[#168eea] hover:underline">Company Settings</Link>.
          </p>
        </Card>
      )}
    </>
  );
}
