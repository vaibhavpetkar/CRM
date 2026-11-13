'use client';

import { useEffect, useRef, useState } from 'react';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { leadsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ChannelPartnerInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Classes for the text box (the icon sits inside on the left). */
  inputClassName?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Channel partner on the lead form. Typing shows the partners already in the
 * CRM that match; picking one fills the box. When nothing matches, no list
 * is shown and the typed name is saved as a new partner with the lead.
 */
export default function ChannelPartnerInput({
  value,
  onChange,
  inputClassName,
  className,
  placeholder = 'Type channel partner name',
  disabled,
}: ChannelPartnerInputProps) {
  const [matches, setMatches] = useState<{ name: string; leads: number }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const typed = useRef(false);

  useEffect(() => {
    const text = value.trim();
    if (!typed.current || !text) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      leadsApi
        .getChannelPartners(text, 8)
        .then((res) => {
          if (cancelled) return;
          // Already the exact name of a partner: nothing more to suggest.
          const list = res.partners || [];
          const exact = list.length === 1 && list[0].name.toLowerCase() === text.toLowerCase();
          setMatches(exact ? [] : list);
          setActive(-1);
        })
        .catch(() => !cancelled && setMatches([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (name: string) => {
    typed.current = false;
    onChange(name);
    setMatches([]);
    setOpen(false);
  };

  const showList = open && matches.length > 0;

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
        <UserGroupIcon className="h-4 w-4" />
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={255}
        autoComplete="off"
        placeholder={placeholder}
        aria-label="Channel partner"
        aria-autocomplete="list"
        aria-expanded={showList}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(matches[active].name);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={cn(
          inputClassName ||
            'w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[var(--primary)] focus:outline-none',
          'pl-9'
        )}
      />
      {showList && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((m, i) => (
            <li key={m.name} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m.name)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                  i === active ? 'bg-blue-50 text-[var(--primary)]' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{m.leads} lead{m.leads === 1 ? '' : 's'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
