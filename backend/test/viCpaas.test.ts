import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { aesDecrypt, aesEncrypt, openSecret, parseAesBytes, sealSecret } from '../src/utils/aesCbc';
import { buildStoredConfig, decryptViPayload, envSettings, fromRow } from '../src/services/voice/viSettings';
import { buildViBody, outsideCallingHours } from '../src/services/voice/vi';
import { findRecords, viDate, viDni } from '../src/services/viCpaasService';
import { isInboundReport, viPushAllowed } from '../src/services/incomingCallService';

const KEY = '0123456789abcdef0123456789abcdef'; // 32 characters
const IV = 'abcdef9876543210'; // 16 characters

test('AES key and IV are read as text, hex or base64', () => {
  const raw = crypto.randomBytes(32);
  assert.deepEqual(parseAesBytes(raw.toString('hex'), 32), raw);
  assert.deepEqual(parseAesBytes(raw.toString('base64'), 32), raw);
  assert.equal(parseAesBytes(KEY, 32).toString('utf8'), KEY);
  assert.throws(() => parseAesBytes('short', 32), /32 characters/);
});

test('AES-256-CBC matches OpenSSL and round-trips', () => {
  const plain = '{"agent_number":"9876543210"}';
  const enc = aesEncrypt(plain, KEY, IV);
  const c = crypto.createCipheriv('aes-256-cbc', Buffer.from(KEY), Buffer.from(IV));
  assert.equal(enc, Buffer.concat([c.update(plain), c.final()]).toString('base64'));
  assert.equal(aesDecrypt(enc, KEY, IV), plain);
  assert.equal(aesDecrypt(Buffer.from(enc, 'base64').toString('hex'), KEY, IV), plain);
});

test('saved secrets are sealed with the server key', () => {
  const sealed = sealSecret('my-api-password');
  assert.ok(!sealed.includes('my-api-password'));
  assert.equal(openSecret(sealed), 'my-api-password');
  assert.equal(openSecret('garbage'), '');
});

test('an encrypted Vi push is opened, plain ones are left alone', () => {
  const s = { aesKey: KEY, aesIv: IV };
  const cipher = aesEncrypt(JSON.stringify({ call_id: 'VI9', status: 'ANSWERED' }), KEY, IV);
  assert.deepEqual(decryptViPayload({ data: cipher }, s), { call_id: 'VI9', status: 'ANSWERED' });
  assert.deepEqual(decryptViPayload(cipher, s), { call_id: 'VI9', status: 'ANSWERED' });
  assert.deepEqual(decryptViPayload({ raw: cipher, token: 'x' }, s), { token: 'x', call_id: 'VI9', status: 'ANSWERED' });
  assert.deepEqual(decryptViPayload({ call_id: 'A', data: 'not cipher text at all' }, s), { call_id: 'A', data: 'not cipher text at all' });
  assert.deepEqual(decryptViPayload({ data: cipher }, { aesKey: '', aesIv: '' }), { data: cipher });
});

test('with encryption on, the CTC body is the encrypted template', () => {
  const s = { ...envSettings(), requestTemplate: '{"a":"{{agent}}","c":"{{customer}}"}', aesKey: KEY, aesIv: IV, encryptRequests: true };
  const body: any = buildViBody(s, { agent: '9876543210', customer: '9123456789' });
  assert.deepEqual(Object.keys(body), ['data']);
  assert.deepEqual(JSON.parse(aesDecrypt(body.data, KEY, IV)), { a: '9876543210', c: '9123456789' });
  assert.deepEqual(buildViBody({ ...s, encryptRequests: false }, { agent: '1', customer: '2' }), { a: '1', c: '2' });
});

