'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, BuildingOfficeIcon, UserCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { leadsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface CompanySuggestion {
  type: 'company' | 'contact';
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  industry: string | null;
  contactName: string | null;
  contactTitle: string | null;
}

interface CompanyAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (company: CompanySuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CompanyAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Type company name to search...',
  className,
  disabled = false,
}: CompanyAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await leadsApi.searchCompanies(query);
      setSuggestions(res.results || []);
    } catch (error) {
      console.error('Failed to fetch company suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, 300);
    } else {
      // Use setTimeout to avoid synchronous setState in effect
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

  const handleSelect = (suggestion: CompanySuggestion) => {
    onChange(suggestion.name);
    onSelect?.(suggestion);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    if (value.length >= 2 && suggestions.length > 0) {
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
    <div className={cn('relative', className)}>
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
          aria-controls="company-suggestions"
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

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          id="company-suggestions"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
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
                {suggestion.type === 'company' ? (
                  <BuildingOfficeIcon className={cn('h-4 w-4 flex-shrink-0', index === highlightedIndex ? 'text-white' : 'text-slate-400')} />
                ) : (
                  <UserCircleIcon className={cn('h-4 w-4 flex-shrink-0', index === highlightedIndex ? 'text-white' : 'text-slate-400')} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{suggestion.name}</p>
                  {suggestion.contactName && (
                    <p className="truncate text-xs" style={{ opacity: index === highlightedIndex ? 0.8 : 0.6 }}>
                      {suggestion.contactName}{suggestion.contactTitle ? `, ${suggestion.contactTitle}` : ''}
                    </p>
                  )}
                  {suggestion.industry && (
                    <p className="truncate text-xs" style={{ opacity: index === highlightedIndex ? 0.8 : 0.6 }}>
                      {suggestion.industry}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && suggestions.length === 0 && value.length >= 2 && !isLoading && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 p-3 text-sm text-slate-500 text-center">
          No companies or contacts found
        </div>
      )}
    </div>
  );
}