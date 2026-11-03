'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { SelectPill, ViewToggle, EmptyState } from '@/components/ui/analytics';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { meetingsApi, leadsApi } from '@/lib/api';
import SearchableSelect from '@/components/ui/searchable-select';
import CompanyContactCcPicker from '@/components/ui/company-contact-cc-picker';
import { useRouter, useSearchParams } from 'next/navigation';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { MEETING_FIELDS } from '@/lib/import-export/field-configs';
import {
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  CalendarIcon,
  CalendarDaysIcon,
  ClockIcon,
  EyeIcon,
  PencilSquareIcon,
  EllipsisVerticalIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  TagIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import PrintButton from '@/components/ui/print-button';

// Meeting times are stored as text ("10:00 AM"), so the picker offers
// 15-minute slots in that same format through the working day.
const TIME_SLOTS = Array.from({ length: (22 - 7) * 4 + 1 }, (_, i) => {
  const minutes = 7 * 60 + i * 15;
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(minutes % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
});

const DATE_FILTERS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'past', label: 'Past' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'no-show', label: 'No-show' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** The meeting's calendar day as YYYY-MM-DD (dates are stored without a timezone). */
const dayOf = (m: any) => (m.date ? String(m.date).split('T')[0] : '');

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Minutes from "1 hour", "45 min", "1.5 hours"; 30 when unknown. */
function durationMinutes(text?: string) {
  const n = parseFloat(String(text || ''));
  if (!n) return 30;
  return /hour/i.test(String(text)) ? Math.round(n * 60) : Math.round(n);
}

/** Start time from the stored "10:30 AM" text on the meeting's day. */
function meetingStart(m: any) {
  const day = dayOf(m);
  if (!day) return null;
  const d = parseDay(day);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(m.time || '').trim());
  if (match) {
    let h = Number(match[1]) % 12;
    if (match[3].toUpperCase() === 'PM') h += 12;
    d.setHours(h, Number(match[2]));
  }
  return d;
}

/** Downloads an .ics file so the meeting can be added to any calendar app. */
function downloadIcs(m: any) {
  const start = meetingStart(m);
  if (!start) return;
  const end = new Date(start.getTime() + durationMinutes(m.duration) * 60000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t: string) => String(t || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Inveon One CRM//Meetings//EN',
    'BEGIN:VEVENT',
    `UID:meeting-${m.id}@inveon-one-crm`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(m.title)}`,
    `DESCRIPTION:${esc(m.client || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(m.title || 'meeting').replace(/[^\w-]+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Row menu: complete, print and delete. */
function RowMenu({ meeting, onComplete, onDelete }: { meeting: any; onComplete: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="More actions"
        aria-expanded={open}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
          {meeting.status !== 'completed' && (
            <button type="button" onClick={() => (setOpen(false), onComplete())} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
              <CheckCircleIcon className="h-4 w-4" /> Mark completed
            </button>
          )}
          <div className="flex items-center gap-2 rounded-lg px-1 py-1 text-slate-700 hover:bg-slate-50">
            <PrintButton docType="meeting" id={meeting.id} variant="icon" />
            <span>Print</span>
          </div>
          <button type="button" onClick={() => (setOpen(false), onDelete())} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">
            <TrashIcon className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

const DURATIONS = ['15 min', '30 min', '45 min', '1 hour', '1.5 hours', '2 hours', '3 hours'];

const emptyForm = {
  title: '',
  client: '',
  leadId: '',
  date: '',
  time: '',
  duration: '30 min',
  type: 'video',
  status: 'scheduled',
  customerEmail: '',
  ccEmails: [] as string[],
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
      const payload = { ...formData, leadId: formData.leadId ? Number(formData.leadId) : undefined };
      if (editingId) await meetingsApi.updateMeeting(editingId, payload);
      else await meetingsApi.createMeeting(payload);
      setIsModalOpen(false);
      setEditingId(null);
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

  const openNew = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (m: any) => {
    setEditingId(m.id);
    setFormData({
      ...emptyForm,
      title: m.title || '',
      client: m.client || '',
      leadId: m.leadId ? String(m.leadId) : '',
      date: dayOf(m),
      time: m.time || '',
      duration: m.duration || '',
      type: m.type || 'video',
      status: m.status || 'scheduled',
      customerEmail: m.customerEmail || '',
      ccEmails: Array.isArray(m.ccEmails) ? m.ccEmails : [],
    });
    setIsModalOpen(true);
  };

  const markCompleted = async (m: any) => {
    try {
      await meetingsApi.updateMeeting(m.id, { status: 'completed' });
      setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'completed' } : x)));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update meeting');
    }
  };

  // Filtered meetings grouped by day, in date order.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = localDay(new Date());
    const weekEnd = localDay(new Date(Date.now() + 7 * 86400000));
    const rows = meetings.filter((m) => {
      const day = dayOf(m);
      if (q && !`${m.title || ''} ${m.client || ''} ${m.lead?.company || ''}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (dateFilter === 'today' && day !== today) return false;
      if (dateFilter === 'upcoming' && !(day >= today)) return false;
      if (dateFilter === 'week' && !(day >= today && day <= weekEnd)) return false;
      if (dateFilter === 'past' && !(day && day < today)) return false;
      return true;
    });
    const byDay = new Map<string, any[]>();
    rows
      .slice()
      .sort((a, b) => (meetingStart(a)?.getTime() ?? Infinity) - (meetingStart(b)?.getTime() ?? Infinity))
      .forEach((m) => {
        const day = dayOf(m) || 'none';
        byDay.set(day, [...(byDay.get(day) || []), m]);
      });
    return Array.from(byDay.entries());
  }, [meetings, search, dateFilter, statusFilter]);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Schedule and track customer meetings."
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
            <Button onClick={openNew}><PlusIcon className="h-4 w-4" /> Schedule Meeting</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search meetings</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings, clients, companies..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs shadow-2xs focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </label>
          <SelectPill label="Date" icon={<CalendarIcon className="h-4 w-4" />} value={dateFilter} onChange={setDateFilter} options={DATE_FILTERS} className="min-w-40" />
          <SelectPill label="Status" icon={<TagIcon className="h-4 w-4" />} value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} className="min-w-40" />
        </div>
        <ViewToggle
          value="list"
          onChange={() => {}}
          options={[
            { value: 'list', label: 'List', icon: <ListBulletIcon className="h-4 w-4" /> },
            { value: 'calendar', label: 'Calendar', icon: <CalendarDaysIcon className="h-4 w-4" />, href: '/calendar' },
          ]}
        />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDaysIcon className="h-9 w-9" />}
            title={meetings.length === 0 ? 'No meetings scheduled yet' : 'No meetings match these filters'}
            text={meetings.length === 0 ? 'Schedule your first customer meeting to see it here.' : 'Try a different date, status or search.'}
            action={meetings.length === 0 && <Button size="sm" onClick={openNew}><PlusIcon className="h-4 w-4" /> Schedule Meeting</Button>}
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          {groups.map(([day, rows]) => {
            const date = day === 'none' ? null : parseDay(day);
            return (
              <section key={day}>
                <h2 className="border-y border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 first:border-t-0">
                  {date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No date'}
                </h2>
                <ul className="divide-y divide-slate-100">
                  {rows.map((meeting) => {
                    const linked = meeting.lead
                      ? meeting.lead.company || `${meeting.lead.firstName || ''} ${meeting.lead.lastName || ''}`.trim()
                      : null;
                    return (
                      <li key={meeting.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-slate-50/60 sm:flex-nowrap">
                        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-white py-1 shadow-2xs">
                          <span className="text-[10px] font-bold uppercase text-slate-500">
                            {date ? date.toLocaleDateString('en-US', { month: 'short' }) : '—'}
                          </span>
                          <span className="text-lg font-extrabold leading-tight text-slate-900">
                            {date ? String(date.getDate()).padStart(2, '0') : '--'}
                          </span>
                        </div>
                        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)] sm:flex">
                          <CalendarDaysIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{meeting.title}</p>
                          {linked ? (
                            <Link href={`/leads/${meeting.leadId}`} className="block truncate text-xs text-[var(--primary)] hover:underline" title="Linked Lead — opens Lead record">
                              {linked}
                            </Link>
                          ) : (
                            <p className="truncate text-xs text-slate-600">{meeting.client || 'No client set'}</p>
                          )}
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {date ? date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'N/A'}
                            <span aria-hidden="true">·</span>
                            <ClockIcon className="h-3.5 w-3.5" />
                            {meeting.time || '—'}
                            <span aria-hidden="true">·</span>
                            <span>⏱ {meeting.duration || '—'}</span>
                          </p>
                        </div>
                        <div className="w-28 shrink-0">
                          <StatusBadge status={meeting.status} />
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 text-slate-500">
                          {meeting.leadId ? (
                            <Link href={`/leads/${meeting.leadId}`} className="rounded-lg p-1.5 hover:bg-slate-100 hover:text-slate-700" aria-label="View linked lead" title="View linked lead">
                              <EyeIcon className="h-4 w-4" />
                            </Link>
                          ) : (
                            <button type="button" onClick={() => openEdit(meeting)} className="rounded-lg p-1.5 hover:bg-slate-100 hover:text-slate-700" aria-label="View meeting" title="View meeting">
                              <EyeIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button type="button" onClick={() => openEdit(meeting)} className="rounded-lg p-1.5 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit meeting" title="Edit">
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => downloadIcs(meeting)} className="rounded-lg p-1.5 hover:bg-slate-100 hover:text-slate-700" aria-label="Add to calendar" title="Add to calendar (.ics)">
                            <CalendarIcon className="h-4 w-4" />
                          </button>
                          <RowMenu meeting={meeting} onComplete={() => markCompleted(meeting)} onDelete={() => handleDelete(meeting)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Meeting' : 'Schedule Meeting'}</h3>
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
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Client {formData.leadId && <span className="font-normal text-[var(--primary)]">(linked to Lead — details auto-filled)</span>}
                </label>
                <SearchableSelect
                  value={formData.client}
                  onChange={(typed) => {
                    // Matches against the loaded leads to find the real record —
                    // that's what lets us auto-fill leadId (and anything else tied
                    // to that Lead) instead of just storing free text.
                    const matched = leadOptions.find((l) => l.label === typed);
                    setFormData({
                      ...formData,
                      client: typed,
                      leadId: matched ? String(matched.id) : '',
                    });
                  }}
                  options={leadOptions.map((l) => ({ value: l.label }))}
                  placeholder="Start typing a client name…"
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {formData.leadId
                    ? 'This meeting will show up on that Lead\u2019s timeline.'
                    : 'Pick a suggestion to link this meeting to an existing Lead, or type freely for a one-off client.'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Client Email</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  placeholder="client@example.com"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  A meeting invite is emailed automatically to this address (and to whoever it's assigned to) when scheduled.
                </p>
              </div>
              <CompanyContactCcPicker
                companyName={formData.client}
                value={formData.ccEmails}
                onChange={(emails) => setFormData({ ...formData, ccEmails: emails })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Time</label>
                  <select
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    <option value="">Pick a time</option>
                    {formData.time && !TIME_SLOTS.includes(formData.time) && <option value={formData.time}>{formData.time}</option>}
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Duration</label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    <option value="">Pick a duration</option>
                    {formData.duration && !DURATIONS.includes(formData.duration) && <option value={formData.duration}>{formData.duration}</option>}
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    <option value="video">Video</option>
                    <option value="in-person">In Person</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
              </div>
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    {STATUS_FILTERS.slice(1).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : editingId ? 'Save' : 'Schedule'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