test('OBD calling hours are checked in India time', () => {
  const at = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+05:30`);
  const hours = { callStart: '09:00', callEnd: '21:00' };
  assert.equal(outsideCallingHours(hours, at('10:30')), null);
  assert.match(outsideCallingHours(hours, at('21:15'))!, /between 09:00 and 21:00/);
  assert.match(outsideCallingHours(hours, at('08:59'))!, /09:00/);
  assert.equal(outsideCallingHours({ callStart: '', callEnd: '' }, at('03:00')), null);
});

test('the settings form checks URLs, JSON, hours and the AES key length', () => {
  const ok = buildStoredConfig(null, { ctcUrl: 'https://vi.example/ctc', password: 'hunter2-pass', aesKey: KEY, aesIv: IV, encryptRequests: true, callStart: '09:00', callEnd: '21:00' });
  assert.deepEqual(ok.errors, []);
  assert.ok(!JSON.stringify(ok.config).includes('hunter2'), 'secrets are not stored in clear');
  const row: any = { config: JSON.stringify(ok.config), isEnabled: true };
  const s = fromRow(row)!;
  assert.equal(s.password, 'hunter2-pass');
  assert.equal(s.aesKey, KEY);
  assert.equal(s.enabled, true);
  // A blank secret keeps the saved one; "-" clears it.
  assert.equal(fromRow({ config: JSON.stringify(buildStoredConfig(row.config, { password: '' }).config), isEnabled: true } as any)!.password, 'hunter2-pass');
  assert.equal(fromRow({ config: JSON.stringify(buildStoredConfig(row.config, { password: '-' }).config), isEnabled: true } as any)!.password, '');

  const bad = buildStoredConfig(null, { ctcUrl: 'vi.example', requestTemplate: '{oops', callStart: '9am', aesKey: 'short', encryptRequests: true });
  assert.equal(bad.errors.length, 5, bad.errors.join(' | '));
});

test('Pull Report: records are found wherever they sit, dates are DD/MM/YYYY in IST', () => {
  assert.equal(findRecords({ status: 'ok', data: { cdr: [{ call_id: 1 }, { call_id: 2 }] } }).length, 2);
  assert.equal(findRecords({ report: [{ a: 1 }] }).length, 1);
  assert.equal(findRecords({ report: '[{"a":1},{"a":2}]' }).length, 2);
  assert.equal(findRecords([{ a: 1 }]).length, 1);
  assert.deepEqual(findRecords({ report: 'report JSON will be out' }), []);
  assert.equal(viDate(new Date('2026-10-14T20:00:00Z')), '15/10/2026'); // 01:30 IST
  assert.equal(viDni({ dni: '', callerId: '+919712345642' }), '9712345642');
  assert.equal(viDni({ dni: '97123 45642', callerId: '' }), '9712345642');
});

test('a pulled report says whether it was an incoming call', () => {
  assert.equal(isInboundReport({ call_type: 'INBOUND' }), true);
  assert.equal(isInboundReport({ direction: 'incoming' }), true);
  assert.equal(isInboundReport({ call_type: 'OBD' }), false);
  assert.equal(isInboundReport({ type: 'CTC' }), false);
  assert.equal(isInboundReport({ call_id: 1 }), null);
});

test('the Schema credential is required on pushes only when saved', () => {
  const none = { webhookUsername: '', webhookPassword: '' };
  const set = { webhookUsername: 'vi', webhookPassword: 'p@ss' };
  assert.equal(viPushAllowed(none, undefined, {}), true);
  assert.equal(viPushAllowed(set, undefined, {}), false);
  assert.equal(viPushAllowed(set, `Basic ${Buffer.from('vi:p@ss').toString('base64')}`, {}), true);
  assert.equal(viPushAllowed(set, `Basic ${Buffer.from('vi:wrong').toString('base64')}`, {}), false);
  assert.equal(viPushAllowed(set, undefined, { username: 'vi', password: 'p@ss' }), true);
});

test('the old VI_* env vars still work', () => {
  process.env.VI_API_URL = 'https://vi.example/ctc';
  process.env.VI_API_KEY = 'k';
  process.env.VI_AUTH_SCHEME = 'none';
  process.env.VI_AUTH_HEADER = 'x-api-key';
  const s = envSettings();
  assert.equal(s.enabled, true);
  assert.equal(s.authType, 'header');
  assert.equal(s.authHeader, 'x-api-key');
  assert.equal(s.authScheme, '');
  for (const k of ['VI_API_URL', 'VI_API_KEY', 'VI_AUTH_SCHEME', 'VI_AUTH_HEADER']) delete process.env[k];
});
