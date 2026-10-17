/**
 * A small HTML sanitizer for document templates (print formats, emails).
 * Templates are written by company users and later opened in the CRM's own
 * origin and on the public quote page, so anything that can run script is
 * removed: script-like elements, on* handlers, and javascript:/vbscript:/data:
 * URLs. Layout HTML and <style> blocks are kept as written.
 *
 * It re-tokenises the markup the way a browser does (tags, attributes,
 * comments) and rebuilds each tag from its parsed attributes, so odd quoting
 * cannot smuggle a handler through.
 */

// Removed together with everything inside them.
const DROP_WITH_CONTENT = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'noembed', 'noframes', 'template', 'xmp']);
// The tag is removed; its children stay (and are sanitized).
const DROP_TAG = new Set(['form', 'input', 'button', 'textarea', 'select', 'option', 'optgroup', 'link', 'base', 'animate', 'set', 'animatemotion', 'animatetransform', 'plaintext']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'background', 'poster', 'data', 'srcset', 'lowsrc', 'dynsrc', 'cite', 'longdesc', 'ping']);
const DROP_ATTRS = new Set(['srcdoc', 'formaction']);

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&(colon|tab|newline|amp|lt|gt|quot|apos|nbsp);/gi, (_, n: string) =>
      ({ colon: ':', tab: '\t', newline: '\n', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n.toLowerCase() as 'amp'],
    );

const safeChar = (code: number) => (Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '');

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SAFE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)[;,]/;

/** True when a URL attribute's value would run script or load an unsafe data: document. */
const isUnsafeUrl = (value: string) => {
  // Browsers ignore control characters and whitespace inside the scheme.
  const compact = value.replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|livescript|mocha):/.test(compact)) return true;
  if (compact.startsWith('data:')) return !SAFE_DATA_URL.test(compact);
  // srcset lists several URLs.
  return /(^|,)\s*(javascript|vbscript):/.test(compact);
};

/** Removes CSS that can run script or load a script binding. */
export const sanitizeCss = (css: string) =>
  css
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/(java|vb)script\s*:/gi, 'blocked:')
    .replace(/-moz-binding\s*:/gi, 'blocked:')
    .replace(/behavior\s*:/gi, 'blocked:')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/<\/(style)/gi, '<\\/$1');

interface Attr {
  name: string;
  value: string | null;
}

const isAsciiLetter = (c: string | undefined) => !!c && /[a-zA-Z]/.test(c);

export const sanitizeHtml = (input: string | null | undefined): string => {
  const html = String(input ?? '');
  let out = '';
  let i = 0;
  const n = html.length;

  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    i = lt;
    const next = html[i + 1];

    // Comments, doctype and other <! / <? markup.
    if (next === '!' || next === '?') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? n : end + 3; // comments are dropped
        continue;
      }
      const end = html.indexOf('>', i);
      const decl = html.slice(i, end === -1 ? n : end + 1);
      if (/^<!doctype\s+html[^<>]*>$/i.test(decl)) out += decl;
      i = end === -1 ? n : end + 1;
      continue;
    }

    const closing = next === '/';
    if (!isAsciiLetter(closing ? html[i + 2] : next)) {
      // A lone "<" is text to the browser too.
      out += '&lt;';
      i += 1;
      continue;
    }

    // Tag name.
    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (j < n && !/[\s/>]/.test(html[j])) j++;
    const name = html.slice(nameStart, j).toLowerCase();

    // Attributes, read the way the HTML tokenizer reads them.
    const attrs: Attr[] = [];
    while (j < n && html[j] !== '>') {
      if (/[\s/]/.test(html[j])) {
        j++;
        continue;
      }
      const aStart = j;
      j++; // a name may start with "=" in the spec; take at least one char
      while (j < n && !/[\s/>=]/.test(html[j])) j++;
      const aName = html.slice(aStart, j).toLowerCase();
      while (j < n && /\s/.test(html[j])) j++;
      let value: string | null = null;
      if (html[j] === '=') {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1);
          value = html.slice(j + 1, end === -1 ? n : end);
          j = end === -1 ? n : end + 1;
        } else {
          const vStart = j;
          while (j < n && !/[\s>]/.test(html[j])) j++;
          value = html.slice(vStart, j);
        }
      }
      attrs.push({ name: aName, value: value === null ? null : decodeEntities(value) });
    }
    const selfClosing = html[j - 1] === '/';
    i = j < n ? j + 1 : n;

    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing) {
        const end = html.toLowerCase().indexOf(`</${name}`, i);
        if (end === -1) i = n;
        else {
          const gt = html.indexOf('>', end);
          i = gt === -1 ? n : gt + 1;
        }
      }
      continue;
    }
    if (DROP_TAG.has(name)) continue;
    if (name === 'meta' && attrs.some((a) => a.name === 'http-equiv')) continue;

    if (closing) {
      out += `</${name}>`;
      continue;
    }

    let tag = `<${name}`;
    for (const a of attrs) {
      if (!/^[a-z_:][a-z0-9_.:-]*$/.test(a.name)) continue;
      if (a.name.startsWith('on') || DROP_ATTRS.has(a.name)) continue;
      if (a.value === null) {
        tag += ` ${a.name}`;
        continue;
      }
      let value = a.value;
      if (URL_ATTRS.has(a.name) && isUnsafeUrl(value)) continue;
      if (a.name === 'style') value = sanitizeCss(value);
      tag += ` ${a.name}="${escapeAttr(value)}"`;
    }
    out += `${tag}${selfClosing ? ' /' : ''}>`;

    // <style> holds raw CSS until </style>, exactly as the browser reads it.
    if (name === 'style') {
      const end = html.toLowerCase().indexOf('</style', i);
      out += sanitizeCss(html.slice(i, end === -1 ? n : end));
      i = end === -1 ? n : end;
    }
  }
  return out;
};
