'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import SearchInput from '@/components/ui/search-input';
import { formatCurrency } from '@/lib/utils';
import { invoicesApi } from '@/lib/api';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { INVOICE_FIELDS } from '@/lib/import-export/field-configs';
import { PlusIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = { 
  client: '', 
  customerEmail: '', 
  customerPhone: '', 
  customerAddress: '',
  companyAddress: '',
  amount: 10000, 
  status: 'draft', 
  issuedDate: '', 
  dueDate: '',
  quoteId: '',
};

const INVOICE_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function InvoicesPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Handle company selection from autocomplete
  const handleCompanySelect = (company: any) => {
    setFormData((prev: any) => ({
      ...prev,
      client: company.name,
      customerEmail: company.email || '',
      customerPhone: company.phone || '',
      customerAddress: company.address || '',
    }));
  };

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoicesApi.getInvoices({ search, status: statusFilter });
      setInvoices(res.invoices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices. Is the backend running?');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

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
      await invoicesApi.createInvoice({ 
        ...formData, 
        amount: Number(formData.amount),
        quoteId: formData.quoteId || undefined,
      });
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchInvoices();
      toast.success('Invoice created successfully');
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
      toast.success('Invoice deleted');
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
    { header: 'Email', accessor: (i) => <span className="text-slate-500 text-sm">{i.customerEmail || '—'}</span> },
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

      {/* Search and Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput 
          value={search} 
          onChange={setSearch} 
          placeholder="Search by Invoice # or Company Name..." 
          className="sm:max-w-xs" 
        />
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          >
            {INVOICE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-slate-500">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</span>
      </div>

      <Card>
        <DataTable
          tableId="invoices_table"
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
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">New Invoice</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              {/* Client Selection with Autocomplete */}
              <div>
                <label className="block text-xs font-medium text-slate-700">Client *</label>
                <CompanyAutocomplete
                  value={formData.client}
                  onChange={(val) => setFormData({ ...formData, client: val })}
                  onSelect={handleCompanySelect}
                  placeholder="Type client name to search..."
                />
              </div>

              {/* Customer Details (auto-filled from selection) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Customer Email</label>
                  <input
                    type="email"
                    value={formData.customerEmail}
                    onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                    placeholder="client@example.com"
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Customer Phone</label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    placeholder="+1 234 567 8900"
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              {/* Addresses */}
              <div>
                <label className="block text-xs font-medium text-slate-700">Customer Address</label>
                <textarea
                  value={formData.customerAddress}
                  onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                  placeholder="Client billing address..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Company Address</label>
                <textarea
                  value={formData.companyAddress}
                  onChange={(e) => setFormData({ ...formData, companyAddress: e.target.value })}
                  placeholder="Your company address..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              {/* Amount and Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Amount *</label>
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
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
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