import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePresence } from '../src/services/presenceService';

const now = new Date('2026-10-04T10:00:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000);

test('an agent on a live call is On call from when the call started, even with the CRM closed', () => {
  const r = derivePresence({ online: false, activeCallSince: ago(204), now, afterCallSeconds: 120 });
  assert.equal(r.state, 'on_call');
  assert.deepEqual(r.since, ago(204));
});

test('a live call wins over a call that just ended', () => {
  const r = derivePresence({ online: true, activeCallSince: ago(5), lastCallEndedAt: ago(10), now, afterCallSeconds: 120 });
  assert.equal(r.state, 'on_call');
});

test('After call work lasts the configured window after a call ends', () => {
  assert.equal(derivePresence({ online: true, lastCallEndedAt: ago(119), now, afterCallSeconds: 120 }).state, 'after_call');
  assert.equal(derivePresence({ online: true, lastCallEndedAt: ago(121), now, afterCallSeconds: 120 }).state, 'available');
});

test('a window of 0 turns After call work off', () => {
  assert.equal(derivePresence({ online: true, lastCallEndedAt: ago(1), now, afterCallSeconds: 0 }).state, 'available');
});

test('with no call, the state follows whether the CRM is open', () => {
  assert.equal(derivePresence({ online: true, now, afterCallSeconds: 120 }).state, 'available');
  assert.equal(derivePresence({ online: false, now, afterCallSeconds: 120 }).state, 'offline');
});
