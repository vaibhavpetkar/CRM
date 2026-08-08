'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { campaignsApi } from '@/lib/api';
import { PlusIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

import FormField, { getInputClassName } from '@/components/ui/form-field';
import { campaignSchema, validateForm, FieldErrors } from '@/lib/validation';

const emptyForm = { name: '', type: 'email', status: 'draft', startDate: '' };

export default function CampaignsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignsRes, statsRes] = await Promise.all([
        campaignsApi.getCampaigns({ status: filter }),
        campaignsApi.getStats().catch(() => null),
      ]);
      setCampaigns(campaignsRes.campaigns || []);
      setStats(statsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns. Is the backend running?');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const validation = validateForm(campaignSchema, {
      name: formData.name,
      type: formData.type,
      status: formData.status,
      startDate: formData.startDate,
    });

    if (!validation.success) {
      setFieldErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await campaignsApi.createCampaign(formData);
      setIsModalOpen(false);
      setFormData(emptyForm);
      setFieldErrors({});
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (campaign: any) => {
    if (!confirm(`Delete campaign "${campaign.name}"?`)) return;
    try {
      await campaignsApi.deleteCampaign(campaign.id);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete campaign');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Campaign', accessor: (c) => <span className="font-medium text-slate-900">{c.name}</span> },
    { header: 'Type', accessor: (c) => <span className="capitalize text-slate-600">{c.type}</span> },
    { header: 'Status', accessor: (c) => <StatusBadge status={c.status} /> },
    { header: 'Sent', accessor: (c) => <span className="text-slate-600">{Number(c.sent || 0).toLocaleString()}</span> },
    { header: 'Opened', accessor: (c) => <span className="text-slate-600">{Number(c.opened || 0).toLocaleString()}</span> },
    { header: 'Clicked', accessor: (c) => <span className="text-slate-600">{Number(c.clicked || 0).toLocaleString()}</span> },
    { header: 'Converted', accessor: (c) => <span className="font-medium text-emerald-600">{c.converted || 0}</span> },
    { header: 'Start Date', accessor: (c) => <span className="text-slate-500">{c.startDate ? String(c.startDate).split('T')[0] : 'N/A'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create and manage email & SMS marketing campaigns"
        actions={<Button size="sm" onClick={() => { setFieldErrors({}); setIsModalOpen(true); }}><PlusIcon className="h-4 w-4" /> New Campaign</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Sent" value={(stats?.sent ?? 0).toLocaleString()} />
        <StatCard label="Conversions" value={stats?.converted ?? 0} changeType="positive" />
        <StatCard label="Open Rate" value={`${stats?.openRate ?? 0}%`} />
        <StatCard label="Click Rate" value={`${stats?.clickRate ?? 0}%`} />
      </div>

      <div className="mb-4 flex gap-2">
        {['all', 'active', 'draft', 'scheduled', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === status ? 'bg-[var(--primary)] text-white border border-transparent' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          columns={columns}
          data={campaigns}
          rowKey={(c) => c.id}
          loading={loading}
          emptyMessage='No campaigns yet. Click "New Campaign" to create one.'
          actions={(campaign) => (
            <button onClick={() => handleDelete(campaign)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">New Campaign</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <FormField label="Campaign Name" required error={fieldErrors.name}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={getInputClassName(!!fieldErrors.name)}
                  placeholder="Spring Promo 2026"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Type">
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className={getInputClassName()}
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </FormField>

                <FormField label="Status">
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className={getInputClassName()}
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Start Date" error={fieldErrors.startDate}>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={getInputClassName(!!fieldErrors.startDate)}
                />
              </FormField>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Create Campaign'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

