'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import { QUOTE_FIELDS } from '@/lib/import-export/field-configs';
import { formatCurrency } from '@/lib/utils';
import { getCachedCurrency } from '@/lib/currency';
import { quotesApi, aiApi } from '@/lib/api';
import Link from 'next/link';
import { PlusIcon, XMarkIcon, TrashIcon, PaperAirplaneIcon, PrinterIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = { deal: '', client: '', customerEmail: '', customerPhone: '', customerAddress: '', amount: '', status: 'draft', validUntil: '' };

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
  const [shareContent, setShareContent] = useState<{ message: string; quoteLink: string; customerPhone: string | null; customerEmail: string | null; quoteNumber: string } | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

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

  const openSendModal = async (quote: any) => {
    setSendQuoteId(quote.id);
    setSendMethod('email');
    setSendTarget(quote.customerEmail || '');
    setShareContent(null);
    setShareLoading(true);
    try {
      const content = await quotesApi.getShareContent(quote.id);
      setShareContent(content);
      setMessageText(content.message);
      // Prefer the freshly-fetched contact details (covers quotes loaded
      // before customerEmail/customerPhone were on the row) without
      // clobbering anything already typed.
      setSendTarget((prev) => prev || content.customerEmail || '');
    } catch (err: any) {
      toast.error(err.message || 'Failed to prepare the quote share message.');
    } finally {
      setShareLoading(false);
    }
  };

  // Phase 20 — AI Assistant. Replaces the template-based message with a
  // freshly generated one via the real Anthropic API; falls back to leaving
  // the template message in place if AI isn't configured/available.
  const handleAIPersonalize = async () => {
    if (!sendQuoteId) return;
    setAiLoading(true);
    try {
      const res = await aiApi.quoteFollowUpMessage(sendQuoteId);
      setMessageText(res.message);
    } catch (err: any) {
      toast.warning(err.message || 'Could not generate an AI message — kept the template instead.');
    } finally {
      setAiLoading(false);
    }
  };

  // Keep the target field in sync with the right contact channel when the
  // user switches Email <-> WhatsApp, without overwriting a manual edit.
  const handleMethodChange = (method: 'email' | 'whatsapp') => {
    setSendMethod(method);
    if (!shareContent) return;
    setSendTarget(method === 'email' ? shareContent.customerEmail || '' : shareContent.customerPhone || '');
  };

  const handleSendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendQuoteId) return;
    setSubmitting(true);
    try {
      if (sendMethod === 'whatsapp') {
        const digits = sendTarget.replace(/[^\d]/g, '');
        if (!digits) {
          toast.error('Enter a WhatsApp number (with country code) before sending.');
          return;
        }
        if (digits.length < 10 || digits.length > 15) {
          toast.error('That doesn\'t look like a valid phone number with country code.');
          return;
        }
        if (!shareContent) {
          toast.error('Quote message is still loading — try again in a moment.');
          return;
        }
        // wa.me can't attach an image/PDF without the WhatsApp Business API
        // (Phase 13, not available without credentials) — it opens a chat
        // pre-filled with the strategic message and public quote link, which
        // the recipient can open to view/download the full quote.
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`, '_blank');
        toast.info('WhatsApp opened with the quote message ready to send.');
        setSendQuoteId(null);
        setSendTarget('');
        setShareContent(null);
        setMessageText('');
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
      setShareContent(null);
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
              <button onClick={() => openSendModal(quote)} className="text-slate-400 hover:text-[#168eea]" aria-label="Send">
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
                <CompanyAutocomplete
                  value={formData.client}
                  onChange={(val) => setFormData({ ...formData, client: val })}
                  onSelect={handleCompanySelect}
                  placeholder="Type client name to search..."
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
                  <label className="block text-xs font-medium text-slate-700">Amount ({getCachedCurrency()})</label>
<input
                      type="number"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
              <button onClick={() => { setSendQuoteId(null); setShareContent(null); setMessageText(''); }} className="text-slate-400 hover:text-slate-600">
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
                      onChange={() => handleMethodChange('email')}
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
                      onChange={() => handleMethodChange('whatsapp')}
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
                  placeholder={sendMethod === 'email' ? 'client@example.com' : 'e.g. 919876543210'}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
                {sendMethod === 'whatsapp' && !shareLoading && shareContent && !shareContent.customerPhone && (
                  <p className="mt-1 text-[11px] text-amber-600">No phone number on file for this quote — enter one to continue.</p>
                )}
              </div>
              {sendMethod === 'whatsapp' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">Message</label>
                    <button
                      type="button"
                      disabled={aiLoading || shareLoading || !shareContent}
                      onClick={handleAIPersonalize}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#168eea] hover:underline disabled:opacity-50"
                    >
                      <SparklesIcon className="h-3.5 w-3.5" />
                      {aiLoading ? 'Generating...' : 'Personalize with AI'}
                    </button>
                  </div>
                  {shareLoading ? (
                    <p className="mt-1 text-xs text-slate-400">Preparing message...</p>
                  ) : (
                    <textarea
                      rows={6}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
                    />
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => { setSendQuoteId(null); setShareContent(null); setMessageText(''); }}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting || (sendMethod === 'whatsapp' && shareLoading)}>{submitting ? 'Sending...' : 'Send'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
