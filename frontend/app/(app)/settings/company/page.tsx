'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { companyApi } from '@/lib/api';
import { setCachedCurrency } from '@/lib/currency';

const CURRENCIES = [
  { code: 'USD', label: 'USD ($) — US Dollar' },
  { code: 'EUR', label: 'EUR (€) — Euro' },
  { code: 'GBP', label: 'GBP (£) — British Pound' },
  { code: 'INR', label: 'INR (₹) — Indian Rupee' },
  { code: 'AUD', label: 'AUD (A$) — Australian Dollar' },
  { code: 'CAD', label: 'CAD (C$) — Canadian Dollar' },
  { code: 'JPY', label: 'JPY (¥) — Japanese Yen' },
  { code: 'CNY', label: 'CNY (¥) — Chinese Yuan' },
  { code: 'AED', label: 'AED (د.إ) — UAE Dirham' },
  { code: 'SGD', label: 'SGD (S$) — Singapore Dollar' },
];

const emptyForm = {
  name: '',
  industry: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  employeeCount: '51-100',
  currency: 'USD',
  whatsapp: '',
  instagram: '',
  facebook: '',
  linkedin: '',
  youtube: '',
  twitter: '',
  quoteMessageTemplate: '',
};

const DEFAULT_TEMPLATE_PLACEHOLDER = `Hi {{customerName}},

We've prepared your quotation {{quoteNumber}} from {{companyName}}.

Quote Value: {{quoteValue}}

You can review it here:
{{quoteLink}}

If everything looks good, we can proceed with the next step and get started.

{{companySocialLinks}}`;

export default function CompanySettingsPage() {
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    companyApi
      .getCompany()
      .then((company) => {
        setFormData({
          name: company.name || '',
          industry: company.industry || '',
          email: company.email || '',
          phone: company.phone || '',
          address: company.address || '',
          website: company.website || '',
          employeeCount: company.employeeCount || '51-100',
          currency: company.currency || 'USD',
          whatsapp: company.whatsapp || '',
          instagram: company.instagram || '',
          facebook: company.facebook || '',
          linkedin: company.linkedin || '',
          youtube: company.youtube || '',
          twitter: company.twitter || '',
          quoteMessageTemplate: company.quoteMessageTemplate || '',
        });
      })
      .catch((err) => setError(err.message || 'Failed to load company settings. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await companyApi.updateCompany(formData);
      // Reflect the new currency everywhere immediately — no page reload needed.
      setCachedCurrency(res.company.currency);
      setMessage({ type: 'success', text: 'Company settings saved.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save company settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Company Settings" description="Manage your organization details" />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card title="Company Information">
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-600'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Company Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Industry</label>
                <input
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Address</label>
                <input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Website</label>
                <input
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Employee Count</label>
                <select
                  value={formData.employeeCount}
                  onChange={(e) => setFormData({ ...formData, employeeCount: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                >
                  <option>1-10</option>
                  <option>11-50</option>
                  <option>51-100</option>
                  <option>101-250</option>
                  <option>250+</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">Applies to every amount shown across the CRM (deals, leads, invoices, quotes, reports).</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Company Info'}</Button>
            </div>
          </form>
        )}
      </Card>

      {!loading && (
        <>
          <Card title="Social Links" className="mt-6">
            <p className="mb-4 text-xs text-slate-400">
              Only links you fill in here are ever shown to customers — nothing is fabricated. Used in Quote-sharing messages (WhatsApp/email).
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">WhatsApp Business Number</label>
                  <input
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="e.g. 919876543210 (with country code, no +)"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Instagram</label>
                  <input
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="https://instagram.com/yourhandle"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Facebook</label>
                  <input
                    value={formData.facebook}
                    onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                    placeholder="https://facebook.com/yourpage"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">LinkedIn</label>
                  <input
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/company/yourcompany"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">YouTube</label>
                  <input
                    value={formData.youtube}
                    onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                    placeholder="https://youtube.com/@yourchannel"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">X / Twitter</label>
                  <input
                    value={formData.twitter}
                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                    placeholder="https://x.com/yourhandle"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Social Links'}</Button>
              </div>
            </form>
          </Card>

          <Card title="Quote Share Message" className="mt-6">
            <p className="mb-4 text-xs text-slate-400">
              Used whenever a Quote is shared via WhatsApp or email. Leave blank to use the default below. Placeholders:{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{customerName}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{quoteNumber}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{quoteValue}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{quoteLink}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{companyName}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">{'{{companySocialLinks}}'}</code>
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                rows={9}
                value={formData.quoteMessageTemplate}
                onChange={(e) => setFormData({ ...formData, quoteMessageTemplate: e.target.value })}
                placeholder={DEFAULT_TEMPLATE_PLACEHOLDER}
                className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
              />
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Message Template'}</Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
