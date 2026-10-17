import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validationResult } from 'express-validator';
import { createLeadValidation, updateLeadValidation, normalizeIndianMobile } from '../src/validations/leadValidation';
import { normalizeMobile, validateCell } from '../../frontend/lib/import-export/validate';
import { LEAD_FIELDS } from '../../frontend/lib/import-export/field-configs';

const check = async (chains: typeof createLeadValidation, body: Record<string, unknown>) => {
  const req = { body: { ...body } } as any;
  await Promise.all(chains.map((chain) => chain.run(req)));
  const errors = validationResult(req);
  return { body: req.body, errors: errors.isEmpty() ? [] : errors.array().map((e) => e.msg) };
};

const lead = { firstName: 'Asha', lastName: 'Patil', mobile: '9876543210' };

test('a lead can be created without an email', async () => {
  assert.deepEqual((await check(createLeadValidation, lead)).errors, []);
  assert.deepEqual((await check(createLeadValidation, { ...lead, email: '' })).errors, []);
  assert.deepEqual((await check(createLeadValidation, { ...lead, email: null })).errors, []);
});

test('an email, when given, must be valid and is stored in lower case', async () => {
  assert.deepEqual((await check(createLeadValidation, { ...lead, email: 'not-an-email' })).errors, ['Email must be valid']);
  assert.equal((await check(createLeadValidation, { ...lead, email: ' Asha@Example.COM ' })).body.email, 'asha@example.com');
});

test('mobile numbers are tidied to 10 digits and anything else is rejected', async () => {
  assert.equal(normalizeIndianMobile('+91 98765-43210'), '9876543210');
  assert.equal(normalizeIndianMobile('098765 43210'), '9876543210');
  assert.equal((await check(createLeadValidation, { ...lead, mobile: '+91 98765 43210' })).body.mobile, '9876543210');
  assert.deepEqual((await check(createLeadValidation, { ...lead, mobile: '12345' })).errors, ['Mobile number must be 10 digits']);
  assert.deepEqual((await check(createLeadValidation, { ...lead, mobile: '' })).errors, ['Mobile Number is required']);
  assert.deepEqual((await check(createLeadValidation, { ...lead, alternateMobile: '99' })).errors, ['Alternate mobile must be 10 digits']);
});

test('editing an older lead does not fail on a legacy mobile format', async () => {
  const res = await check(updateLeadValidation as any, { mobile: '022-2345678', email: '' });
  assert.deepEqual(res.errors, []);
  assert.equal((await check(updateLeadValidation as any, { mobile: '+919876543210' })).body.mobile, '9876543210');
});

test('the import template needs a mobile, not an email, and checks each cell', () => {
  const field = (key: string) => LEAD_FIELDS.find((f) => f.key === key)!;
  assert.equal(field('email').required, undefined);
  assert.equal(field('mobile').required, true);
  assert.equal(validateCell(field('email'), ''), null);
  assert.match(validateCell(field('email'), 'abc')!, /email address/);
  assert.match(validateCell(field('mobile'), '')!, /required/);
  assert.match(validateCell(field('mobile'), '98765')!, /10 digit/);
  assert.equal(validateCell(field('mobile'), '+91 98765 43210'), null);
  assert.equal(normalizeMobile('0 98765 43210'), '9876543210');
  assert.equal(normalizeMobile('98765'), null);
});
