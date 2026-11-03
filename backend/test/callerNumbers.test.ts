import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseCallerNumber } from '../src/services/callerNumbers';
import { toExotelNumber } from '../src/services/voice/exotel';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000);
const pool = [
  { id: 1, number: '+918047110001', userId: null, lastUsedAt: at(5) },
  { id: 2, number: '+918047110002', userId: null, lastUsedAt: at(30) },
  { id: 3, number: '+918047110003', userId: null, lastUsedAt: null },
];
const choose = (overrides: Partial<Parameters<typeof chooseCallerNumber>[0]> = {}) =>
  chooseCallerNumber({ numbers: pool, userId: 7, busyNumbers: new Set(), lastNumberForCustomer: null, ...overrides })?.number;

test('a person with their own number always calls from it', () => {
  const numbers = [...pool, { id: 9, number: '+918047119999', userId: 7, lastUsedAt: at(0) }];
  assert.equal(choose({ numbers }), '+918047119999');
  assert.equal(choose({ numbers, busyNumbers: new Set(['+918047119999']) }), '+918047119999');
});

test('pool: least recently used number that nobody is calling from', () => {
  assert.equal(choose(), '+918047110003'); // never used
  assert.equal(choose({ busyNumbers: new Set(['+918047110003']) }), '+918047110002');
  assert.equal(choose({ busyNumbers: new Set(['+918047110003', '+918047110002']) }), '+918047110001');
});

test('people calling at the same time get different numbers', () => {
  const busy = new Set<string>();
  const picked = [1, 2, 3].map((userId) => {
    const n = chooseCallerNumber({ numbers: pool, userId, busyNumbers: busy, lastNumberForCustomer: null })!.number;
    busy.add(n);
    return n;
  });
  assert.equal(new Set(picked).size, 3);
});

test('pool: a customer is called back from the number they saw before, when it is free', () => {
  assert.equal(choose({ lastNumberForCustomer: '+918047110001' }), '+918047110001');
  assert.equal(choose({ lastNumberForCustomer: '+918047110001', busyNumbers: new Set(['+918047110001']) }), '+918047110003');
});

test('pool: when every number is busy, the least recently used is shared', () => {
  assert.equal(choose({ busyNumbers: new Set(pool.map((n) => n.number)) }), '+918047110003');
});

test('other people\'s dedicated numbers are never used', () => {
  const numbers = [{ id: 4, number: '+918047110004', userId: 8, lastUsedAt: null }];
  assert.equal(choose({ numbers }), undefined);
});

test('ExoPhones are sent to Exotel in their 0-prefixed form', () => {
  assert.equal(toExotelNumber('+918047112345'), '08047112345');
});
