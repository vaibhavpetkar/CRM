'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  XMarkIcon,
  PlusIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  TrophyIcon,
  XCircleIcon,
  EllipsisHorizontalIcon,
  EllipsisVerticalIcon,
  ViewColumnsIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import Button from '@/components/ui/button';
import { OwnerChip, SelectPill, ViewToggle } from '@/components/ui/analytics';
import { formatCurrency } from '@/lib/utils';
import { dealsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

// Colour and icon per stage, as in the reference board.
const STAGE_STYLE: Record<string, { color: string; tile: string; icon: React.ComponentType<{ className?: string }> }> = {
  prospecting: { color: '#0a6cf5', tile: 'bg-blue-50 text-[var(--primary)]', icon: UsersIcon },
  qualification: { color: '#06b6d4', tile: 'bg-cyan-50 text-cyan-600', icon: ClipboardDocumentListIcon },
  proposal: { color: '#8b5cf6', tile: 'bg-violet-50 text-violet-600', icon: DocumentTextIcon },
  negotiation: { color: '#f59e0b', tile: 'bg-amber-50 text-amber-600', icon: ChatBubbleLeftRightIcon },
  'closed-won': { color: '#22c55e', tile: 'bg-emerald-50 text-emerald-600', icon: TrophyIcon },
  'closed-lost': { color: '#ef4444', tile: 'bg-red-50 text-red-500', icon: XCircleIcon },
};

// Value buckets for the "All values" filter.
const VALUE_BUCKETS = [
  { value: 'all', label: 'All values', test: () => true },
  { value: 'lt100k', label: `Under ${formatCurrency(100000)}`, test: (v: number) => v < 100000 },
  { value: '100k-1m', label: `${formatCurrency(100000)} – ${formatCurrency(1000000)}`, test: (v: number) => v >= 100000 && v < 1000000 },
  { value: 'gte1m', label: `${formatCurrency(1000000)}+`, test: (v: number) => v >= 1000000 },
];
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
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('all');
  const [valueBucket, setValueBucket] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');

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

  const owners = useMemo(
    () => Array.from(new Set(deals.map((d) => d.assignedTo).filter(Boolean))).sort() as string[],
    [deals]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = VALUE_BUCKETS.find((b) => b.value === valueBucket) || VALUE_BUCKETS[0];
    return deals.filter((d) => {
      if (q && !`${d.title || ''} ${d.client || ''} ${d.assignedTo || ''}`.toLowerCase().includes(q)) return false;
      if (owner === 'unassigned' ? d.assignedTo : owner !== 'all' && d.assignedTo !== owner) return false;
      if (!bucket.test(Number(d.value) || 0)) return false;
      if (stageFilter !== 'all' && d.stage !== stageFilter) return false;
      return true;
    });
  }, [deals, search, owner, valueBucket, stageFilter]);

  const dealsByStage = useMemo(() => {
    return stages.reduce((acc, stage) => {
      acc[stage] = filtered.filter((d) => d.stage === stage);
      return acc;
    }, {} as Record<string, any[]>);
  }, [filtered]);

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

  const visibleStages = stageFilter === 'all' ? stages : [stageFilter];

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
      <PageHeader
        title="Pipeline"
        description="Visualize and manage your sales pipeline."
        actions={
          <Link
            href="/deals?quickCreate=1"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-hover)]"
          >
            <PlusIcon className="h-4 w-4" /> Add Deal
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {stageSummary.map((s) => {
              const st = STAGE_STYLE[s.stage];
              const Icon = st.icon;
              const active = stageFilter === s.stage;
              return (
                <button
                  key={s.stage}
                  type="button"
                  onClick={() => setStageFilter(active ? 'all' : s.stage)}
                  aria-pressed={active}
                  title={active ? 'Show all stages' : `Show only ${stageLabel(s.stage)}`}
                  className={`flex min-w-0 items-center gap-2.5 rounded-2xl border border-t-[3px] border-slate-200/80 bg-white p-3.5 text-left shadow-xs transition-shadow hover:shadow-md ${active ? 'ring-2 ring-[var(--primary)]/30' : ''}`}
                  style={{ borderTopColor: st.color }}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full 2xl:h-11 2xl:w-11 ${st.tile}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-xs font-bold ${active ? '' : 'text-slate-900'}`} style={active ? { color: st.color } : undefined}>
                      {stageLabel(s.stage)}
                    </span>
                    <span className="block text-[11px] text-slate-500">{s.count} deal{s.count === 1 ? '' : 's'}</span>
                    <span className="block truncate text-base font-extrabold text-slate-900 2xl:text-lg" title={formatCurrency(s.value)}>{formatCurrency(s.value)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative w-full sm:w-64">
                <span className="sr-only">Search deals</span>
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deals..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs shadow-2xs focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </label>
              <SelectPill
                label="Owner"
                value={owner}
                onChange={setOwner}
                options={[{ value: 'all', label: 'All owners' }, { value: 'unassigned', label: 'Unassigned' }, ...owners.map((o) => ({ value: o, label: o }))]}
              />
              <SelectPill label="Deal value" value={valueBucket} onChange={setValueBucket} options={VALUE_BUCKETS.map(({ value, label }) => ({ value, label }))} />
              <SelectPill
                label="Stage"
                value={stageFilter}
                onChange={setStageFilter}
                options={[{ value: 'all', label: 'All stages' }, ...stages.map((s) => ({ value: s, label: stageLabel(s) }))]}
              />
            </div>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: 'kanban', label: 'Kanban', icon: <ViewColumnsIcon className="h-4 w-4" /> },
                { value: 'list', label: 'List', icon: <ListBulletIcon className="h-4 w-4" /> },
              ]}
            />
          </div>

          {view === 'kanban' ? (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {visibleStages.map((stage) => {
                const st = STAGE_STYLE[stage];
                const summary = stageSummary.find((s) => s.stage === stage)!;
                const list = dealsByStage[stage] || [];
                return (
                  <div
                    key={stage}
                    className={`flex min-h-[420px] w-64 shrink-0 flex-col rounded-2xl border border-t-[3px] border-slate-200/80 bg-white p-3 shadow-xs transition-colors xl:min-w-0 xl:flex-1 ${
                      dragOverStage === stage ? 'bg-blue-50 ring-2 ring-[var(--primary)]/30' : ''
                    }`}
                    style={{ borderTopColor: st.color }}
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
                    <div className="mb-3 px-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                          {stageLabel(stage)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label={stageFilter === stage ? 'Show all stages' : `Focus ${stageLabel(stage)}`}
                          title={stageFilter === stage ? 'Show all stages' : 'Show only this stage'}
                        >
                          <EllipsisVerticalIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{summary.count} deal{summary.count === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(summary.value)}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-3">
                      {list.map((deal) => {
                        const prob = Math.min(100, Math.max(0, Number(deal.probability) || 0));
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onClick={() => setOpenDeal(deal)}
                            onDragStart={() => setDraggedDealId(deal.id)}
                            onDragEnd={() => {
                              setDraggedDealId(null);
                              setDragOverStage(null);
                            }}
                            className={`cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing ${
                              draggedDealId === deal.id ? 'opacity-40' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 text-xs font-bold text-slate-900">{deal.title}</p>
                              <EllipsisHorizontalIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">{deal.client || 'No client'}</p>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-sm font-extrabold text-slate-900">{formatCurrency(Number(deal.value) || 0)}</span>
                              <span className="text-xs font-semibold text-slate-600">{prob}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${prob}%` }} />
                            </div>
                            <div className="mt-3 text-[11px] text-slate-700">
                              <OwnerChip name={deal.assignedTo} />
                            </div>
                          </div>
                        );
                      })}
                      {list.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
                          <DocumentTextIcon className="h-8 w-8 text-slate-400" />
                          <p className="mt-2 text-xs font-semibold text-slate-600">Drop deals here</p>
                          <p className="text-[11px] text-slate-400">Move deals to this stage</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No deals match these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3">Deal</th>
                        <th className="px-4 py-3">Stage</th>
                        <th className="px-4 py-3">Value</th>
                        <th className="px-4 py-3">Probability</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Expected Close</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filtered.map((deal) => (
                        <tr key={deal.id} className="cursor-pointer hover:bg-slate-50/80" onClick={() => setOpenDeal(deal)}>
                          <td className="px-5 py-3">
                            <p className="font-bold text-slate-900">{deal.title}</p>
                            <p className="text-[11px] text-slate-500">{deal.client || 'No client'}</p>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={deal.stage} /></td>
                          <td className="px-4 py-3 font-semibold">{formatCurrency(Number(deal.value) || 0)}</td>
                          <td className="px-4 py-3">{deal.probability ?? 0}%</td>
                          <td className="px-4 py-3"><OwnerChip name={deal.assignedTo} /></td>
                          <td className="px-4 py-3 text-slate-500">
                            {deal.expectedClose ? new Date(deal.expectedClose).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
