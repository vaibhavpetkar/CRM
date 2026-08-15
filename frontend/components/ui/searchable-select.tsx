'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  sublabel?: string; // optional secondary line, e.g. a user's email/role
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
  maxResults?: number;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Replaces the native `<input list="..."> + <datalist>` pattern used
 * inconsistently across this app (Leads, Deals, Meetings) — datalist's
 * dropdown is unstyled, browser-native, and behaves inconsistently across
 * browsers/mobile. This is a client-side-filtered, styled dropdown for a
 * small/preloaded option set (territories, users, etc.) — no backend calls,
 * case-insensitive substring match, shows up to `maxResults` (default 5).
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search...',
  className,
  maxResults = 5,
  disabled = false,
  required = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const filtered = (query ? options.filter((o) => o.value.toLowerCase().includes(query)) : options).slice(0, maxResults);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: SearchableOption) => {
    onChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filtered.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) handleSelect(filtered[highlightedIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && filtered.length > 0}
          className={cn(
            'w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          {filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm transition-colors',
                index === highlightedIndex ? 'bg-[var(--primary)] text-white' : 'text-slate-900 hover:bg-slate-50'
              )}
            >
              <p className="truncate font-medium">{option.value}</p>
              {option.sublabel && (
                <p className="truncate text-xs" style={{ opacity: index === highlightedIndex ? 0.8 : 0.6 }}>
                  {option.sublabel}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && query && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white p-3 text-center text-sm text-slate-500 shadow-lg ring-1 ring-black ring-opacity-5">
          No matches
        </div>
      )}
    </div>
  );
}
