import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactUrl } from '../src/utils/redactUrl';
import { passwordFingerprint, tokenMatchesPassword } from '../src/middleware/authMiddleware';

test('tokens in URLs are hidden before logging', () => {
  const token = 'a'.repeat(64);
  assert.equal(redactUrl(`/api/webhooks/voice/incoming/${token}`), '/api/webhooks/voice/incoming/[redacted]');
  assert.equal(redactUrl(`/api/auth/invite/${token}`), '/api/auth/invite/[redacted]');
  assert.equal(redactUrl('/api/leads?page=2&token=abc'), '/api/leads?page=2&token=[redacted]');
  assert.equal(redactUrl('/api/leads/42?status=new'), '/api/leads/42?status=new');
});

test('a sign-in token stops working once the password changes', () => {
  const user = { password: '$2a$10$oldhash' };
  const decoded = { id: 1, pwv: passwordFingerprint(user.password) };
  assert.equal(tokenMatchesPassword(decoded, user), true);
  assert.equal(tokenMatchesPassword(decoded, { password: '$2a$10$newhash' }), false);
  // Tokens issued before this change carry no fingerprint and still work until they expire.
  assert.equal(tokenMatchesPassword({ id: 1 }, user), true);
  assert.notEqual(passwordFingerprint(user.password), user.password);
});
