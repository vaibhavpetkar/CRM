'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { tasksApi, meetingsApi, leadsApi } from '@/lib/api';
import { ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, CalendarDaysIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'task' | 'meeting' | 'follow-up';
  href: string;
  status?: string;
};

const EVENT_STYLES: Record<CalendarEvent['type'], { dot: string; badge: string; icon: any }> = {
  task: { dot: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700', icon: CheckCircleIcon },
  meeting: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', icon: CalendarDaysIcon },
  'follow-up': { dot: 'bg-[#168eea]', badge: 'bg-blue-100 text-blue-700', icon: ClipboardDocumentListIcon },
};

function toDateKey(d: string | Date) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, meetingsRes, leadsRes] = await Promise.allSettled([
        tasksApi.getTasks({}),
        meetingsApi.getMeetings({}),
        leadsApi.getLeads({ limit: 500 }),
      ]);

      const next: CalendarEvent[] = [];

      if (tasksRes.status === 'fulfilled') {
        (tasksRes.value.tasks || []).forEach((t: any) => {
          if (!t.dueDate) return;
          next.push({ id: `task-${t.id}`, date: toDateKey(t.dueDate), title: t.title, type: 'task', href: '/tasks', status: t.status });
        });
      }
      if (meetingsRes.status === 'fulfilled') {
        (meetingsRes.value.meetings || []).forEach((m: any) => {
          if (!m.date) return;
          next.push({ id: `meeting-${m.id}`, date: toDateKey(m.date), title: m.title, type: 'meeting', href: '/meetings', status: m.status });
        });
      }
      if (leadsRes.status === 'fulfilled') {
        (leadsRes.value.leads || []).forEach((l: any) => {
          if (!l.nextFollowUp) return;
          const name = l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Lead';
          next.push({
            id: `lead-${l.id}`,
            date: toDateKey(l.nextFollowUp),
            title: `Follow up: ${name}`,
            type: 'follow-up',
            href: `/leads/${l.id}`,
            status: l.status,
          });
        });
      }

      setEvents(next);
      if (tasksRes.status !== 'fulfilled' && meetingsRes.status !== 'fulfilled' && leadsRes.status !== 'fulfilled') {
        setError('Failed to load calendar data. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const eventsByDate = useMemo(() => {
    return events.reduce((acc, e) => {
      (acc[e.date] ||= []).push(e);
      return acc;
    }, {} as Record<string, CalendarEvent[]>);
  }, [events]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ date: new Date(year, month, 1 - (startOffset - i)), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }

    const rows: { date: Date; inMonth: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  const todayKey = toDateKey(new Date());
  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  return (
    <>
      <PageHeader title="Calendar" description="Tasks, meetings, and lead follow-ups in one place" />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="Previous month"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="Next month"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="ml-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{monthLabel}</h2>
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          {(Object.keys(EVENT_STYLES) as CalendarEvent['type'][]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${EVENT_STYLES[t].dot}`} />
              {t === 'follow-up' ? 'Follow-up' : t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <th key={d} className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map(({ date, inMonth }) => {
                      const key = toDateKey(date);
                      const dayEvents = eventsByDate[key] || [];
                      const isToday = key === todayKey;
                      const isSelected = key === selectedDate;
                      return (
                        <td key={key} className="h-24 border border-slate-100 p-1 align-top">
                          <button
                            onClick={() => setSelectedDate(key)}
                            className={`flex h-full w-full flex-col items-start rounded-md p-1.5 text-left transition-colors ${
                              isSelected ? 'bg-blue-50 ring-1 ring-[#168eea]' : 'hover:bg-slate-50'
                            } ${!inMonth ? 'opacity-40' : ''}`}
                          >
                            <span
                              className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                                isToday ? 'bg-[#168eea] text-white' : 'text-slate-700'
                              }`}
                            >
                              {date.getDate()}
                            </span>
                            <div className="flex w-full flex-1 flex-col gap-0.5 overflow-hidden">
                              {dayEvents.slice(0, 2).map((e) => (
                                <span
                                  key={e.id}
                                  className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${EVENT_STYLES[e.type].badge}`}
                                >
                                  {e.title}
                                </span>
                              ))}
                              {dayEvents.length > 2 && (
                                <span className="text-[10px] font-medium text-slate-400">+{dayEvents.length - 2} more</span>
                              )}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a day'}>
            {!selectedDate ? (
              <p className="py-8 text-center text-sm text-slate-400">Click a date to see what's scheduled.</p>
            ) : selectedEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nothing scheduled this day.</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((e) => {
                  const Icon = EVENT_STYLES[e.type].icon;
                  return (
                    <button
                      key={e.id}
                      onClick={() => router.push(e.href)}
                      className="flex w-full items-start gap-3 rounded-md border-2 border-slate-100 p-3 text-left hover:border-slate-200 hover:bg-slate-50"
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${EVENT_STYLES[e.type].badge}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                        {e.status && <p className="text-xs capitalize text-slate-500">{e.status.replace(/-/g, ' ')}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
