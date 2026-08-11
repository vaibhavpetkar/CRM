import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  contacted: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  working: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  qualified: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  unqualified: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  converted: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  proposal: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  negotiation: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  won: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  lost: 'bg-red-50 text-red-700 ring-red-600/20',
  prospecting: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  qualification: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'closed-won': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'closed-lost': 'bg-red-50 text-red-700 ring-red-600/20',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inactive: 'bg-slate-50 text-slate-500 ring-slate-500/20',
  draft: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'in-progress': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  rescheduled: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  'disconnected-call': 'bg-slate-100 text-slate-500 ring-slate-500/20',
  'no-show': 'bg-red-50 text-red-700 ring-red-600/20',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  sent: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  partial: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  overdue: 'bg-red-50 text-red-700 ring-red-600/20',
  high: 'bg-red-50 text-red-700 ring-red-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  low: 'bg-slate-50 text-slate-600 ring-slate-500/20',
};

type StatusBadgeProps = {
  status: string;
  className?: string;
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = status.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        statusStyles[status] || 'bg-slate-50 text-slate-600 ring-slate-500/20',
        className
      )}
    >
      {label}
    </span>
  );
}
