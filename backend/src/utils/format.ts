/**
 * Formats a number as currency for server-rendered output (PDFs, print HTML,
 * emails) where we can't rely on the browser's Intl locale data the way the
 * frontend's formatCurrency() does. Falls back gracefully on bad currency codes.
 */
export const formatMoney = (value: number, currency = 'USD'): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${(value || 0).toFixed(2)} ${currency}`;
  }
};
