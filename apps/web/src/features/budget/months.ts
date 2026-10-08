import type { Month } from './types'

const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function parts(month: Month): [year: number, monthIndex: number] {
  const [year, m] = month.split('-').map(Number)
  return [year, m - 1]
}

function toMonth(year: number, monthIndex: number): Month {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** The month of `date` in the browser's time zone */
export function currentMonth(date = new Date()): Month {
  return toMonth(date.getFullYear(), date.getMonth())
}

export function addMonths(month: Month, count: number): Month {
  const [year, index] = parts(month)
  const total = year * 12 + index + count
  return toMonth(Math.floor(total / 12), total % 12)
}

/** `count` consecutive months starting at `start` */
export function monthWindow(start: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i))
}

/** "2026-10" → "out/26" */
export function formatMonthLabel(month: Month): string {
  const [year, index] = parts(month)
  return `${SHORT[index]}/${String(year).slice(-2)}`
}

/** "2026-10" → "outubro de 2026" */
export function formatMonthLong(month: Month): string {
  const [year, index] = parts(month)
  return `${LONG[index]} de ${year}`
}

/** December of the same year */
export function endOfYear(month: Month): Month {
  return toMonth(parts(month)[0], 11)
}

/** Months from `from` to `to`, both included ("2026-10".."2027-09" → 12) */
export function monthSpan(from: Month, to: Month): number {
  const [fy, fi] = parts(from)
  const [ty, ti] = parts(to)
  return (ty - fy) * 12 + (ti - fi) + 1
}

/** Longest period the dashboard asks for; mirrors the API's `MAX_MONTH_SPAN` */
export const MAX_RANGE_MONTHS = 24

/** Months the dashboard shows when no period is chosen */
export const DEFAULT_RANGE_MONTHS = 12

export interface MonthRange {
  from: Month
  to: Month
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** The current month and the 11 after it */
export function defaultRange(today = currentMonth()): MonthRange {
  return { from: today, to: addMonths(today, DEFAULT_RANGE_MONTHS - 1) }
}

/** The period of the URL, or the default one when it's missing, malformed, inverted or too long */
export function parseRange(search: { from?: unknown; to?: unknown }): MonthRange {
  const { from, to } = search
  if (typeof from !== 'string' || typeof to !== 'string' || !MONTH.test(from) || !MONTH.test(to)) {
    return defaultRange()
  }
  const span = monthSpan(from, to)
  return span >= 1 && span <= MAX_RANGE_MONTHS ? { from, to } : defaultRange()
}

/** Every month from `from` to `to`, both included */
export function monthsBetween(from: Month, to: Month): Month[] {
  return monthWindow(from, Math.max(monthSpan(from, to), 0))
}

/** The two months as a period, earliest first */
export function orderedRange(a: Month, b: Month): MonthRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

/** Whether `start` and `month` (either way) fit in one period of up to `MAX_RANGE_MONTHS` */
export function isWithinReach(start: Month, month: Month): boolean {
  const { from, to } = orderedRange(start, month)
  return monthSpan(from, to) <= MAX_RANGE_MONTHS
}

/** January to December of `year` */
export function yearMonths(year: number): Month[] {
  return monthWindow(toMonth(year, 0), 12)
}

/** The `count` months ending at the current one */
export function lastMonths(count: number, today = currentMonth()): MonthRange {
  return { from: addMonths(today, 1 - count), to: today }
}

/** January to December of the year of `month` */
export function yearRange(month = currentMonth()): MonthRange {
  const [year] = parts(month)
  return { from: toMonth(year, 0), to: toMonth(year, 11) }
}

/** The year of a month */
export function yearOf(month: Month): number {
  return parts(month)[0]
}
