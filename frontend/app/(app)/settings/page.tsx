'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { authApi, getStoredUser } from '@/lib/api';
import Link from 'next/link';

const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getStoredUser());
    authApi.getMe().then(setUser).catch(() => {});
  }, []);

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
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[#168eea] text-[#168eea]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
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
