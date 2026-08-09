const CURRENCY_KEY = 'crm_currency';
export const DEFAULT_CURRENCY = 'INR'; // Task 3.1: CRM default currency is INR

/**
 * The org-wide currency (set on Settings > Company) is cached in localStorage
 * so every `formatCurrency()` call anywhere in the app resolves to the same
 * value without each page having to fetch company settings itself.
 *
 * `app-shell.tsx` refreshes this cache from the server once per app load;
 * the Company Settings page updates it immediately on save so the change is
 * reflected everywhere without needing a full page reload.
 */
export function getCachedCurrency(): string {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  return localStorage.getItem(CURRENCY_KEY) || DEFAULT_CURRENCY;
}

export function setCachedCurrency(currency: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENCY_KEY, currency);
  window.dispatchEvent(new CustomEvent('currency-changed', { detail: currency }));
}
