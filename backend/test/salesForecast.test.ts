import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesForecast, monthsBetween, ForecastDealInput } from '../src/utils/salesForecast';

const opts = { startDate: '2026-10-01', endDate: '2026-12-31', today: '2026-10-15' };

const deal = (overrides: Partial<ForecastDealInput>): ForecastDealInput => ({
  id: 1,
  title: 'Deal',
  client: 'Acme',
  value: 1000,
  probability: 50,
  stage: 'proposal',
  expectedCloseDate: '2026-11-10',
  owner: 'Asha Rao',
  ...overrides,
});

test('monthsBetween lists every month in the range, across a year boundary', () => {
  assert.deepEqual(monthsBetween('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthsBetween('2026-10-01', '2026-10-31'), ['2026-10']);
});

test('weights open deals by probability and buckets them by expected close month', () => {
  const f = buildSalesForecast(
    [
      deal({ id: 1, value: 1000, probability: 50, expectedCloseDate: '2026-11-10' }),
      deal({ id: 2, value: '2500.50', probability: '20', stage: 'negotiation', expectedCloseDate: new Date('2026-12-05T00:00:00Z') }),
    ],
    opts
  );
  assert.equal(f.totals.openDeals, 2);
  assert.equal(f.totals.pipeline, 3500.5);
  assert.equal(f.totals.weighted, 1000.1);
  assert.deepEqual(
    f.monthly.map((m) => [m.month, m.pipeline, m.weighted]),
    [
      ['2026-10', 0, 0],
      ['2026-11', 1000, 500],
      ['2026-12', 2500.5, 500.1],
    ]
  );
  const negotiation = f.byStage.find((s) => s.stage === 'negotiation')!;
  assert.deepEqual(negotiation, { stage: 'negotiation', count: 1, pipeline: 2500.5, weighted: 500.1 });
});

test('counts won deals by actual close date, falling back to expected close date', () => {
  const f = buildSalesForecast(
    [
      deal({ id: 1, stage: 'closed-won', value: 400, actualCloseDate: '2026-10-03', expectedCloseDate: '2027-03-01' }),
      deal({ id: 2, stage: 'closed-won', value: 600, actualCloseDate: null, expectedCloseDate: '2026-12-20' }),
      deal({ id: 3, stage: 'closed-won', value: 999, actualCloseDate: '2026-09-30' }), // before range
      deal({ id: 4, stage: 'closed-lost', value: 5000 }), // never counted
    ],
    opts
  );
  assert.equal(f.totals.won, 1000);
  assert.equal(f.totals.openDeals, 0);
  assert.equal(f.monthly.find((m) => m.month === '2026-10')!.won, 400);
  assert.equal(f.monthly.find((m) => m.month === '2026-12')!.won, 600);
});

test('reports slipped and undated open deals separately instead of forecasting them', () => {
  const f = buildSalesForecast(
    [
      deal({ id: 1, value: 300, expectedCloseDate: '2026-10-14' }), // yesterday: slipped
      deal({ id: 2, value: 700, expectedCloseDate: '2026-08-01', title: 'Oldest' }),
      deal({ id: 3, value: 200, expectedCloseDate: null }),
      deal({ id: 4, value: 100, expectedCloseDate: '2026-10-15' }), // today: still on time
    ],
    opts
  );
  assert.equal(f.totals.slippedCount, 2);
  assert.equal(f.totals.slippedValue, 1000);
  assert.equal(f.slipped[0].title, 'Oldest');
  assert.equal(f.totals.undatedCount, 1);
  assert.equal(f.totals.undatedValue, 200);
  assert.equal(f.totals.openDeals, 1);
  assert.equal(f.totals.pipeline, 100);
});

test('ignores open deals expected after the range and clamps bad probabilities', () => {
  const f = buildSalesForecast(
    [
      deal({ id: 1, expectedCloseDate: '2027-01-02' }),
      deal({ id: 2, value: 100, probability: 150 }),
      deal({ id: 3, value: 100, probability: 'abc' }),
    ],
    opts
  );
  assert.equal(f.totals.openDeals, 2);
  assert.equal(f.totals.weighted, 100);
});

test('groups by owner, with unassigned deals under "Unassigned", sorted by weighted value', () => {
  const f = buildSalesForecast(
    [
      deal({ id: 1, owner: null, value: 1000, probability: 10 }),
      deal({ id: 2, owner: 'Asha Rao', value: 1000, probability: 90 }),
      deal({ id: 3, owner: 'Asha Rao', stage: 'closed-won', value: 50, actualCloseDate: '2026-10-02' }),
    ],
    opts
  );
  assert.deepEqual(
    f.byOwner.map((o) => [o.owner, o.count, o.weighted, o.won]),
    [
      ['Asha Rao', 1, 900, 50],
      ['Unassigned', 1, 100, 0],
    ]
  );
});
