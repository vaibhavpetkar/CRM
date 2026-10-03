import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndianNumber, formatIndianNumber } from '../src/utils/indianPhone';
import { mapExotelCall } from '../src/services/voice/exotel';

test('normalizes the ways people type Indian numbers', () => {
  for (const input of ['9876543210', '09876543210', '+91 98765 43210', '91-98765-43210', '0091 9876543210', ' (+91) 98765-43210 ']) {
    assert.equal(normalizeIndianNumber(input), '+919876543210', input);
  }
  assert.equal(normalizeIndianNumber('022 1234 5678'), '+912212345678'); // Mumbai landline with STD code
});

test('rejects numbers that are not Indian', () => {
  for (const input of ['', null, undefined, '12345', '1234567890', '+1 415 555 0100', '+44 20 7946 0958', '98765432101234']) {
    assert.equal(normalizeIndianNumber(input as any), null, String(input));
  }
});

test('formats numbers for display', () => {
  assert.equal(formatIndianNumber('+919876543210'), '+91 98765 43210');
});

test('maps an Exotel status callback', () => {
  const update = mapExotelCall({
    CallSid: 'abc123',
    Status: 'completed',
    RecordingUrl: 'https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/x/abc123.mp3',
    ConversationDuration: '125',
    StartTime: '2026-10-03 17:05:12',
    EndTime: '2026-10-03 17:07:30',
  });
  assert.equal(update.providerCallId, 'abc123');
  assert.equal(update.status, 'completed');
  assert.equal(update.durationSeconds, 125);
  assert.equal(update.startedAt?.toISOString(), '2026-10-03T11:35:12.000Z'); // IST -> UTC
  assert.match(update.recordingUrl || '', /abc123\.mp3$/);
});

test('ignores unknown statuses and junk recording urls', () => {
  const update = mapExotelCall({ Sid: 'x', Status: 'weird', RecordingUrl: 'null', Duration: '' });
  assert.equal(update.status, undefined);
  assert.equal(update.recordingUrl, null);
  assert.equal(update.durationSeconds, null);
});

test('places an Exotel click-to-call: agent first, then the customer, recorded', async () => {
  const { ExotelProvider } = await import('../src/services/voice/exotel');
  Object.assign(process.env, {
    EXOTEL_ACCOUNT_SID: 'acme1',
    EXOTEL_API_KEY: 'key',
    EXOTEL_API_TOKEN: 'secret',
    EXOTEL_CALLER_ID: '08047112345',
    EXOTEL_SUBDOMAIN: 'api.in.exotel.com',
  });
  const realFetch = global.fetch;
  let seen: { url: string; init: any } | null = null;
  global.fetch = (async (url: any, init: any) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ Call: { Sid: 'sid42', Status: 'in-progress' } }), { status: 200 });
  }) as any;
  try {
    const provider = new ExotelProvider();
    assert.deepEqual(provider.missingEnvVars(), []);
    const result = await provider.placeCall({
      agentNumber: '+919123456789',
      customerNumber: '+919876543210',
      statusCallbackUrl: 'https://crm.example/api/webhooks/voice/tok',
      record: true,
    });
    assert.equal(result.providerCallId, 'sid42');
    assert.equal(result.status, 'in-progress');
    assert.equal(seen!.url, 'https://api.in.exotel.com/v1/Accounts/acme1/Calls/connect.json');
    assert.equal(seen!.init.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
    const form = new URLSearchParams(seen!.init.body);
    assert.equal(form.get('From'), '+919123456789');
    assert.equal(form.get('To'), '+919876543210');
    assert.equal(form.get('CallerId'), '08047112345');
    assert.equal(form.get('Record'), 'true');
    assert.equal(form.get('StatusCallback'), 'https://crm.example/api/webhooks/voice/tok');
  } finally {
    global.fetch = realFetch;
  }
});

test('reports Exotel refusals with their message', async () => {
  const { ExotelProvider } = await import('../src/services/voice/exotel');
  const realFetch = global.fetch;
  global.fetch = (async () =>
    new Response(JSON.stringify({ RestException: { Message: 'To number is on DND' } }), { status: 400 })) as any;
  try {
    await assert.rejects(
      new ExotelProvider().placeCall({ agentNumber: '+919123456789', customerNumber: '+919876543210', statusCallbackUrl: 'x', record: true }),
      /To number is on DND/
    );
  } finally {
    global.fetch = realFetch;
  }
});
