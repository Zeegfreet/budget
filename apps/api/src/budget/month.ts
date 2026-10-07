/** A calendar month as `YYYY-MM`; string order is chronological order. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Longest range `GET /budget/entries` serves, in months (inclusive). */
export const MAX_MONTH_SPAN = 24;

/** Number of months from `from` to `to`, inclusive ("2026-10".."2027-09" → 12). */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
