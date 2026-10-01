// Client-side mirror of backend/src/utils/templateRenderer.ts, for instant
// previews without a round-trip on every keystroke. Same syntax:
// {{field}}, {{#list}}...{{/list}} (repeat / if) and {{^list}}...{{/list}} (if empty).

type Scope = Record<string, unknown>;

const SECTION_RE = /\{\{\s*([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g;
const FIELD_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

// Keys whose sample value is ready-made HTML, inserted unescaped (as on the server).
const RAW_KEYS = new Set(['items_table', 'totals_table']);

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const lookup = (scopes: Scope[], path: string): unknown => {
  const keys = path.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (scope && typeof scope === 'object' && keys[0] in scope) {
      return keys.reduce<unknown>((obj, key) => (obj && typeof obj === 'object' ? (obj as Scope)[key] : undefined), scope);
    }
  }
  return undefined;
};

const isTruthy = (value: unknown) => (Array.isArray(value) ? value.length > 0 : !!value && value !== '0');

const render = (template: string, scopes: Scope[], escape: boolean): string =>
  template
    .replace(SECTION_RE, (_m, kind: string, path: string, body: string) => {
      const value = lookup(scopes, path);
      if (kind === '^') return isTruthy(value) ? '' : render(body, scopes, escape);
      if (Array.isArray(value)) {
        return value
          .map((entry, index) => render(body, [...scopes, { index: index + 1, ...(entry && typeof entry === 'object' ? (entry as Scope) : { value: entry }) }], escape))
          .join('');
      }
      return isTruthy(value) ? render(body, scopes, escape) : '';
    })
    .replace(FIELD_RE, (_m, path: string) => {
      const value = lookup(scopes, path);
      if (value === undefined || value === null || typeof value === 'object') return '';
      const text = String(value);
      return escape && !RAW_KEYS.has(path) ? escapeHtml(text) : text;
    });

export function renderTemplate(template: string, data: Scope, options: { escapeHtml?: boolean } = {}): string {
  if (!template) return '';
  return render(template, [data], !!options.escapeHtml);
}

/** Same page wrapper the server puts around a print format, so previews look like the real print. */
export function wrapPrintPreview(body: string): string {
  if (/<html[\s>]/i.test(body)) return body;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>html,body{background:#fff}body{margin:0;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${body}</body></html>`;
}
