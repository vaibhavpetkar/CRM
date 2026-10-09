'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPinIcon, PlusIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getStoredUser, salesApi, SiteVisitRow, usersApi } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import SiteVisitModal, { VISIT_STATUS_CLASS, VISIT_STATUS_LABEL } from './site-visit-modal';

// Site visits for one lead (lead page, "Site Visits" tab).
export default function SiteVisitsCard({ lead }: { lead: { id: number; name: string; projectName?: string | null; preferredLocation?: string | null } }) {
  const toast = useToast();
  const user = getStoredUser();
  const canEdit = hasPermission(user, 'leads:update');
  const canPickAgent = hasPermission(user, 'users:read');
  const [visits, setVisits] = useState<SiteVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<SiteVisitRow | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      const res = await salesApi.listVisits({ leadId: lead.id });
      setVisits(res.visits);
    } catch (err: any) {
      toast.error(err.message || 'Could not load site visits.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  useEffect(() => {
    load();
    usersApi.getAssignableUsers().then((r) => setAgents(r.users.map((u) => ({ id: u.id, name: u.name })))).catch(() => {});
  }, [load]);

  const markDone = async (v: SiteVisitRow) => {
    try {
      await salesApi.updateVisit(v.id, { status: 'completed' });
      load();
    } catch (err: any) {
      toast.error(err.message || 'Could not update the visit.');
    }
  };

  return (
    <Card
      title="Site visits"
      action={
        canEdit && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <PlusIcon className="h-4 w-4" /> Schedule visit
          </Button>
        )
      }
    >
      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : visits.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No site visits yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visits.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {new Date(v.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', VISIT_STATUS_CLASS[v.status])}>{VISIT_STATUS_LABEL[v.status]}</span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <MapPinIcon className="h-3.5 w-3.5" />
                  {[v.projectName, v.location].filter(Boolean).join(' · ') || 'No project set'} · {v.agentName || 'Unassigned'}
                </p>
                {v.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{v.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  {v.status === 'scheduled' && (
                    <Button size="sm" variant="secondary" onClick={() => markDone(v)}>Mark done</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <SiteVisitModal
          lead={lead}
          visit={editing === 'new' ? null : editing}
          agents={agents}
          canPickAgent={canPickAgent}
          currentUserId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Card>
  );
}
