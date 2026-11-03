// Reports and filters count days in Indian time (the CRM's market), whatever
// the server's own clock zone is. REPORT_TZ_OFFSET_MINUTES overrides it.
export const tzOffsetMs = () => {
  const n = Number(process.env.REPORT_TZ_OFFSET_MINUTES);
  return (Number.isFinite(n) ? n : 330) * 60000;
};

/** The local calendar day ("2026-10-08") a moment falls on. */
export const localDay = (d: Date) => new Date(d.getTime() + tzOffsetMs()).toISOString().slice(0, 10);

/** Start of a local day (YYYY-MM-DD) as a UTC instant; `nextDay` gives the start of the day after. */
export const startOfLocalDay = (day: string, nextDay = false) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() - tzOffsetMs() + (nextDay ? 86400000 : 0));
