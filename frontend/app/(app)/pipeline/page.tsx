'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { XMarkIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import Button from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { dealsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
const stageLabel = (s: string) => s.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none';

/** Quick view of one deal from the board, with its key fields editable in place. */
function DealDrawer({ deal, onClose, onSaved }: { deal: any; onClose: () => void; onSaved: (deal: any) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    title: deal.title || '',
    value: deal.value ?? 0,
    stage: deal.stage || 'prospecting',
    probability: deal.probability ?? 0,
    expectedClose: String(deal.expectedClose || deal.expectedCloseDate || '').split('T')[0],
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      value: Number(form.value) || 0,
      stage: form.stage,
      probability: Number(form.probability) || 0,
      expectedClose: form.expectedClose || null,
    };
    try {
      await dealsApi.updateDeal(deal.id, payload);
      toast.success('Deal updated');
      onSaved({ ...deal, ...payload });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update deal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Deal ${deal.title}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">{deal.title}</h3>
            <p className="text-xs text-slate-500">
              {deal.client || 'No client'} · {deal.assignedTo || 'Unassigned'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Value</p>
            <p className="font-semibold text-slate-900">{formatCurrency(deal.value || 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Stage</p>
            <div className="mt-0.5"><StatusBadge status={deal.stage} /></div>
          </div>
        </div>

        <form onSubmit={save} className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">Deal Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Value</label>
              <input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Probability (%)</label>
              <input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={inputCls}>
                {stages.map((s) => (
                  <option key={s} value={s}>{stageLabel(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Expected Close</label>
              <input type="date" value={form.expectedClose} onChange={(e) => setForm({ ...form, expectedClose: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {deal.leadId && (
              <Link href={`/leads/${deal.leadId}`} className="mr-auto text-xs font-medium text-[var(--primary)] hover:underline">
                Open lead{deal.leadNumber ? ` ${deal.leadNumber}` : ''} →
              </Link>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const toast = useToast();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedDealId, setDraggedDealId] = useState<number | string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [openDeal, setOpenDeal] = useState<any | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await dealsApi.getAllDeals();
      setDeals(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load pipeline. Is the backend running?');
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const dealsByStage = useMemo(() => {
    return stages.reduce((acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    }, {} as Record<string, any[]>);
  }, [deals]);

  const stageSummary = useMemo(() => {
    return stages.map((stage) => {
      const stageDeals = dealsByStage[stage] || [];
      return {
        stage,
        count: stageDeals.length,
        value: stageDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
      };
    });
  }, [dealsByStage]);

  const handleDrop = useCallback(
    async (targetStage: string) => {
      setDragOverStage(null);
      const dealId = draggedDealId;
      setDraggedDealId(null);
      if (!dealId) return;

      const deal = deals.find((d) => d.id === dealId);
      if (!deal || deal.stage === targetStage) return;

      // Optimistically move the card so the drag feels instant.
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: targetStage } : d)));

      try {
        await dealsApi.updateDeal(dealId, { stage: targetStage });
      } catch (err: any) {
        // Roll back on failure.
        setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: deal.stage } : d)));
        toast.error(err.message || 'Failed to move deal. Please try again.');
      }
    },
    [deals, draggedDealId, toast]
  );

  return (
    <>
      <PageHeader title="Pipeline" description="Visual kanban view of your sales pipeline" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {stageSummary.map((s) => (
              <div key={s.stage} className="rounded-lg border-2 border-slate-200 bg-white p-4 text-center shadow-sm">
                <StatusBadge status={s.stage} />
                <p className="mt-2 text-lg font-semibold text-slate-900">{s.count}</p>
                <p className="text-xs text-slate-500">{formatCurrency(s.value)}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <div
                key={stage}
                className="w-72 shrink-0"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(stage);
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <StatusBadge status={stage} />
                  <span className="text-xs text-slate-500">{dealsByStage[stage]?.length || 0}</span>
                </div>
                <div
                  className={`space-y-3 rounded-lg p-1 transition-colors ${
                    dragOverStage === stage ? 'bg-blue-50 ring-2 ring-[var(--primary)]/30' : ''
                  }`}
                >
                  {(dealsByStage[stage] || []).map((deal) => (
                    <Card
                      key={deal.id}
                      draggable
                      onClick={() => setOpenDeal(deal)}
                      onDragStart={() => setDraggedDealId(deal.id)}
                      onDragEnd={() => {
                        setDraggedDealId(null);
                        setDragOverStage(null);
                      }}
                      className={`!border-2 cursor-pointer active:cursor-grabbing transition-shadow hover:shadow-md ${
                        draggedDealId === deal.id ? 'opacity-40' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900">{deal.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{deal.client}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--primary)]">{formatCurrency(deal.value)}</span>
                        <span className="text-xs text-slate-400">{deal.probability}%</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{deal.assignedTo || 'Unassigned'}</p>
                    </Card>
                  ))}
                  {(!dealsByStage[stage] || dealsByStage[stage].length === 0) && (
                    <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openDeal && (
        <DealDrawer
          key={openDeal.id}
          deal={openDeal}
          onClose={() => setOpenDeal(null)}
          onSaved={(updated) => {
            setDeals((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
            setOpenDeal(null);
          }}
        />
      )}
    </>
  );
}
