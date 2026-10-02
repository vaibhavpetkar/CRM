import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, extractPlaceholders, SafeHtml } from '../src/utils/templateRenderer';
import { amountInWords } from '../src/utils/documentPrint';

test('substitutes fields and blanks unknown ones', () => {
  assert.equal(renderTemplate('Hi {{ name }}, {{missing}}!', { name: 'Asha' }), 'Hi Asha, !');
});

test('repeats a section once per item, with outer fields still in scope', () => {
  const out = renderTemplate('{{#items}}[{{index}} {{item_name}} {{currency}}]{{/items}}', {
    currency: 'INR',
    items: [{ item_name: 'A' }, { item_name: 'B' }],
  });
  assert.equal(out, '[1 A INR][2 B INR]');
});

test('sections act as if / if-not for non-list values', () => {
  const tpl = '{{#discount}}D:{{discount}}{{/discount}}{{^discount}}none{{/discount}}';
  assert.equal(renderTemplate(tpl, { discount: '₹5' }), 'D:₹5');
  assert.equal(renderTemplate(tpl, { discount: '' }), 'none');
  assert.equal(renderTemplate('{{^items}}empty{{/items}}', { items: [] }), 'empty');
});

test('escapes values in HTML mode but not SafeHtml blocks', () => {
  const data = { client: '<b>Acme</b> & "Co"', table: new SafeHtml('<table></table>') };
  assert.equal(renderTemplate('{{client}}{{table}}', data, { escapeHtml: true }), '&lt;b&gt;Acme&lt;/b&gt; &amp; &quot;Co&quot;<table></table>');
  assert.equal(renderTemplate('{{client}}', data), '<b>Acme</b> & "Co"');
});

test('lists section names among placeholders', () => {
  assert.deepEqual(extractPlaceholders('{{#items}}{{item_name}}{{/items}} {{total}}'), ['items', 'item_name', 'total']);
});

test('amountInWords handles lakh/crore for INR and millions otherwise', () => {
  assert.equal(amountInWords(46700, 'INR'), 'Forty-six thousand seven hundred only');
  assert.equal(amountInWords(1250000, 'INR'), 'Twelve lakh fifty thousand only');
  assert.equal(amountInWords(1250000, 'USD'), 'One million two hundred fifty thousand only');
  assert.equal(amountInWords(10.5, 'USD'), 'Ten and 50/100 only');
  assert.equal(amountInWords(0), 'Zero only');
});
