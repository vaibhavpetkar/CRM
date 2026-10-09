'use client';

import { cn } from '@/lib/utils';

// Date range picker shared by the sales reports: quick presets plus custom
// from/to days. Days are the browser's local calendar days (YYYY-MM-DD).

export type DateRange = { from: string; to: string };

const iso = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export const PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: iso(daysAgo(1)), to: iso(daysAgo(1)) }) },
  { key: '7d', label: '7 days', range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { key: '30d', label: '30 days', range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  {
    key: 'month',
    label: 'This month',
    range: () => {
      const d = new Date();
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) };
    },
  },
];

export const presetRange = (key: string) => (PRESETS.find((p) => p.key === key) || PRESETS[0]).range();

export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const active = PRESETS.find((p) => {
    const r = p.range();
    return r.from === value.from && r.to === value.to;
  })?.key;
  const input =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.range())}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-semibold',
              active === p.key ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className={input} aria-label="From" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className={input} aria-label="To" />
      </div>
    </div>
  );
}
