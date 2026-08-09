'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { meetingsApi, leadsApi } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { MEETING_FIELDS } from '@/lib/import-export/field-configs';
import { PlusIcon, VideoCameraIcon, MapPinIcon, PhoneIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  title: '',
  client: '',
  leadId: '',
  date: '',
  time: '',
  duration: '30 min',
  type: 'video',
  status: 'scheduled',
};

export default function MeetingsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [leadOptions, setLeadOptions] = useState<{ id: number; label: string }[]>([]);

  // Real Lead picker so a meeting can be linked to an actual Lead record
  // (leadId) instead of only a free-typed "client" string with no relation.
  useEffect(() => {
    leadsApi
      .getLeads({ limit: 200 } as any)
      .then((res) => {
        const leads = (res.leads || []).map((l: any) => {
          const contact = l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim();
          return { id: l.id, label: contact ? `${l.company || 'Unnamed'} — ${contact}` : (l.company || `Lead #${l.id}`) };
        });
        setLeadOptions(leads);
      })
      .catch(() => {});
  }, []);

  // Support deep-linking from the topbar's Quick Create menu (/meetings?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setFormData(emptyForm);
      setIsModalOpen(true);
      router.replace('/meetings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.getMeetings();
      setMeetings(res.meetings || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load meetings. Is the backend running?');
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await meetingsApi.createMeeting({
        ...formData,
        leadId: formData.leadId ? Number(formData.leadId) : undefined,
      });
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchMeetings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule meeting');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (meeting: any) => {
    if (!confirm(`Cancel and delete "${meeting.title}"?`)) return;
    try {
      await meetingsApi.deleteMeeting(meeting.id);
      fetchMeetings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete meeting');
    }
  };

  const icon = (type: string) => {
    if (type === 'video') return <VideoCameraIcon className="h-5 w-5" />;
    if (type === 'phone') return <PhoneIcon className="h-5 w-5" />;
    return <MapPinIcon className="h-5 w-5" />;
  };

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Schedule and track customer meetings"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Meeting',
                entityNamePlural: 'meetings',
                fields: MEETING_FIELDS,
                getExportData: () => meetings,
                onImportRow: (row) => meetingsApi.createMeeting(row),
                onImportComplete: fetchMeetings,
              }}
            />
            <Button size="sm" onClick={() => setIsModalOpen(true)}><PlusIcon className="h-4 w-4" /> Schedule Meeting</Button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : meetings.length === 0 ? (
        <Card><p className="py-6 text-center text-slate-400">No meetings scheduled yet.</p></Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <Card key={meeting.id} className="!border-2 !p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#168eea]/10 text-[#168eea]">
                    {icon(meeting.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{meeting.title}</p>
                    {meeting.lead ? (
                      <a
                        href={`/leads/${meeting.leadId}`}
                        className="text-xs text-[#168eea] hover:underline"
                        title="Linked Lead — opens Lead record"
                      >
                        🔗 {meeting.lead.company || `${meeting.lead.firstName || ''} ${meeting.lead.lastName || ''}`.trim()}
                      </a>
                    ) : (
                      <p className="text-xs text-slate-500">{meeting.client || 'No client set'}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {meeting.date ? String(meeting.date).split('T')[0] : 'N/A'} at {meeting.time || '—'} &middot; {meeting.duration || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={meeting.status} />
                  <button onClick={() => handleDelete(meeting)} className="text-slate-300 hover:text-red-600" aria-label="Delete meeting">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Schedule Meeting</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Client {formData.leadId && <span className="font-normal text-[#168eea]">(linked to Lead — details auto-filled)</span>}
                </label>
                <input
                  type="text"
                  list="meeting-client-options"
                  autoComplete="off"
                  placeholder="Start typing a client name…"
                  value={formData.client}
                  onChange={(e) => {
                    const typed = e.target.value;
                    // Native <datalist> only gives us back the typed string, so we
                    // match it against the loaded leads to find the real record —
                    // that's what lets us auto-fill leadId (and anything else tied
                    // to that Lead) instead of just storing free text.
                    const matched = leadOptions.find((l) => l.label === typed);
                    setFormData({
                      ...formData,
                      client: typed,
                      leadId: matched ? String(matched.id) : '',
                    });
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
                <datalist id="meeting-client-options">
                  {leadOptions.map((l) => (
                    <option key={l.id} value={l.label} />
                  ))}
                </datalist>
                <p className="mt-1 text-[11px] text-slate-400">
                  {formData.leadId
                    ? 'This meeting will show up on that Lead\u2019s timeline.'
                    : 'Pick a suggestion to link this meeting to an existing Lead, or type freely for a one-off client.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 10:00 AM"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Duration</label>
                  <input
                    type="text"
                    placeholder="e.g. 30 min"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="video">Video</option>
                    <option value="in-person">In Person</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Schedule'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
