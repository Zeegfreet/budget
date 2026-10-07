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
