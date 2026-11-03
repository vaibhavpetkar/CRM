'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { callsApi, leadsApi } from '@/lib/api';

// Logs a call a sales person made or took on their own mobile, outside the
// calling provider, so it still shows in Call Tracking, the activity reports
// and the lead's timeline.

type LeadRef = { id: number; name: string; mobile?: string | null };

const field =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LogCallModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [leadRef, setLeadRef] = useState<LeadRef | null>(null);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [number, setNumber] = useState('');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [status, setStatus] = useState<'completed' | 'no-answer' | 'busy'>('completed');
  const [minutes, setMinutes] = useState('');
  const [calledAt, setCalledAt] = useState(nowLocal);
  const [notes, setNotes] = useState('');
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

  const pickLead = (l: any) => {
    const name = l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim() || `Lead #${l.id}`;
    setLeadRef({ id: l.id, name, mobile: l.mobile });
    if (!number && l.mobile) setNumber(l.mobile);
    setLeadQuery('');
  };

  const save = async () => {
    if (!leadRef && !number.trim()) return toast.warning('Pick the lead or enter the number you called.');
    setSaving(true);
    try {
      await callsApi.logManual({
        leadId: leadRef?.id,
        number: number.trim() || undefined,
        direction,
        status,
        durationMinutes: status === 'completed' && minutes ? Number(minutes) : undefined,
        calledAt: calledAt ? new Date(calledAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Call logged.');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Could not log the call.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">Log a call</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">For calls made or received on your own mobile.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Lead</label>
            {leadRef ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{leadRef.name}</span>
                <button type="button" onClick={() => setLeadRef(null)} className="text-xs font-semibold text-[var(--primary)] hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)} placeholder="Search name, number, area..." className={field} />
                {leadResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {leadResults.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickLead(l);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-800">{l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim()}</span>
                          {l.mobile && <span className="ml-2 text-xs text-slate-400">{l.mobile}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Phone number</label>
              <input type="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10-digit mobile" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">When</label>
              <input type="datetime-local" value={calledAt} max={nowLocal()} onChange={(e) => setCalledAt(e.target.value)} className={field} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as 'outbound' | 'inbound')} className={field}>
                <option value="outbound">Outgoing</option>
                <option value="inbound">Incoming</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Outcome</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'completed' | 'no-answer' | 'busy')} className={field}>
                <option value="completed">Connected</option>
                <option value="no-answer">Not answered</option>
                <option value="busy">Busy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Talk time (min)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={minutes}
                disabled={status !== 'completed'}
                onChange={(e) => setMinutes(e.target.value)}
                className={`${field} disabled:opacity-50`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, next step..." className={field} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Log call'}</Button>
        </div>
      </div>
    </div>
  );
}
