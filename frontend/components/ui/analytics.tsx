'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

// Building blocks for the dashboard, pipeline and reports pages: KPI cards
// with a sparkline, titled panels, period dropdowns, step tabs and empty
// states, all in the Inveon One reference style.

export const TONES = {
  blue: { tile: 'bg-blue-50 text-[var(--primary)]', stroke: '#0066ff' },
  sky: { tile: 'bg-sky-50 text-sky-600', stroke: '#0ea5e9' },
  cyan: { tile: 'bg-cyan-50 text-cyan-600', stroke: '#06b6d4' },
  indigo: { tile: 'bg-indigo-50 text-indigo-600', stroke: '#6366f1' },
  violet: { tile: 'bg-violet-50 text-violet-600', stroke: '#8b5cf6' },
  amber: { tile: 'bg-amber-50 text-amber-600', stroke: '#f59e0b' },
  orange: { tile: 'bg-orange-50 text-orange-500', stroke: '#f97316' },
  rose: { tile: 'bg-rose-50 text-rose-500', stroke: '#f43f5e' },
  emerald: { tile: 'bg-emerald-50 text-emerald-600', stroke: '#10b981' },
} as const;

export type Tone = keyof typeof TONES;

export function Sparkline({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const points = (data.length > 1 ? data : [0, ...(data.length ? data : [0])]).map((v, i) => ({ i, v }));
  return (
    <div className={cn('h-9 w-14 shrink-0 2xl:w-20', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#spark-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Small bar glyph used where there is no series to draw yet. */
function BarsGlyph({ color }: { color: string }) {
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
      {[35, 55, 45, 75, 100].map((h, i) => (
        <span key={i} className="w-2 rounded-sm" style={{ height: `${h}%`, backgroundColor: color, opacity: 0.18 + i * 0.06 }} />
      ))}
    </div>
  );
}

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: Tone;
  /** Percent change against the previous period; omitted hides the trend line. */
  change?: number | null;
  /** Text after the change, e.g. "vs last month". */
  changeLabel?: string;
  /** Muted caption under the value, used instead of (or with) the change. */
  caption?: string;
  spark?: number[];
  /** Shows a bar glyph instead of a sparkline. */
  bars?: boolean;
  /** Where the card's menu button leads. */
  href?: string;
  className?: string;
};

export function KpiCard({ label, value, icon, tone = 'blue', change, changeLabel, caption, spark, bars, href, className }: KpiCardProps) {
  const t = TONES[tone];
  const up = (change ?? 0) >= 0;
  return (
    <div className={cn('relative flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs 2xl:p-4', className)}>
      <div className="flex items-start gap-2.5 2xl:gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl 2xl:h-12 2xl:w-12', t.tile)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate pr-6 text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</p>
          <div className="truncate text-xl font-extrabold tracking-tight text-slate-900 2xl:text-2xl" title={typeof value === 'string' ? value : undefined}>
            {value}
          </div>
          {caption && <p className="truncate text-xs font-medium text-slate-500">{caption}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={`Open ${label}`}
            title={`Open ${label.toLowerCase()}`}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </Link>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        {change !== undefined && change !== null ? (
          <p className="flex min-w-0 items-center gap-1 text-[11px] 2xl:gap-1.5 2xl:text-xs">
            <span className={cn('inline-flex items-center gap-0.5 font-bold', up ? 'text-emerald-600' : 'text-red-500')}>
              {up ? <ArrowUpIcon className="h-3.5 w-3.5 stroke-[2.5]" /> : <ArrowDownIcon className="h-3.5 w-3.5 stroke-[2.5]" />}
              {up ? '+' : ''}
              {change}%
            </span>
            {changeLabel && <span className="truncate text-slate-500">{changeLabel}</span>}
          </p>
        ) : (
          <span />
        )}
        {bars ? <BarsGlyph color={t.stroke} /> : spark && <Sparkline data={spark} color={t.stroke} />}
      </div>
    </div>
  );
}

type PanelProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Panel({ title, subtitle, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xs', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

type Option = { value: string; label: string };

/** Native select dressed as the reference's rounded dropdown pill. */
export function SelectPill({
  value,
  onChange,
  options,
  icon,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  icon?: React.ReactNode;
  /** Accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      {icon && <span className="pointer-events-none absolute left-3 text-slate-500">{icon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2 pr-9 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
          icon ? 'pl-9' : 'pl-3'
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" />
    </label>
  );
}

export function PeriodSelect(props: { value: string; onChange: (v: string) => void; options: Option[]; className?: string }) {
  return <SelectPill {...props} label="Period" icon={<CalendarIcon className="h-4 w-4" />} />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-8 text-center', className)}>
      <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)]">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-xs text-xs text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Two-way segmented toggle (Kanban/List, List/Calendar). */
export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ReactNode; href?: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs" role="group">
      {options.map((o) => {
        const active = o.value === value;
        const cls = cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
          active ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
        );
        return o.href ? (
          <Link key={o.value} href={o.href} className={cls}>
            {o.icon}
            {o.label}
          </Link>
        ) : (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cls} aria-pressed={active}>
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const initialsOf = (name?: string | null) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

export function OwnerChip({ name }: { name?: string | null }) {
  if (!name) return <span className="text-slate-400">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-[var(--primary)]">
        {initialsOf(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
