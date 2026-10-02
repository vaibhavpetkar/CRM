import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { mapMetaLead, cleanPhone } from '../src/utils/metaLeadMapping';
import { verifySignature, extractLeadgenChanges } from '../src/services/metaLeadsService';

test('maps the standard Meta lead form questions onto lead fields', () => {
  const lead = mapMetaLead([
    { name: 'full_name', values: ['Asha Rani Kulkarni'] },
    { name: 'email', values: ['Asha@Example.COM'] },
    { name: 'phone_number', values: ['+91 98765-43210'] },
    { name: 'company_name', values: ['Kulkarni Traders'] },
    { name: 'job_title', values: ['Owner'] },
    { name: 'city', values: ['Pune'] },
    { name: 'zip_code', values: ['411001'] },
  ]);
  assert.equal(lead.firstName, 'Asha Rani');
  assert.equal(lead.lastName, 'Kulkarni');
  assert.equal(lead.email, 'asha@example.com');
  assert.equal(lead.mobile, '+919876543210');
  assert.equal(lead.company, 'Kulkarni Traders');
  assert.equal(lead.jobTitle, 'Owner');
  assert.equal(lead.city, 'Pune');
  assert.equal(lead.zipCode, '411001');
  assert.deepEqual(lead.extras, []);
});

test('keeps custom questions and unusable values as extras', () => {
  const lead = mapMetaLead([
    { name: 'first_name', values: ['Ravi'] },
    { name: 'what_is_your_budget?', values: ['5-10 lakh'] },
    { name: 'email', values: ['not an email'] },
    { name: 'services', values: ['SEO', 'Ads'] },
  ]);
  assert.equal(lead.firstName, 'Ravi');
  assert.equal(lead.lastName, '-');
  assert.equal(lead.email, null);
  assert.deepEqual(lead.extras, [
    ['What is your budget?', '5-10 lakh'],
    ['Email', 'not an email'],
    ['Services', 'SEO, Ads'],
  ]);
});

test('falls back to the email or phone when the form has no name', () => {
  assert.equal(mapMetaLead([{ name: 'email', values: ['x@y.in'] }]).firstName, 'x');
  assert.equal(mapMetaLead([{ name: 'phone_number', values: ['98765 43210'] }]).firstName, '9876543210');
  assert.equal(mapMetaLead([]).firstName, 'Facebook lead');
  assert.equal(cleanPhone('call me'), '');
});

test('verifies Meta webhook signatures against the raw body', () => {
  const body = Buffer.from('{"object":"page"}');
  const sig = `sha256=${crypto.createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifySignature(body, sig, 'secret'), true);
  assert.equal(verifySignature(body, sig, 'other-secret'), false);
  assert.equal(verifySignature(Buffer.from('{"object":"page" }'), sig, 'secret'), false);
  assert.equal(verifySignature(body, undefined, 'secret'), false);
  assert.equal(verifySignature(body, 'sha256=abc', 'secret'), false);
});

test('pulls leadgen ids out of a webhook payload', () => {
  const changes = extractLeadgenChanges({
    object: 'page',
    entry: [
      {
        id: '111',
        changes: [
          { field: 'leadgen', value: { leadgen_id: '999', page_id: '111', form_id: '5' } },
          { field: 'feed', value: { post_id: '1' } },
        ],
      },
    ],
  });
  assert.deepEqual(changes, [{ pageId: '111', leadgenId: '999' }]);
  assert.deepEqual(extractLeadgenChanges({ object: 'instagram', entry: [] }), []);
});
