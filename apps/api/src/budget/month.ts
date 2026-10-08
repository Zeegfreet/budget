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

/** Most occurrences one recurring launch may create. */
export const MAX_REPEAT_MONTHS = 60;

/** The month `count` months after `month` (negative goes back). */
export function addMonths(month: string, count: number): string {
  const [year, m] = month.split('-').map(Number);
  const total = year * 12 + (m - 1) + count;
  const next = (total % 12) + 1;
  return `${Math.floor(total / 12)}-${String(next).padStart(2, '0')}`;
}

/** The month of `now` (server's local time) as `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
