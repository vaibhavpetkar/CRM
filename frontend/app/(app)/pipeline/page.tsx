'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import { dealsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

export default function PipelinePage() {
  const toast = useToast();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedDealId, setDraggedDealId] = useState<number | string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dealsApi.getDeals({ limit: 500 });
      setDeals(res.deals || []);
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

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

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
                    dragOverStage === stage ? 'bg-blue-50 ring-2 ring-[#168eea]/30' : ''
                  }`}
                >
                  {(dealsByStage[stage] || []).map((deal) => (
                    <Card
                      key={deal.id}
                      draggable
                      onDragStart={() => setDraggedDealId(deal.id)}
                      onDragEnd={() => {
                        setDraggedDealId(null);
                        setDragOverStage(null);
                      }}
                      className={`!border-2 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${
                        draggedDealId === deal.id ? 'opacity-40' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900">{deal.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{deal.client}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#168eea]">{formatCurrency(deal.value)}</span>
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
    </>
  );
}
