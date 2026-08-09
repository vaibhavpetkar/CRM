'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { getStoredUser } from '@/lib/api';
import { settingsApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, KeyIcon, Cog6ToothIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const ENV_VAR_DEFINITIONS: Record<string, { label: string; type: 'text' | 'password' | 'url'; description: string }> = {
  GOOGLE_CLIENT_ID: { label: 'Google OAuth Client ID', type: 'text', description: 'Client ID from Google Cloud Console for OAuth login' },
  GOOGLE_CLIENT_SECRET: { label: 'Google OAuth Client Secret', type: 'password', description: 'Client Secret from Google Cloud Console' },
  EMAIL_SERVICE: { label: 'Email Service', type: 'text', description: 'Email service provider (e.g., gmail, sendgrid, mailgun)' },
  EMAIL_USER: { label: 'Email User', type: 'text', description: 'Email address for sending emails' },
  EMAIL_PASS: { label: 'Email Password / App Password', type: 'password', description: 'Email password or app-specific password (for Gmail, use App Password)' },
  EMAIL_FROM: { label: 'From Email', type: 'text', description: 'Display email address for outgoing emails' },
  EMAIL_SECURE: { label: 'Email Secure (SSL/TLS)', type: 'text', description: 'Use SSL/TLS for email (true/false)' },
  CLIENT_URL: { label: 'Frontend URL', type: 'url', description: 'Frontend URL for CORS and email links' },
  JWT_SECRET: { label: 'JWT Secret', type: 'password', description: '64-character secret for JWT token signing' },
  JWT_EXPIRES_IN: { label: 'JWT Expiry', type: 'text', description: 'Token expiration time (e.g., 7d, 24h)' },
  DB_PASSWORD: { label: 'Database Password', type: 'password', description: 'PostgreSQL database password' },
  SUPER_ADMIN_EMAIL: { label: 'Super Admin Email', type: 'text', description: 'Email for the initial super admin account' },
  SUPER_ADMIN_PASSWORD: { label: 'Super Admin Password', type: 'password', description: 'Password for the initial super admin account' },
  NEXT_PUBLIC_API_URL: { label: 'Public API URL', type: 'url', description: 'Backend API URL baked into frontend at build time' },
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: { label: 'Public Google Client ID', type: 'text', description: 'Google Client ID for frontend OAuth' },
};

export default function DeveloperSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [envVars, setEnvVars] = useState<Record<string, { value: string; isSet: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  // Check if user is super admin
  const user = getStoredUser();
  if (!user?.isSuperAdmin) {
    useEffect(() => {
      router.push('/dashboard');
    }, [router]);
    return null;
  }

  const fetchEnvVars = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.getEnvVars();
      const vars: Record<string, { value: string; isSet: boolean }> = {};
      res.envVars.forEach((v: any) => {
        vars[v.key] = { value: v.value, isSet: v.isSet };
      });
      setEnvVars(vars);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load environment variables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvVars();
  }, []);

  const handleChange = (key: string, value: string) => {
    setEnvVars(prev => ({
      ...prev,
      [key]: { ...prev[key], value, isSet: Boolean(value) },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      // Only send values that have been changed (not masked)
      const toSend: Record<string, string> = {};
      Object.entries(envVars).forEach(([key, { value }]) => {
        if (value && value !== '•'.repeat(8)) {
          toSend[key] = value;
        }
      });
      await settingsApi.updateEnvVars(toSend);
      setMessage({ type: 'success', text: 'Environment variables updated. Restart containers to apply changes.' });
      toast.success('Environment variables updated successfully');
      fetchEnvVars();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save environment variables' });
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getDisplayValue = (key: string) => {
    const { value, isSet } = envVars[key] || { value: '', isSet: false };
    if (!isSet) return '';
    if (showValues[key]) return value;
    return '•'.repeat(8);
  };

  const getInputType = (key: string) => {
    const def = ENV_VAR_DEFINITIONS[key];
    if (!def) return 'text';
    return showValues[key] ? def.type : 'password';
  };

  return (
    <>
      <PageHeader
        title="Developer Settings"
        description="Manage environment variables and system configuration (Super Admin only)"
      />

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <strong>⚠️ Warning:</strong> Changes here modify the <code>.env</code> file on the server. 
        After saving, you must restart the Docker containers for changes to take effect. 
        Incorrect values may break the application.
      </div>

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

      <Card title="Environment Variables">
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ENV_VAR_DEFINITIONS).map(([key, def]) => (
                <div key={key} className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    {def.label}
                    {envVars[key]?.isSet && <LockClosedIcon className="h-3.5 w-3.5 text-emerald-500" title="Configured" />}
                    {!envVars[key]?.isSet && <span className="text-xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">Not set</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={getInputType(key)}
                      value={getDisplayValue(key)}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={envVars[key]?.isSet ? 'Leave empty to keep current value' : 'Enter value...'}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showValues[key] ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">{def.description}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button type="submit" disabled={saving} className="ml-2">
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="System Actions" className="mt-6">
        <div className="flex flex-wrap gap-4">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <ArrowPathIcon className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <div className="flex items-center gap-2 text-sm text-slate-500 border-l border-slate-200 pl-4 ml-4">
            <Cog6ToothIcon className="h-4 w-4" /> Changes require container restart via VPS
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          After saving, SSH into the VPS and run: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">cd /var/www/crm && sudo docker compose up -d --build</code>
        </p>
      </Card>
    </>
  );
}