import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addMonths,
  currentMonth,
  defaultRange,
  endOfYear,
  formatMonthLabel,
  formatMonthLong,
  isWithinReach,
  lastMonths,
  monthsBetween,
  monthWindow,
  orderedRange,
  parseRange,
  yearMonths,
  yearOf,
  yearRange,
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

  describe('period', () => {
    afterEach(() => vi.useRealTimers())

    it('defaults to the current month and the 11 after it', () => {
      expect(defaultRange('2026-10')).toEqual({ from: '2026-10', to: '2027-09' })
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
      expect(defaultRange()).toEqual({ from: '2026-10', to: '2027-09' })
    })

    it('keeps a valid period of up to 24 months', () => {
      expect(parseRange({ from: '2026-01', to: '2026-01' })).toEqual({ from: '2026-01', to: '2026-01' })
      expect(parseRange({ from: '2025-10', to: '2027-09' })).toEqual({ from: '2025-10', to: '2027-09' })
    })

    it('falls back to the default period otherwise', () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
      const standard = { from: '2026-10', to: '2027-09' }
      expect(parseRange({})).toEqual(standard)
      expect(parseRange({ from: '2026-01' })).toEqual(standard)
      expect(parseRange({ from: '2026-13', to: '2027-01' })).toEqual(standard)
      expect(parseRange({ from: 202601, to: '2027-01' })).toEqual(standard)
      // Inverted, or longer than the API answers
      expect(parseRange({ from: '2027-01', to: '2026-12' })).toEqual(standard)
      expect(parseRange({ from: '2025-10', to: '2027-10' })).toEqual(standard)
    })

    it('lists every month of a period', () => {
      expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
      expect(monthsBetween('2026-10', '2026-10')).toEqual(['2026-10'])
      expect(monthsBetween('2026-10', '2026-09')).toEqual([])
    })
  })

  describe('period picking', () => {
    it('orders two months as a period', () => {
      expect(orderedRange('2026-10', '2027-03')).toEqual({ from: '2026-10', to: '2027-03' })
      expect(orderedRange('2027-03', '2026-10')).toEqual({ from: '2026-10', to: '2027-03' })
      expect(orderedRange('2026-10', '2026-10')).toEqual({ from: '2026-10', to: '2026-10' })
    })

    it('reaches up to 24 months either way', () => {
      expect(isWithinReach('2026-10', '2028-09')).toBe(true)
      expect(isWithinReach('2026-10', '2028-10')).toBe(false)
      expect(isWithinReach('2026-10', '2024-11')).toBe(true)
      expect(isWithinReach('2026-10', '2024-10')).toBe(false)
    })

    it('lists a year and builds the shortcuts', () => {
      expect(yearMonths(2027)).toEqual(monthWindow('2027-01', 12))
      expect(lastMonths(12, '2026-10')).toEqual({ from: '2025-11', to: '2026-10' })
      expect(yearRange('2026-10')).toEqual({ from: '2026-01', to: '2026-12' })
      expect(yearOf('2026-10')).toBe(2026)
    })
  })
})
