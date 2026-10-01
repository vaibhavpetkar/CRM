/**
 * Company names on contacts, leads and deals are free text, so the same
 * customer shows up as "Acme Pvt Ltd", "ACME pvt. ltd." and "Acme ". This
 * reduces a name to a comparison key so those are treated as one company
 * when linking records together.
 */

// Legal-form words dropped from the end of a name ("Acme Private Limited" -> "acme").
const LEGAL_SUFFIXES = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated', 'co', 'company', 'corp', 'corporation', 'plc', 'gmbh',
]);

export const companyKey = (name?: string | null): string => {
  if (!name) return '';
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const full = words.join(' ');
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ') || full;
};

/**
 * A word from the key to narrow a SQL query with (ILIKE '%word%') before the
 * exact key comparison happens in JS. Picks the longest word, which is the
 * most selective and always appears in any name that shares the key.
 */
export const companySearchWord = (key: string): string =>
  key.split(' ').reduce((best, w) => (w.length > best.length ? w : best), '');
