import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchDates } from '../src/repositories/LeadRepository';

const day = (d: string) => ({ from: d, to: d });

test('day-first dates in every separator style', () => {
  for (const t of ['20-11-26', '20/11/2026', '20.11.26', '20-nov-26', '20 Nov 2026', '20/november/26']) {
    assert.deepEqual(extractSearchDates(t).range, day('2026-11-20'), t);
  }
});

test('a month on its own covers the whole month', () => {
  assert.deepEqual(extractSearchDates('nov-26').range, { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(extractSearchDates('feb 2028').range, { from: '2028-02-01', to: '2028-02-29' });
});

test('dates mix with other words and ranges', () => {
  const r = extractSearchDates('rahul 20-nov-26');
  assert.equal(r.rest.trim(), 'rahul');
  assert.deepEqual(r.range, day('2026-11-20'));
  assert.deepEqual(extractSearchDates('1-11-26 to 20-11-26').range, { from: '2026-11-01', to: '2026-11-20' });
});

test('non-dates are left alone', () => {
  for (const t of ['31-02-26', '9876543210', 'Mayur', '2 bhk baner']) {
    assert.equal(extractSearchDates(t).range, null, t);
  }
});
