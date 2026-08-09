import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
};

export default function StatCard({ label, value, change, changeType = 'neutral', icon, className }: StatCardProps) {
  const changeColors = {
    positive: 'text-emerald-600',
    negative: 'text-red-500',
    neutral: 'text-slate-500',
  };

  return (
    <div className={cn('rounded-xl border border-slate-200/60 bg-white p-6 shadow-[0_2px_8px_rgb(0,0,0,0.04)]', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 tracking-tight">{label}</p>
          <p className="mt-2 text-[28px] font-bold text-slate-900 tracking-tight leading-none">{value}</p>
          {change && (
            <p className={cn('mt-2 text-[13px] font-medium', changeColors[changeType])}>{change}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--primary)]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
