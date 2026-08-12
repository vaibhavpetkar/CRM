'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, UserCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { usersApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface UserSuggestion {
  id: number;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface UserAutocompleteProps {
  value: string | number | '';
  onChange: (value: string | number | '') => void;
  onSelect?: (user: UserSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function UserAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Type user name to search...',
  className,
  disabled = false,
}: UserAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
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
      const res = await usersApi.getUsers({ search: query });
      setSuggestions(res.users || []);
    } catch (error) {
      console.error('Failed to fetch user suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    const searchValue = String(value);
    if (searchValue.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(searchValue);
      }, 300);
    } else {
      debounceRef.current = setTimeout(() => {
        setSuggestions([]);
      }, 0);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

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
    if (newValue.length < 2) setSelectedUserName('');
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

  const handleSelect = (suggestion: UserSuggestion) => {
    onChange(suggestion.id);
    onSelect?.(suggestion);
    setSelectedUserName(suggestion.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    const searchValue = String(value);
    if (searchValue.length >= 2 && suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const clearInput = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    setSelectedUserName('');
    inputRef.current?.focus();
  };

  const displayValue = (() => {
    const v = String(value);
    if (v === '') return '';
    const found = suggestions.find(s => s.id === value);
    if (found) return found.name;
    if (!isNaN(Number(v)) && selectedUserName) return selectedUserName;
    return v;
  })();

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
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
          aria-controls="user-suggestions"
          aria-expanded={isOpen && suggestions.length > 0}
        />
        {displayValue && (
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
          id="user-suggestions"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5"
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
                <UserCircleIcon className={cn('h-4 w-4 flex-shrink-0', index === highlightedIndex ? 'text-white' : 'text-slate-400')} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{suggestion.name}</p>
                  <p className="truncate text-xs" style={{ opacity: index === highlightedIndex ? 0.8 : 0.6 }}>
                    {suggestion.email}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && suggestions.length === 0 && String(value).length >= 2 && !isLoading && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 p-3 text-sm text-slate-500 text-center">
          No users found
        </div>
      )}
    </div>
  );
}