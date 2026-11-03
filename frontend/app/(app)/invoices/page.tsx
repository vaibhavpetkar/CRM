'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import SearchInput from '@/components/ui/search-input';
import { formatCurrency } from '@/lib/utils';
import { invoicesApi } from '@/lib/api';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { INVOICE_FIELDS } from '@/lib/import-export/field-configs';
import { PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import PrintButton from '@/components/ui/print-button';

const INVOICE_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function InvoicesPage() {
  const toast = useToast();
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
  const totalPending = useMemo(() => invoices.filter((i) => i.status === 'pending' || i.status === 'partial').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices]);
  const totalOverdue = useMemo(() => invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices]);

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
    { header: 'Invoice #', accessor: (i) => <Link href={`/invoices/${i.id}`} className="font-medium text-[var(--primary)] hover:underline">{i.invoiceNumber}</Link> },
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
            <Button size="sm" onClick={() => router.push('/invoices/new')}><PlusIcon className="h-4 w-4" /> New Invoice</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={formatCurrency(totalPaid)} changeType="positive" />
        <StatCard label="Pending" value={formatCurrency(totalPending)} />
        <StatCard label="Overdue" value={formatCurrency(totalOverdue)} changeType="negative" />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Search and Filters */}
      <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center">
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
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
          bulkDelete={{
            deleteRow: (i) => invoicesApi.deleteInvoice(i.id),
            onComplete: fetchInvoices,
            entityName: 'invoices',
          }}
          showToolbar
          totalEntries={invoices.length}
          emptyMessage='No invoices yet. Click "New Invoice" to create one.'
          actions={(invoice) => (
            <div className="flex justify-end gap-3">
              {/* Prints with the invoice's print format (Document Templates > Print Format) */}
              <PrintButton docType="invoice" id={invoice.id} variant="icon" />
              <Link href={`/invoices/${invoice.id}`} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </Link>
              <button onClick={() => handleDelete(invoice)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>

    </>
  );
}