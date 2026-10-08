import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  /** Tint of the icon tile. Defaults to the brand blue. */
  tone?: 'blue' | 'cyan' | 'sky' | 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose';
  className?: string;
};

const tones = {
  blue: 'bg-blue-50 text-[var(--primary)]',
  cyan: 'bg-cyan-50 text-cyan-600',
  sky: 'bg-sky-50 text-sky-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
};

const changeColors = {
  positive: 'text-emerald-600',
  negative: 'text-red-500',
  neutral: 'text-slate-500',
};

export default function StatCard({ label, value, change, changeType = 'neutral', icon, tone = 'blue', className }: StatCardProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs', className)}>
      {icon && (
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="truncate text-xl font-extrabold tracking-tight text-slate-900">{value}</p>
        {change && <p className={cn('text-[11px] font-semibold', changeColors[changeType])}>{change}</p>}
      </div>
    </div>
  );
}
