'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlassIcon, CubeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { itemsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ItemSuggestion {
  id: number;
  itemName: string;
  unit: string;
  sellingPrice: number;
  taxId: number | null;
  taxType: string | null;
  taxRate: number | null;
}

interface ItemAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: ItemSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function ItemAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Type item name to search...',
  className,
  disabled = false,
}: ItemAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, width: 0 });

  const fetchSuggestions = useCallback(async (query: string) => {
    // Allow empty query to fetch all items (or first 20)
    setIsLoading(true);
    try {
      const res = await itemsApi.getItems({ search: query || '', limit: 20, isActive: true });
      setSuggestions(res.items || []);
    } catch (error) {
      console.error('Failed to fetch item suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Allow search with empty string (show all) or when user types
    if (value.length >= 2 || value === '' || value === '%') {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, value === '' || value === '%' ? 0 : 300);
    } else {
      debounceRef.current = setTimeout(() => {
        setSuggestions([]);
      }, 0);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The suggestion list is portaled to <body> (see the render below) so it
  // can float above everything instead of being clipped by an ancestor
  // table/card with overflow-x-auto (which — per the CSS overflow spec —
  // silently turns overflow-y into "auto" too, trapping the list inside a
  // scrollable box instead of showing it right under the field). Track the
  // field's on-screen position so the portaled list can be placed under it
  // with position: fixed, and keep it in sync with scrolling/resizing.
  const updateDropdownPosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();

    // `capture: true` picks up scroll events from any scrollable ancestor
    // (e.g. the Line Items table wrapper), not just window — scroll events
    // don't bubble, so a plain window listener would miss those.
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(newValue.length >= 2);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelect = (suggestion: ItemSuggestion) => {
    // value stays plain text (the item's name) — never the numeric id. The
    // id/price/unit/tax the caller needs come through onSelect instead.
    onChange(suggestion.itemName);
    onSelect?.(suggestion);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    // Show suggestions when focused with empty value or when we have suggestions for the current value
    if ((value === '' || value === '%') && suggestions.length === 0) {
      // Trigger a fetch for empty search
      fetchSuggestions('');
      setIsOpen(true);
    } else if (value.length >= 2 && suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const clearInput = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-md border-0 bg-slate-100/50 py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400',
            'focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="item-suggestions"
          aria-expanded={isOpen && suggestions.length > 0}
        />
        {value && (
          <button
            type="button"
            onClick={clearInput}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Clear"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--primary)]" />
          </div>
        )}
      </div>

      {isOpen &&
        suggestions.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            id="item-suggestions"
            className="fixed z-[1000] mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleSelect(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  index === highlightedIndex
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-slate-900 hover:bg-slate-50'
                )}
                role="option"
                aria-selected={index === highlightedIndex}
              >
                <div className="flex items-center gap-2">
                  <CubeIcon className={cn('h-4 w-4 flex-shrink-0', index === highlightedIndex ? 'text-white' : 'text-slate-400')} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{suggestion.itemName}</p>
                    <p className="truncate text-xs" style={{ opacity: index === highlightedIndex ? 0.8 : 0.6 }}>
                      {suggestion.unit} • {suggestion.sellingPrice}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}

      {isOpen &&
        suggestions.length === 0 &&
        value.length >= 2 &&
        !isLoading &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[1000] mt-1 rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 p-3 text-sm text-slate-500 text-center"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
          >
            No items found
          </div>,
          document.body
        )}
    </div>
  );
}