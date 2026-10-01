/**
 * Sales forecast built from the Deals the team already tracks: each open
 * deal's value, win probability and expected close date. Kept free of any
 * database access so the numbers can be unit tested on plain objects.
 *
 *   Pipeline = sum of open deal values expected to close in the range
 *   Weighted = sum of (value × probability%) for those same deals, i.e. what
 *              the pipeline is "worth" if every probability is accurate
 *   Won      = sum of closed-won deal values whose actual close date falls in
 *              the range (falls back to expected close date when the actual
 *              one was never set)
 *
 * Open deals whose expected close date is already in the past are reported
 * separately as "slipped" so they don't silently inflate a future month, and
 * open deals with no expected close date are counted as "undated".
 */

export const OPEN_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation'] as const;
export const WON_STAGE = 'closed-won';

export interface ForecastDealInput {
  id: number;
  title: string;
  client: string;
  value: number | string;
  probability: number | string;
  stage: string;
  expectedCloseDate?: Date | string | null;
  actualCloseDate?: Date | string | null;
  owner?: string | null;
}

export interface ForecastMonth {
  month: string; // YYYY-MM
  pipeline: number;
  weighted: number;
  won: number;
}

export interface ForecastGroup {
  count: number;
  pipeline: number;
  weighted: number;
}

export interface ForecastOwner extends ForecastGroup {
  owner: string;
  won: number;
}

export interface SlippedDeal {
  id: number;
  title: string;
  client: string;
  stage: string;
  value: number;
  probability: number;
  expectedCloseDate: string; // YYYY-MM-DD
  owner: string;
}

export interface SalesForecast {
  startDate: string;
  endDate: string;
  totals: {
    openDeals: number;
    pipeline: number;
    weighted: number;
    won: number;
    slippedCount: number;
    slippedValue: number;
    undatedCount: number;
    undatedValue: number;
  };
  monthly: ForecastMonth[];
  byStage: ({ stage: string } & ForecastGroup)[];
  byOwner: ForecastOwner[];
  slipped: SlippedDeal[];
}

const UNASSIGNED = 'Unassigned';
const SLIPPED_LIST_LIMIT = 10;

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM-DD for a Date/ISO string, or null when missing/invalid. */
export const toDay = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/** Every YYYY-MM between two YYYY-MM-DD days, inclusive, so empty months still chart as zero. */
export const monthsBetween = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];
  let y = Number(startDate.slice(0, 4));
  let m = Number(startDate.slice(5, 7));
  const endKey = endDate.slice(0, 7);
  // Hard cap so a typo'd range (e.g. year 20260) can't build a huge array.
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > endKey) break;
    months.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
};

export const buildSalesForecast = (
  deals: ForecastDealInput[],
  opts: { startDate: string; endDate: string; today: string }
): SalesForecast => {
  const { startDate, endDate, today } = opts;
  const inRange = (day: string) => day >= startDate && day <= endDate;

  const monthMap = new Map<string, ForecastMonth>(
    monthsBetween(startDate, endDate).map((month) => [month, { month, pipeline: 0, weighted: 0, won: 0 }])
  );
  const stageMap = new Map<string, ForecastGroup>(
    OPEN_STAGES.map((stage) => [stage, { count: 0, pipeline: 0, weighted: 0 }])
  );
  const ownerMap = new Map<string, ForecastOwner>();
  const ownerRow = (owner: string) => {
    let row = ownerMap.get(owner);
    if (!row) {
      row = { owner, count: 0, pipeline: 0, weighted: 0, won: 0 };
      ownerMap.set(owner, row);
    }
    return row;
  };

  const totals = {
    openDeals: 0,
    pipeline: 0,
    weighted: 0,
    won: 0,
    slippedCount: 0,
    slippedValue: 0,
    undatedCount: 0,
    undatedValue: 0,
  };
  const slipped: SlippedDeal[] = [];

  for (const deal of deals) {
    const value = toNumber(deal.value);
    const probability = Math.min(100, Math.max(0, toNumber(deal.probability)));
    const owner = deal.owner?.trim() || UNASSIGNED;

    if (deal.stage === WON_STAGE) {
      const closedOn = toDay(deal.actualCloseDate) || toDay(deal.expectedCloseDate);
      if (!closedOn || !inRange(closedOn)) continue;
      totals.won += value;
      const month = monthMap.get(closedOn.slice(0, 7));
      if (month) month.won += value;
      ownerRow(owner).won += value;
      continue;
    }

    if (!(OPEN_STAGES as readonly string[]).includes(deal.stage)) continue;

    const expected = toDay(deal.expectedCloseDate);
    if (!expected) {
      totals.undatedCount += 1;
      totals.undatedValue += value;
      continue;
    }

    if (expected < today) {
      totals.slippedCount += 1;
      totals.slippedValue += value;
      slipped.push({
        id: deal.id,
        title: deal.title,
        client: deal.client,
        stage: deal.stage,
        value,
        probability,
        expectedCloseDate: expected,
        owner,
      });
      continue;
    }

    if (!inRange(expected)) continue;

    const weighted = (value * probability) / 100;
    totals.openDeals += 1;
    totals.pipeline += value;
    totals.weighted += weighted;

    const month = monthMap.get(expected.slice(0, 7));
    if (month) {
      month.pipeline += value;
      month.weighted += weighted;
    }

    const stage = stageMap.get(deal.stage)!;
    stage.count += 1;
    stage.pipeline += value;
    stage.weighted += weighted;

    const ownerTotals = ownerRow(owner);
    ownerTotals.count += 1;
    ownerTotals.pipeline += value;
    ownerTotals.weighted += weighted;
  }

  // Oldest slip first — those are the deals most in need of a date update.
  slipped.sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate) || b.value - a.value);

  return {
    startDate,
    endDate,
    totals: {
      ...totals,
      pipeline: round2(totals.pipeline),
      weighted: round2(totals.weighted),
      won: round2(totals.won),
      slippedValue: round2(totals.slippedValue),
      undatedValue: round2(totals.undatedValue),
    },
    monthly: Array.from(monthMap.values()).map((m) => ({
      ...m,
      pipeline: round2(m.pipeline),
      weighted: round2(m.weighted),
      won: round2(m.won),
    })),
    byStage: Array.from(stageMap.entries()).map(([stage, g]) => ({
      stage,
      count: g.count,
      pipeline: round2(g.pipeline),
      weighted: round2(g.weighted),
    })),
    byOwner: Array.from(ownerMap.values())
      .map((o) => ({ ...o, pipeline: round2(o.pipeline), weighted: round2(o.weighted), won: round2(o.won) }))
      .sort((a, b) => b.weighted - a.weighted || b.won - a.won),
    slipped: slipped.slice(0, SLIPPED_LIST_LIMIT),
  };
};
