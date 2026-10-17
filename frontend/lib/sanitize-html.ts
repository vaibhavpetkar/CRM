/**
 * Strips anything that can run script from template HTML before it is shown
 * inside the CRM (the print builder's block previews). The server sanitizes
 * templates too; this keeps an unsaved or older template from running here.
 * Parsing with DOMParser never runs scripts or loads images.
 */
const DROP_WITH_CONTENT = 'script,iframe,frame,frameset,object,embed,applet,noscript,noembed,noframes,template,xmp,form,input,button,textarea,select,link,base,meta,animate,set,animateMotion,animateTransform';
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'background', 'poster', 'data', 'srcset', 'lowsrc', 'dynsrc', 'cite', 'longdesc', 'ping']);
const SAFE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)[;,]/;

const unsafeUrl = (value: string) => {
  const compact = value.replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
  if (/(^|,)(javascript|vbscript|livescript|mocha):/.test(compact)) return true;
  return compact.startsWith('data:') && !SAFE_DATA_URL.test(compact);
};

const cleanCss = (css: string) =>
  css
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/(java|vb)script\s*:/gi, 'blocked:')
    .replace(/-moz-binding\s*:|behavior\s*:/gi, 'blocked:')
    .replace(/@import[^;]*;?/gi, '');

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  doc.querySelectorAll(DROP_WITH_CONTENT).forEach((el) => el.remove());
  doc.querySelectorAll('style').forEach((el) => {
    el.textContent = cleanCss(el.textContent || '');
  });
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || (URL_ATTRS.has(name) && unsafeUrl(attr.value))) el.removeAttribute(attr.name);
      else if (name === 'style') el.setAttribute('style', cleanCss(attr.value));
    }
  });
  return doc.body.innerHTML;
}
