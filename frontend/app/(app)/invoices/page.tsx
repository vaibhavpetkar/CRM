'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { formatCurrency } from '@/lib/utils';
import { invoicesApi } from '@/lib/api';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { INVOICE_FIELDS } from '@/lib/import-export/field-configs';
import { PlusIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = { client: '', amount: 10000, status: 'pending', issuedDate: '', dueDate: '' };

export default function InvoicesPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoicesApi.getInvoices();
      setInvoices(res.invoices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices. Is the backend running?');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const totalPaid = useMemo(() => invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices]);
  const totalPending = useMemo(() => invoices.filter((i) => i.status === 'pending').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices]);
  const totalOverdue = useMemo(() => invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await invoicesApi.createInvoice({ ...formData, amount: Number(formData.amount) });
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (invoice: any) => {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}?`)) return;
    try {
      await invoicesApi.deleteInvoice(invoice.id);
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete invoice');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Invoice #', accessor: (i) => <span className="font-medium text-[#168eea]">{i.invoiceNumber}</span> },
    { header: 'Client', accessor: (i) => <span className="text-slate-900">{i.client}</span> },
    { header: 'Amount', accessor: (i) => <span className="font-medium text-slate-900">{formatCurrency(i.amount)}</span> },
    { header: 'Status', accessor: (i) => <StatusBadge status={i.status} /> },
    { header: 'Issued', accessor: (i) => <span className="text-slate-500">{i.issuedDate ? String(i.issuedDate).split('T')[0] : 'N/A'}</span> },
    { header: 'Due Date', accessor: (i) => <span className="text-slate-500">{i.dueDate ? String(i.dueDate).split('T')[0] : 'N/A'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Track payments and billing"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Invoice',
                entityNamePlural: 'invoices',
                fields: INVOICE_FIELDS,
                getExportData: () => invoices,
                onImportRow: (row) =>
                  invoicesApi.createInvoice({
                    ...row,
                    amount: row.amount !== undefined && row.amount !== '' ? Number(row.amount) : undefined,
                  }),
                onImportComplete: fetchInvoices,
              }}
            />
            <Button size="sm" onClick={() => setIsModalOpen(true)}><PlusIcon className="h-4 w-4" /> New Invoice</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={formatCurrency(totalPaid)} changeType="positive" />
        <StatCard label="Pending" value={formatCurrency(totalPending)} />
        <StatCard label="Overdue" value={formatCurrency(totalOverdue)} changeType="negative" />
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          columns={columns}
          data={invoices}
          rowKey={(i) => i.id}
          loading={loading}
          showToolbar
          totalEntries={invoices.length}
          emptyMessage='No invoices yet. Click "New Invoice" to create one.'
          actions={(invoice) => (
            <button onClick={() => handleDelete(invoice)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">New Invoice</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Client</label>
                <input
                  type="text"
                  required
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Amount ($)</label>
                  <input
                    type="number"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Issued Date</label>
                  <input
                    type="date"
                    value={formData.issuedDate}
                    onChange={(e) => setFormData({ ...formData, issuedDate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Create Invoice'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
