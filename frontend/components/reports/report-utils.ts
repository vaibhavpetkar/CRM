// Helpers shared by the report wizard steps.

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

export const formatDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// Local-time YYYY-MM-DD (toISOString would shift the day for users ahead of UTC).
export const toDayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const dateInputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

type MonthRow = { month: string; revenue: number; expenses: number; net: number };

/**
 * The P&L report only returns months that had activity; fill the gaps with
 * zeros from `startDate` up to `endDate` (or this month, if sooner) so the
 * charts show every month of the period.
 */
export function fillMonths(rows: MonthRow[], startDate: string, endDate: string): MonthRow[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const last = endDate.slice(0, 7) < thisMonth ? endDate.slice(0, 7) : thisMonth;
  const out: MonthRow[] = [];
  let [y, m] = startDate.slice(0, 7).split('-').map(Number);
  for (let guard = 0; guard < 120; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    out.push(byMonth.get(key) || { month: key, revenue: 0, expenses: 0, net: 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  // Keep any months the server sent outside that window.
  rows.forEach((r) => !out.some((o) => o.month === r.month) && out.push(r));
  return out.sort((a, b) => a.month.localeCompare(b.month));
}
