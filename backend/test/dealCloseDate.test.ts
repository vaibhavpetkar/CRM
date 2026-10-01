import { test } from 'node:test';
import assert from 'node:assert/strict';
import Deal from '../src/models/Deal';

// Runs the model's beforeSave hook directly, so no database is needed.
const save = (deal: Deal) => (Deal as any).runHooks('beforeSave', deal, {});

const persisted = (attrs: Record<string, unknown>) =>
  Deal.build({ title: 'T', client: 'C', value: 0, currency: 'INR', probability: 0, isActive: true, stage: 'proposal', ...attrs } as any, { isNewRecord: false, raw: true }); // as if loaded from the DB

test('stamps actualCloseDate when a deal moves to closed-won or closed-lost', async () => {
  const deal = persisted({ stage: 'proposal', actualCloseDate: null });
  deal.stage = 'closed-won';
  await save(deal);
  assert.ok(deal.actualCloseDate instanceof Date);
});

test('clears actualCloseDate when a closed deal is reopened', async () => {
  const deal = persisted({ stage: 'closed-lost', actualCloseDate: new Date('2026-01-01') });
  deal.stage = 'negotiation';
  await save(deal);
  assert.equal(deal.actualCloseDate, null);
});

test('leaves actualCloseDate alone when the stage did not change', async () => {
  const closedOn = new Date('2026-01-01');
  const deal = persisted({ stage: 'closed-won', actualCloseDate: closedOn });
  deal.title = 'Renamed';
  await save(deal);
  assert.equal(deal.actualCloseDate, closedOn);
});

test('stamps a deal created already closed, unless a close date was given', async () => {
  const fresh = Deal.build({ title: 'T', client: 'C', stage: 'closed-won' } as any);
  await save(fresh);
  assert.ok(fresh.actualCloseDate instanceof Date);

  const given = new Date('2025-05-05');
  const imported = Deal.build({ title: 'T', client: 'C', stage: 'closed-won', actualCloseDate: given } as any);
  await save(imported);
  assert.equal(imported.actualCloseDate, given);
});
