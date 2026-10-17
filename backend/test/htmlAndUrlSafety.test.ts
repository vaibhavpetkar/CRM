import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, checkUrlShape, isPrivateIp } from '../src/utils/urlGuard';
import { sanitizeHtml } from '../src/utils/sanitizeHtml';
import { quotePdfDownloadName } from '../src/services/QuoteService';

const resolvesTo = (...addresses: string[]) => async () => addresses;

test('internal and private addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '49.44.1.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('URL shape: https by default, no credentials, no internal names', () => {
  assert.throws(() => checkUrlShape('http://example.com/a'), /https:\/\//);
  assert.equal(checkUrlShape('http://example.com/a', { allowHttp: true }).hostname, 'example.com');
  assert.throws(() => checkUrlShape('file:///etc/passwd', { allowHttp: true }));
  assert.throws(() => checkUrlShape('https://user:pw@example.com/'));
  for (const u of ['https://localhost/', 'https://backend:5000/', 'https://ollama/', 'https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/', 'https://db.internal/', 'https://0x7f000001/']) {
    assert.throws(() => checkUrlShape(u), /private|internal/, u);
  }
  assert.ok(checkUrlShape('https://cts.myvi.in:8443/Cpaas/api/v1/clicktocall/initiate-call'));
});

test('a public name that resolves to an internal address is refused', async () => {
  await assert.rejects(assertPublicUrl('https://evil.example.com/', { lookup: resolvesTo('169.254.169.254') }), /private|internal/);
  await assert.rejects(assertPublicUrl('https://evil.example.com/', { lookup: resolvesTo('93.184.216.34', '10.0.0.5') }), /private|internal/);
  const ok = await assertPublicUrl('https://cts.myvi.in:8443/x', { lookup: resolvesTo('117.239.0.10') });
  assert.equal(ok.port, '8443');
});

test('templates lose scripts, handlers and script URLs but keep layout', () => {
  const clean = sanitizeHtml(`<!DOCTYPE html><html><head><style>.a{color:red}</style></head><body>
    <h1 class="t" onclick="steal()">Quote {{quote_number}}</h1>
    <script>alert(1)</script><SCRIPT src=//x></SCRIPT>
    <img src="{{company_logo}}" onerror=alert(1) alt="">
    <img src="data:image/png;base64,AAAA">
    <a href="java&#x09;script:alert(1)">x</a><a href=" JaVaScRiPt:alert(1)">y</a><a href="https://ok.example/?a=1&amp;b=2">z</a>
    <iframe src="https://x"></iframe><object data="x"></object>
    <svg><a xlink:href="javascript:alert(1)"><text>t</text></a><animate attributeName="href" to="javascript:alert(1)"/></svg>
    <div style="background:url(javascript:alert(1));width:expression(alert(1))">s</div>
    <form action="https://x"><input name="p"></form><!-- <script>bad()</script> -->
    <a href="data:text/html,<script>alert(1)</script>">d</a>
    <meta http-equiv="refresh" content="0;url=javascript:alert(1)">
  </body></html>`);
  assert.doesNotMatch(clean, /<script|onerror|onclick|javascript:|<iframe|<object|<form|<input|<animate|expression\(|http-equiv|data:text/i);
  assert.match(clean, /<style>\.a\{color:red\}<\/style>/);
  assert.match(clean, /<h1 class="t">Quote \{\{quote_number\}\}<\/h1>/);
  assert.match(clean, /<img src="\{\{company_logo\}\}" alt="">/);
  assert.match(clean, /src="data:image\/png;base64,AAAA"/);
  assert.match(clean, /href="https:\/\/ok\.example\/\?a=1&amp;b=2"/);
  // A quote inside an attribute value cannot break out of it.
  assert.equal(sanitizeHtml(`<p title='a"><img src=x onerror=alert(1)>'>t</p>`), '<p title="a&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">t</p>');
});

test('a style block cannot be closed early to slip a script in', () => {
  const clean = sanitizeHtml('<style>a{}</style ><script>alert(1)</script><style>b{}</style>');
  assert.doesNotMatch(clean, /<script/i);
});

test('saved quote PDFs have unguessable names but download with a friendly one', () => {
  assert.equal(quotePdfDownloadName('uploads/7-0123456789abcdef01234567-quote-QTN-2026-00001-v2.pdf'), 'quote-QTN-2026-00001-v2.pdf');
});
