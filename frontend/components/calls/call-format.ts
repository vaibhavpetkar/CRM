import type { CallStatus } from '@/lib/api';

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  queued: 'Starting',
  ringing: 'Ringing',
  'in-progress': 'Connected',
  completed: 'Completed',
  busy: 'Busy',
  'no-answer': 'Not answered',
  failed: 'Failed',
  canceled: 'Cancelled',
};

export const CALL_STATUS_CLASS: Record<CallStatus, string> = {
  queued: 'bg-slate-100 text-slate-600',
  ringing: 'bg-amber-100 text-amber-700',
  'in-progress': 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  busy: 'bg-orange-100 text-orange-700',
  'no-answer': 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-slate-100 text-slate-600',
};

export const formatDuration = (seconds: number | null | undefined) => {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
