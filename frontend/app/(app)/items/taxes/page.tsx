'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import StatusBadge from '@/components/ui/status-badge';
import { taxesApi } from '@/lib/api';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const TAX_TYPES = ['GST', 'CGST', 'SGST', 'IGST', 'VAT', 'Sales Tax', 'Custom'];

const emptyForm = {
  name: '',
  taxType: 'GST',
  rate: '',
  description: '',
};

export default function TaxMasterPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [taxes, setTaxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchTaxes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await taxesApi.getTaxes({ search });
      setTaxes(res.taxes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load taxes. Is the backend running?');
      setTaxes([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchTaxes();
  }, [fetchTaxes]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (tax: any) => {
    setEditingId(tax.id);
    setFormData({
      name: tax.name || '',
      taxType: tax.taxType || 'GST',
      rate: String(tax.rate ?? ''),
      description: tax.description || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...formData, rate: Number(formData.rate) };
      if (editingId) {
        await taxesApi.updateTax(editingId, payload);
      } else {
        await taxesApi.createTax(payload);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchTaxes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tax');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tax: any) => {
    if (!confirm(`Delete tax "${tax.name}"?`)) return;
    try {
      await taxesApi.deleteTax(tax.id);
      fetchTaxes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tax');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Code', accessor: (t) => <span className="font-mono text-xs text-slate-500">{t.code}</span> },
    { header: 'Name', accessor: (t) => <span className="font-medium text-slate-900">{t.name}</span> },
    { header: 'Type', accessor: (t) => <span className="text-slate-600">{t.taxType}</span> },
    { header: 'Rate', accessor: (t) => <span className="font-medium text-slate-900">{Number(t.rate).toFixed(2)}%</span> },
    {
      header: 'Status',
      accessor: (t) => <StatusBadge status={t.isActive ? 'active' : 'inactive'} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Tax Master"
        description="Manage tax rates (GST, VAT, etc.) used across items, quotes, and invoices"
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" /> Add Tax
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search taxes..." className="sm:max-w-xs" />
        <span className="text-sm text-slate-500">{taxes.length} tax{taxes.length === 1 ? '' : 'es'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          tableId="tax_master_table"
          columns={columns}
          data={taxes}
          rowKey={(t) => t.id}
          loading={loading}
          showToolbar
          totalEntries={taxes.length}
          emptyMessage='No taxes found. Click "Add Tax" to create one.'
          actions={(tax) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => openEdit(tax)} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(tax)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Tax' : 'Add New Tax'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Tax Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GST 18%"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tax Type</label>
                  <select
                    value={formData.taxType}
                    onChange={(e) => setFormData({ ...formData, taxType: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    {TAX_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Rate (%)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    step="0.01"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update Tax' : 'Save Tax'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
