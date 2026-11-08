'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export type TypeaheadOption = { value: string; label: string; keywords?: string };
type Option = TypeaheadOption;

/**
 * A dropdown the user can type into: typing filters the list (by label, value
 * or keywords), arrow keys and Enter pick, a click picks.
 *
 * `extraOptions` go first (e.g. "All statuses" on a filter) and get no dot.
 * `dotColor` puts a coloured dot before each option, as on lead statuses.
 */
export default function TypeaheadSelect({
  value,
  onChange,
  options: baseOptions,
  extraOptions = [],
  className,
  placeholder = 'Type to search...',
  emptyText = 'No matches',
  labelFor,
  dotColor,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  extraOptions?: Option[];
  className?: string;
  placeholder?: string;
  emptyText?: string;
  /** label for a value that is not in the list (e.g. an older status) */
  labelFor?: (value: string) => string;
  dotColor?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options: Option[] = useMemo(() => [...extraOptions, ...baseOptions], [extraOptions, baseOptions]);
  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label || (value ? (labelFor ? labelFor(value) : value) : '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || (o.keywords || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openList = () => {
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const pick = (o: Option) => {
    onChange(o.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const hasDot = (v: string) => !!dotColor && !extraOptions.some((o) => o.value === v);

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <div className="relative">
        {!open && value && hasDot(value) && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: dotColor!(value) }}
          />
        )}
        <input
          ref={inputRef}
          value={open ? query : currentLabel}
          placeholder={open ? currentLabel || placeholder : placeholder}
          onFocus={openList}
          onClick={() => !open && openList()}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) return openList();
              setActive((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && filtered[active]) {
                e.preventDefault();
                pick(filtered[active]);
              }
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className={cn(
            'w-full rounded-lg border border-slate-200 bg-white py-2 pr-8 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
            !open && value && hasDot(value) ? 'pl-8' : 'pl-3'
          )}
        />
        <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700',
                  i === active && 'bg-slate-100',
                  o.value === value && 'font-semibold'
                )}
              >
                {dotColor &&
                  (hasDot(o.value) ? (
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor(o.value) }} />
                  ) : (
                    <span className="h-2.5 w-2.5 flex-shrink-0" />
                  ))}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
