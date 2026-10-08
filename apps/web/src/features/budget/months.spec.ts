import { describe, expect, it } from 'vitest'
import {
  addMonths,
  currentMonth,
  endOfYear,
  formatMonthLabel,
  formatMonthLong,
  monthWindow,
} from './months'

describe('months', () => {
  it('takes the current month from the local date', () => {
    expect(currentMonth(new Date(2026, 9, 6))).toBe('2026-10')
    expect(currentMonth(new Date(2026, 0, 31, 23, 59))).toBe('2026-01')
  })

  it('adds months across years, both ways', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11')
    expect(addMonths('2026-10', 3)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', 24)).toBe('2028-10')
  })

  it('builds a window of consecutive months', () => {
    const window = monthWindow('2026-10', 12)
    expect(window).toHaveLength(12)
    expect(window[0]).toBe('2026-10')
    expect(window[2]).toBe('2026-12')
    expect(window[3]).toBe('2027-01')
    expect(window[11]).toBe('2027-09')
  })

  it('formats labels in Portuguese', () => {
    expect(formatMonthLabel('2026-10')).toBe('out/26')
    expect(formatMonthLabel('2027-01')).toBe('jan/27')
    expect(formatMonthLong('2026-03')).toBe('março de 2026')
  })

  it('finds December of the same year', () => {
    expect(endOfYear('2026-10')).toBe('2026-12')
    expect(endOfYear('2026-12')).toBe('2026-12')
  })
})
