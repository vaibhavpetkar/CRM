/**
 * Substitutes {{field}} / {{nested.field}} placeholders in a template string
 * with values from `data`. Unknown placeholders render as an empty string
 * rather than being left literally in the output — a template with a typo'd
 * field shouldn't leak "{{customre_name}}" into an email a customer sees.
 *
 * Two small additions on top of plain substitution, both needed for print
 * formats (a quotation is useless without its item rows):
 *   - {{#items}} ... {{/items}} repeats its body once per array entry, with
 *     the entry's fields in scope (outer fields stay reachable). A non-array
 *     value acts as an "if": truthy renders the body once, falsy renders
 *     nothing. {{^items}} ... {{/items}} is the inverse ("if empty").
 *   - With `escapeHtml: true`, values are HTML-escaped so a client named
 *     `<b>Acme</b>` can't inject markup into an email or printout. Values
 *     wrapped in SafeHtml (pre-rendered blocks like the items table) are
 *     inserted as-is.
 * Still no expressions or arbitrary code, so it stays safe to let
 * non-developers edit.
 */
export class SafeHtml {
  constructor(public readonly html: string) {}
  toString() {
    return this.html;
  }
}

export interface RenderOptions {
  escapeHtml?: boolean;
}

type Scope = Record<string, unknown>;

const SECTION_RE = /\{\{\s*([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g;
const FIELD_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

const lookup = (scopes: Scope[], path: string): unknown => {
  const keys = path.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (scope && typeof scope === 'object' && keys[0] in scope) {
      return keys.reduce<unknown>(
        (obj, key) => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined),
        scope
      );
    }
  }
  return undefined;
};

const isTruthy = (value: unknown) => (Array.isArray(value) ? value.length > 0 : !!value && value !== '0');

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderWithScopes = (template: string, scopes: Scope[], options: RenderOptions): string => {
  const withSections = template.replace(SECTION_RE, (_m, kind: string, path: string, body: string) => {
    const value = lookup(scopes, path);
    if (kind === '^') return isTruthy(value) ? '' : renderWithScopes(body, scopes, options);
    if (Array.isArray(value)) {
      return value
        .map((entry, index) =>
          renderWithScopes(body, [...scopes, { index: index + 1, ...(entry && typeof entry === 'object' ? (entry as Scope) : { value: entry }) }], options)
        )
        .join('');
    }
    return isTruthy(value) ? renderWithScopes(body, scopes, options) : '';
  });

  return withSections.replace(FIELD_RE, (_m, path: string) => {
    const value = lookup(scopes, path);
    if (value === undefined || value === null) return '';
    if (value instanceof SafeHtml) return value.html;
    if (Array.isArray(value) || typeof value === 'object') return '';
    const text = String(value);
    return options.escapeHtml ? escapeHtml(text) : text;
  });
};

export function renderTemplate(template: string, data: Record<string, unknown>, options: RenderOptions = {}): string {
  if (!template) return '';
  return renderWithScopes(template, [data], options);
}

/** Every {{field}} referenced in a template string (section tags included, closing tags excluded), deduplicated, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  if (!template) return [];
  const matches = template.matchAll(/\{\{\s*[#^]?\s*([\w.]+)\s*\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return Array.from(seen);
}
