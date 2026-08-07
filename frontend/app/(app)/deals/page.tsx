'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import StatusBadge from '@/components/ui/status-badge';
import StatCard from '@/components/ui/stat-card';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { DEAL_FIELDS } from '@/lib/import-export/field-configs';
import { formatCurrency } from '@/lib/utils';
import { dealsApi, leadsApi, quotesApi } from '@/lib/api';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  title: '',
  client: '',
  leadId: null as number | string | null,
  value: 50000,
  stage: 'prospecting',
  probability: 25,
  expectedClose: '',
};

export default function DealsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filter, setFilter] = useState('all');
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);
  // Powers the Client field's typeahead: typing a lead's company name auto-links
  // the deal to that lead (leadId), so Client is no longer just free text.
  const [leadOptions, setLeadOptions] = useState<{ id: number; company: string; leadNumber: string }[]>([]);
  const [selectedDealIds, setSelectedDealIds] = useState<(string | number)[]>([]);

  useEffect(() => {
    leadsApi
      .getLeads({ limit: 500 })
      .then((res) => setLeadOptions((res.leads || []).filter((l: any) => l.company).map((l: any) => ({ id: l.id, company: l.company, leadNumber: l.leadNumber }))))
      .catch(() => {});
  }, []);

  // Support deep-linking from the topbar's Quick Create menu (/deals?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setEditingId(null);
      setFormData(emptyForm);
      setIsModalOpen(true);
      router.replace('/deals');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dealsApi.getDeals({ search, stage: filter });
      setDeals(res.deals || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deals. Is the backend running?');
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const totalPipeline = useMemo(() => {
    return deals
      .filter((d) => !['closed-won', 'closed-lost'].includes(d.stage))
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
  }, [deals]);

  const weightedPipeline = useMemo(() => {
    return deals
      .filter((d) => !['closed-won', 'closed-lost'].includes(d.stage))
      .reduce((s, d) => s + (Number(d.value) || 0) * ((Number(d.probability) || 0) / 100), 0);
  }, [deals]);

  const winRate = useMemo(() => {
    const closed = deals.filter((d) => ['closed-won', 'closed-lost'].includes(d.stage));
    if (closed.length === 0) return 0;
    const won = closed.filter((d) => d.stage === 'closed-won').length;
    return Math.round((won / closed.length) * 100);
  }, [deals]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (deal: any) => {
    setEditingId(deal.id);
    setFormData({
      title: deal.title || '',
      client: deal.client || '',
      leadId: deal.leadId || null,
      value: deal.value || 0,
      stage: deal.stage || 'prospecting',
      probability: deal.probability || 0,
      expectedClose: (deal.expectedClose || deal.expectedCloseDate || '').split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      title: formData.title,
      client: formData.client,
      leadId: formData.leadId || null,
      value: Number(formData.value),
      stage: formData.stage,
      probability: Number(formData.probability),
      expectedClose: formData.expectedClose || null,
    };
    try {
      if (editingId) {
        await dealsApi.updateDeal(editingId, payload);
      } else {
        await dealsApi.createDeal(payload);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchDeals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save deal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendQuotation = async () => {
    if (!editingId) return;
    setSendingQuote(true);
    try {
      const res = await quotesApi.createQuoteFromDeal(editingId);
      toast.success(`Quotation ${res.quote?.quoteNumber || ''} created.`);
      setIsModalOpen(false);
      router.push(`/quotes/${res.quote.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create quotation');
    } finally {
      setSendingQuote(false);
    }
  };

  const handleDelete = async (deal: any) => {
    if (!confirm(`Delete deal "${deal.title}"?`)) return;
    try {
      await dealsApi.deleteDeal(deal.id);
      fetchDeals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete deal');
    }
  };

  useKeyboardShortcuts({
    onEscape: () => {
      if (isModalOpen) setIsModalOpen(false);
    },
    onSave: () => {
      if (isModalOpen) handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    },
    onDelete: () => {
      if (isModalOpen) return;
      if (selectedDealIds.length === 1) {
        const deal = deals.find((d) => d.id === selectedDealIds[0]);
        if (deal) handleDelete(deal);
      }
    },
  });

  const columns: DataTableColumn<any>[] = [
    { header: 'Deal', accessor: (deal) => <span className="font-medium text-slate-900">{deal.title}</span> },
    {
      header: 'Client',
      accessor: (deal) => (
        <div>
          <span className="text-slate-600">{deal.client}</span>
          {deal.leadId && (
            <Link href={`/leads/${deal.leadId}`} onClick={(e) => e.stopPropagation()} className="block text-[11px] font-medium text-[#168eea] hover:underline">
              {deal.leadNumber || 'View lead'} →
            </Link>
          )}
        </div>
      ),
    },
    { header: 'Value', accessor: (deal) => <span className="font-medium text-slate-900">{formatCurrency(deal.value || 0)}</span> },
    { header: 'Stage', accessor: (deal) => <StatusBadge status={deal.stage} /> },
    {
      header: 'Probability',
      accessor: (deal) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-12 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, deal.probability || 0)}%` }} />
          </div>
          <span className="text-slate-600">{deal.probability || 0}%</span>
        </div>
      ),
    },
    {
      header: 'Expected Close',
      accessor: (deal) => {
        const raw = deal.expectedClose || deal.expectedCloseDate;
        return <span className="text-slate-500">{raw ? String(raw).split('T')[0] : 'N/A'}</span>;
      },
    },
    { header: 'Owner', accessor: (deal) => <span className="text-slate-600">{deal.assignedTo || 'Unassigned'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Deals"
        description="Manage your sales pipeline and close more deals"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Deal',
                entityNamePlural: 'deals',
                fields: DEAL_FIELDS,
                getExportData: () => deals,
                onImportRow: (row) =>
                  dealsApi.createDeal({
                    ...row,
                    value: row.value !== undefined && row.value !== '' ? Number(row.value) : undefined,
                    probability: row.probability !== undefined && row.probability !== '' ? Number(row.probability) : undefined,
                  }),
                onImportComplete: fetchDeals,
              }}
            />
            <Button size="sm" onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add Deal</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Pipeline" value={formatCurrency(totalPipeline)} />
        <StatCard label="Weighted Pipeline" value={formatCurrency(weightedPipeline)} />
        <StatCard label="Win Rate" value={`${winRate}%`} />
        <StatCard label="Avg. Deal Size" value={formatCurrency(deals.length ? Math.round(totalPipeline / deals.length) : 0)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search deals..." className="sm:max-w-xs" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
        >
          <option value="all">All Stages</option>
          <option value="prospecting">Prospecting</option>
          <option value="qualification">Qualification</option>
          <option value="proposal">Proposal</option>
          <option value="negotiation">Negotiation</option>
          <option value="closed-won">Closed Won</option>
          <option value="closed-lost">Closed Lost</option>
        </select>
        <span className="text-sm text-slate-500">{deals.length} deal{deals.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          columns={columns}
          data={deals}
          rowKey={(d) => d.id}
          loading={loading}
          showToolbar
          onSelectionChange={setSelectedDealIds}
          totalEntries={deals.length}
          emptyMessage='No deals found. Click "Add Deal" to create one.'
          actions={(deal) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => openEdit(deal)} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(deal)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
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
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Deal' : 'Add New Deal'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Deal Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise License - TechCorp"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Client / Company Name</label>
                <input
                  type="text"
                  required
                  list="deal-client-leads"
                  placeholder="e.g. TechCorp Inc"
                  value={formData.client}
                  onChange={(e) => {
                    const typed = e.target.value;
                    const match = leadOptions.find((l) => l.company.toLowerCase() === typed.toLowerCase());
                    setFormData({ ...formData, client: typed, leadId: match ? match.id : null });
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
                <datalist id="deal-client-leads">
                  {leadOptions.map((l) => (
                    <option key={l.id} value={l.company} />
                  ))}
                </datalist>
                {formData.leadId ? (
                  <Link href={`/leads/${formData.leadId}`} className="mt-1 inline-block text-[11px] font-medium text-[#168eea] hover:underline">
                    Linked to lead {leadOptions.find((l) => l.id === formData.leadId)?.leadNumber || `#${formData.leadId}`} →
                  </Link>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">Matches an existing lead's company name to auto-link it.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Deal Value ($)</label>
                  <input
                    type="number"
                    required
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Probability (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Stage</label>
                  <select
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="prospecting">Prospecting</option>
                    <option value="qualification">Qualification</option>
                    <option value="proposal">Proposal</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="closed-won">Closed Won</option>
                    <option value="closed-lost">Closed Lost</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Expected Close Date</label>
                  <input
                    type="date"
                    value={formData.expectedClose}
                    onChange={(e) => setFormData({ ...formData, expectedClose: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                {editingId && (
                  <Button type="button" variant="secondary" size="sm" onClick={handleSendQuotation} disabled={sendingQuote}>
                    {sendingQuote ? 'Sending...' : 'Send Quotation'}
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update Deal' : 'Save Deal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
