import { getCachedCurrency, DEFAULT_CURRENCY } from './currency';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency?: string) {
  const resolvedCurrency = currency || getCachedCurrency();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: resolvedCurrency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Guard against an invalid/unsupported ISO code ending up in the cache.
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
      maximumFractionDigits: 0,
    }).format(value);
  }
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function capitalize(str: string) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
