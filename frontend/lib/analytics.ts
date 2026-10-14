// Day-by-day series and period comparisons for the dashboard and report KPI
// cards, computed in the browser from the deal list.

export const DAY_MS = 86400000;

/** End-of-day timestamps for the last `days` days, oldest first. */
export function dayEnds(days: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return Array.from({ length: days }, (_, i) => end.getTime() - (days - 1 - i) * DAY_MS);
}

/** Percent change from `previous` to `current`, rounded to one decimal. */
export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

const isClosed = (stage: string) => stage === 'closed-won' || stage === 'closed-lost';

type ParsedDeal = { at: number; value: number; prob: number; stage: string; closed: number };

export function parseDeals(deals: any[]): ParsedDeal[] {
  return deals
    .map((d) => ({
      at: new Date(d.createdAt).getTime(),
      value: Number(d.value) || 0,
      prob: Number(d.probability) || 0,
      stage: String(d.stage || ''),
      closed: new Date(d.actualCloseDate || d.updatedAt || d.createdAt).getTime(),
    }))
    .filter((d) => !Number.isNaN(d.at));
}

/** Point-in-time measures of the pipeline as it stood at timestamp `t`. */
export const dealMeasures = {
  value: (deals: ParsedDeal[], t: number) => deals.filter((d) => d.at <= t).reduce((s, d) => s + d.value, 0),
  weighted: (deals: ParsedDeal[], t: number) => deals.filter((d) => d.at <= t).reduce((s, d) => s + (d.value * d.prob) / 100, 0),
  count: (deals: ParsedDeal[], t: number) => deals.filter((d) => d.at <= t).length,
  open: (deals: ParsedDeal[], t: number) => deals.filter((d) => d.at <= t && !(isClosed(d.stage) && d.closed <= t)).length,
  average: (deals: ParsedDeal[], t: number) => {
    const upTo = deals.filter((d) => d.at <= t);
    return upTo.length ? upTo.reduce((s, d) => s + d.value, 0) / upTo.length : 0;
  },
  winRate: (deals: ParsedDeal[], t: number) => {
    const closed = deals.filter((d) => isClosed(d.stage) && d.closed <= t);
    return closed.length ? Math.round((closed.filter((d) => d.stage === 'closed-won').length / closed.length) * 100) : 0;
  },
};

/**
 * Daily series of `measure` over the last `days` days, and its change from
 * the start of that window to now. Win rate changes are in percentage points.
 */
export function dealTrend(deals: ParsedDeal[], days: number, measure: keyof typeof dealMeasures) {
  const ends = dayEnds(days);
  const fn = dealMeasures[measure];
  const now = fn(deals, Date.now());
  const before = fn(deals, ends[0] - DAY_MS);
  return {
    spark: ends.map((t) => fn(deals, t)),
    change: measure === 'winRate' ? now - before : percentChange(now, before),
  };
}

/** Count of timestamps falling on each day ending at `ends`. */
export function dailyCounts(times: number[], ends: number[]) {
  return ends.map((end) => times.filter((t) => t > end - DAY_MS && t <= end).length);
}
