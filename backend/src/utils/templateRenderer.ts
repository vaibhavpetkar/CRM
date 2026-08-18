/**
 * Substitutes {{field}} / {{nested.field}} placeholders in a template string
 * with values from `data`. Unknown placeholders render as an empty string
 * rather than being left literally in the output — a template with a typo'd
 * field shouldn't leak "{{customre_name}}" into an email a customer sees.
 * Deliberately just string substitution — no loops/conditionals/expressions
 * (that's the line between "template" and "template language"; keeping it
 * simple keeps it safe to let non-developers edit).
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path
      .split('.')
      .reduce<unknown>((obj, key) => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined), data);
    return value === undefined || value === null ? '' : String(value);
  });
}

/** Every {{field}} referenced in a template string, deduplicated, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  if (!template) return [];
  const matches = template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return Array.from(seen);
}
