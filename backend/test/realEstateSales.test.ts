import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { buildLeadSearch } from '../src/repositories/LeadRepository';
import { chooseNextAgent } from '../src/services/leadRotation';
import { mapViCall, fillTemplate, toViStatus, toNational } from '../src/services/voice/vi';
import { parseRange, localDay } from '../src/services/salesService';

// ─── Search box: name, number, area, 1 BHK / 2 BHK ──────────────────────────

const hasConfig = (w: any, like: string): boolean =>
  !!w && (w.configuration?.[Op.iLike] === like || (w[Op.and] || []).some((x: any) => hasConfig(x, like)));

test('"2bhk", "2 BHK" and "2 bhk" all search the 2 BHK configuration', () => {
  for (const q of ['2bhk', '2 BHK', '2 bhk']) assert.ok(hasConfig(buildLeadSearch(q), '2 BHK%'), q);
  assert.ok(hasConfig(buildLeadSearch('1rk'), '1 RK%'));
});

test('a name with an area and BHK needs every part to match', () => {
  const w: any = buildLeadSearch('Rahul Baner 3bhk');
  const parts = w[Op.and];
  assert.equal(parts.length, 3); // configuration, "Rahul", "Baner"
  const rahul = parts.find((p: any) => p[Op.or]?.some((x: any) => x.firstName?.[Op.iLike] === '%Rahul%'));
  assert.ok(rahul, 'Rahul is searched in names');
  assert.ok(rahul[Op.or].some((x: any) => x.preferredLocation), 'and in the area');
});

test('a phone number matches with spaces, dashes or +91', () => {
  for (const q of ['98765 43210', '+91-98765-43210', '9876543210']) {
    const w: any = buildLeadSearch(q);
    assert.ok(w[Op.or].some((x: any) => x.mobile?.[Op.iLike] === '%9876543210%'), q);
  }
  // A partial number works too.
  assert.ok((buildLeadSearch('98765') as any)[Op.or].some((x: any) => x.mobile?.[Op.iLike] === '%98765%'));
});

test('an empty search adds no condition and LIKE wildcards are escaped', () => {
  assert.equal(buildLeadSearch('   '), null);
  assert.equal((buildLeadSearch('50%') as any)[Op.or][0].leadNumber[Op.iLike], '%50\\%%');
});

// ─── Rotational calling ─────────────────────────────────────────────────────

test('rotation goes round in order, starting after the last person', () => {
  const all = () => true;
  assert.equal(chooseNextAgent([1, 2, 3], null, all), 1);
  assert.equal(chooseNextAgent([1, 2, 3], 1, all), 2);
  assert.equal(chooseNextAgent([1, 2, 3], 3, all), 1);
  // Someone removed from the rotation: start from the top.
  assert.equal(chooseNextAgent([1, 2, 3], 9, all), 1);
});

test('rotation skips people who are offline or on a call', () => {
  const free = new Set([1, 3]);
  assert.equal(chooseNextAgent([1, 2, 3], 1, (id) => free.has(id)), 3);
  assert.equal(chooseNextAgent([1, 2, 3], 3, (id) => free.has(id)), 1);
});

test('with nobody free the turn still moves on, so no lead is left unassigned', () => {
  assert.equal(chooseNextAgent([1, 2, 3], 2, () => false), 3);
  assert.equal(chooseNextAgent([], null, () => true), null);
});

// ─── Vi Business provider ───────────────────────────────────────────────────

test('Vi request template is filled with 10-digit numbers and the callback URL', () => {
  const body: any = fillTemplate('{"from":"{{agent}}","to":"{{customer}}","cli":"{{callerId}}","hook":"{{callbackUrl}}","x":{"rec":"{{record}}"}}', {
    agent: toNational('+919876543210'),
    customer: toNational('+919123456789'),
    callerId: toNational('+918047112345'),
    callbackUrl: 'https://crm.example/api/webhooks/voice/abc',
    record: 'true',
  });
  assert.deepEqual(body, { from: '9876543210', to: '9123456789', cli: '8047112345', hook: 'https://crm.example/api/webhooks/voice/abc', x: { rec: 'true' } });
});

test('Vi responses and webhooks are read whatever they call their fields', () => {
  assert.equal(mapViCall({ data: { call_id: 'VI123', status: 'initiated' } }).providerCallId, 'VI123');
  const ended = mapViCall({ callId: 77, call_status: 'ANSWERED_COMPLETED', talk_time: '00:02:05', recording_url: 'https://rec.vi/a.mp3' });
  assert.equal(ended.providerCallId, '77');
  assert.equal(ended.status, 'completed');
  assert.equal(ended.durationSeconds, 125);
  assert.equal(ended.recordingUrl, 'https://rec.vi/a.mp3');
  assert.equal(toViStatus('NO_ANSWER'), 'no-answer');
  assert.equal(toViStatus('customer busy'), 'busy');
  assert.equal(toViStatus('ringing'), 'ringing');
  assert.equal(toViStatus('connected'), 'in-progress');
  // "ANSWERED" with an end time is a finished call.
  assert.equal(mapViCall({ call_id: 'x', disposition: 'ANSWERED', end_time: '2026-10-08 17:05:12' }).status, 'completed');
});

// ─── Date ranges in Indian time ─────────────────────────────────────────────

test('a day range covers the whole Indian calendar day', () => {
  const { start, end } = parseRange('2026-10-08', '2026-10-08');
  assert.equal(start.toISOString(), '2026-10-07T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-10-08T18:30:00.000Z');
  assert.equal(localDay(new Date('2026-10-07T19:00:00Z')), '2026-10-08');
  // Reversed dates are swapped, bad input falls back to today.
  assert.equal(parseRange('2026-10-09', '2026-10-01').fromDay, '2026-10-01');
  assert.equal(parseRange('junk').fromDay, localDay(new Date()));
});
