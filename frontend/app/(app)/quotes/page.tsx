'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { QUOTE_FIELDS } from '@/lib/import-export/field-configs';
import { formatCurrency } from '@/lib/utils';
import { quotesApi } from '@/lib/api';
import Link from 'next/link';
import { PlusIcon, XMarkIcon, TrashIcon, PaperAirplaneIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = { deal: '', client: '', amount: 10000, status: 'draft', validUntil: '' };

export default function QuotesPage() {
  const toast = useToast();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [sendQuoteId, setSendQuoteId] = useState<string | number | null>(null);
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email');
  const [sendTarget, setSendTarget] = useState('');

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await quotesApi.getQuotes();
      setQuotes(res.quotes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load quotes. Is the backend running?');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await quotesApi.createQuote({ ...formData, amount: Number(formData.amount) });
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchQuotes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create quote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (quote: any) => {
    if (!confirm(`Delete quote ${quote.quoteNumber}?`)) return;
    try {
      await quotesApi.deleteQuote(quote.id);
      fetchQuotes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete quote');
    }
  };

  const handleSendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendQuoteId) return;
    setSubmitting(true);
    try {
      if (sendMethod === 'whatsapp') {
        // WhatsApp sending isn't implemented server-side — open a wa.me chat instead.
        const digits = sendTarget.replace(/[^\d]/g, '');
        window.open(`https://wa.me/${digits}`, '_blank');
        setSendQuoteId(null);
        setSendTarget('');
        return;
      }

      const res = await quotesApi.sendQuote(sendQuoteId, { method: 'email', email: sendTarget });
      if (res.sent) {
        toast.success('Quote emailed successfully.');
      } else {
        toast.warning('Email logged but not sent — SMTP is not configured on the server.');
      }
      setSendQuoteId(null);
      setSendTarget('');
      fetchQuotes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send quote');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Quote #', accessor: (q) => <Link href={`/quotes/${q.id}`} className="font-medium text-[#168eea] hover:underline">{q.quoteNumber}</Link> },
    { header: 'Client', accessor: (q) => <span className="text-slate-600">{q.client}</span> },
    { header: 'Amount', accessor: (q) => <span className="font-medium text-slate-900">{formatCurrency(q.amount)}</span> },
    { header: 'Status', accessor: (q) => <StatusBadge status={q.status} /> },
    {
      header: 'Valid Until',
      headerClassName: 'w-24',
      className: 'w-24',
      accessor: (q) => <span className="text-slate-500 text-sm">{q.validUntil ? String(q.validUntil).split('T')[0] : 'N/A'}</span>,
    },
    {
      header: 'Created',
      headerClassName: 'w-24',
      className: 'w-24',
      accessor: (q) => <span className="text-slate-500 text-sm">{q.createdAt ? String(q.createdAt).split('T')[0] : 'N/A'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Create and manage sales quotes"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Quote',
                entityNamePlural: 'quotes',
                fields: QUOTE_FIELDS,
                getExportData: () => quotes,
                onImportRow: (row) =>
                  quotesApi.createQuote({
                    ...row,
                    amount: row.amount !== undefined && row.amount !== '' ? Number(row.amount) : undefined,
                  }),
                onImportComplete: fetchQuotes,
              }}
            />
            <Button size="sm" onClick={() => setIsModalOpen(true)}><PlusIcon className="h-4 w-4" /> New Quote</Button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          showToolbar
          tableId="quotes_table"
          columns={columns}
          data={quotes}
          rowKey={(q) => q.id}
          loading={loading}
          emptyMessage='No quotes yet. Click "New Quote" to create one.'
          actions={(quote) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => setSendQuoteId(quote.id)} className="text-slate-400 hover:text-[#168eea]" aria-label="Send">
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
              {/* Task 3.1: Print Format — opens the quote detail page's print view directly */}
              <Link href={`/quotes/${quote.id}?print=1`} className="text-slate-400 hover:text-[#168eea]" aria-label="Print">
                <PrinterIcon className="h-4 w-4" />
              </Link>
              <button onClick={() => handleDelete(quote)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
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
              <h3 className="text-lg font-semibold text-slate-900">New Quote</h3>
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
              <div>
                <label className="block text-xs font-medium text-slate-700">Related Deal</label>
                <input
                  type="text"
                  placeholder="e.g. Enterprise License - TechCorp"
                  value={formData.deal}
                  onChange={(e) => setFormData({ ...formData, deal: e.target.value })}
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
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Valid Until</label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Create Quote'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sendQuoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Send Quote</h3>
              <button onClick={() => setSendQuoteId(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSendQuote} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Method</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="method"
                      value="email"
                      checked={sendMethod === 'email'}
                      onChange={() => setSendMethod('email')}
                      className="text-[#168eea] focus:ring-[#168eea]"
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="method"
                      value="whatsapp"
                      checked={sendMethod === 'whatsapp'}
                      onChange={() => setSendMethod('whatsapp')}
                      className="text-[#168eea] focus:ring-[#168eea]"
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {sendMethod === 'email' ? 'Email Address' : 'Phone Number (with country code)'}
                </label>
                <input
                  type={sendMethod === 'email' ? 'email' : 'tel'}
                  required
                  value={sendTarget}
                  onChange={(e) => setSendTarget(e.target.value)}
                  placeholder={sendMethod === 'email' ? 'client@example.com' : 'e.g. +1234567890'}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setSendQuoteId(null)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Sending...' : 'Send'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
