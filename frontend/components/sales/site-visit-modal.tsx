'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { leadsApi, salesApi, SiteVisitRow, SiteVisitStatus } from '@/lib/api';

// Schedule a site visit for a lead, log one that already happened, or edit
// one (status, feedback, who takes it).

type LeadRef = { id: number; name: string; projectName?: string | null; preferredLocation?: string | null };

export const VISIT_STATUS_LABEL: Record<SiteVisitStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Visit done',
  cancelled: 'Cancelled',
  'no-show': 'No show',
};

export const VISIT_STATUS_CLASS: Record<SiteVisitStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
  'no-show': 'bg-orange-50 text-orange-700',
};

const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
  if (!iso) d.setHours(11, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const field =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

export default function SiteVisitModal({
  lead,
  visit,
  agents,
  canPickAgent,
  currentUserId,
  onClose,
  onSaved,
}: {
  lead?: LeadRef | null; // fixed lead (lead page); otherwise searched here
  visit?: SiteVisitRow | null; // editing
  agents: { id: number; name: string }[];
  canPickAgent: boolean;
  currentUserId?: number | null;
  onClose: () => void;
  onSaved: (visit: SiteVisitRow) => void;
}) {
  const toast = useToast();
  const [leadRef, setLeadRef] = useState<LeadRef | null>(lead || (visit?.leadId ? { id: visit.leadId, name: visit.leadName || `Lead #${visit.leadId}` } : null));
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(visit?.scheduledAt));
  const [status, setStatus] = useState<SiteVisitStatus>(visit?.status || 'scheduled');
  const [userId, setUserId] = useState<string>(String(visit?.userId || currentUserId || ''));
  const [projectName, setProjectName] = useState(visit?.projectName || lead?.projectName || '');
  const [location, setLocation] = useState(visit?.location || lead?.preferredLocation || '');
  const [notes, setNotes] = useState(visit?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (leadRef || leadQuery.trim().length < 2) {
      setLeadResults([]);
      return;
    }
    const t = setTimeout(() => {
      leadsApi
        .getLeads({ search: leadQuery.trim(), limit: 8 })
        .then((res) => setLeadResults(res.leads || []))
        .catch(() => setLeadResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [leadQuery, leadRef]);

  const save = async () => {
    if (!leadRef) return toast.warning('Choose the lead for this visit.');
    if (!scheduledAt) return toast.warning('Pick the visit date and time.');
    setSaving(true);
    try {
      const payload = {
        scheduledAt: new Date(scheduledAt).toISOString(),
        status,
        projectName,
        location,
        notes,
        ...(canPickAgent && userId ? { userId: Number(userId) } : {}),
      };
      const saved = visit ? await salesApi.updateVisit(visit.id, payload) : await salesApi.createVisit({ ...payload, leadId: leadRef.id });
      toast.success(visit ? 'Site visit updated.' : status === 'completed' ? 'Site visit logged.' : 'Site visit scheduled.');
      onSaved(saved);
    } catch (err: any) {
      toast.error(err.message || 'Could not save the site visit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">{visit ? 'Edit site visit' : 'Site visit'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Lead *</label>
            {leadRef ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{leadRef.name}</span>
                {!lead && !visit && (
                  <button type="button" onClick={() => setLeadRef(null)} className="text-xs font-semibold text-[var(--primary)] hover:underline">
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Search name, number, area..."
                  className={field}
                  autoFocus
                />
                {leadResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {leadResults.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setLeadRef({ id: l.id, name: l.name, projectName: l.projectName, preferredLocation: l.preferredLocation });
                            if (!projectName && l.projectName) setProjectName(l.projectName);
                            if (!location && l.preferredLocation) setLocation(l.preferredLocation);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-800">{l.name}</span>
                          <span className="truncate text-xs text-slate-400">{[l.mobile, l.configuration, l.preferredLocation].filter(Boolean).join(' · ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date &amp; time *</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as SiteVisitStatus)} className={field}>
                {(Object.keys(VISIT_STATUS_LABEL) as SiteVisitStatus[]).map((s) => (
                  <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Project / property</label>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Green Valley Phase 2" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Baner, Pune" className={field} />
            </div>
            {canPickAgent && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Sales person</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={field}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Notes / feedback</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What the buyer liked, objections, next step..." className={field} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : visit ? 'Save' : status === 'completed' ? 'Log visit' : 'Schedule visit'}</Button>
        </div>
      </div>
    </div>
  );
}
