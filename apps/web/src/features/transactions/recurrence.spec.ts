import { describe, expect, it } from 'vitest'
import type { SeriesPosition } from '@/features/budget/types'
import {
  adjustCents,
  describeAdjustment,
  EMPTY_RECURRENCE,
  parseRecurrence,
  projectAmounts,
  recurrenceRequest,
  resolveAdjustment,
  scopeNote,
  seriesToast,
} from './recurrence'

const yearly = { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' }
const series = (recurrence: SeriesPosition['recurrence']): SeriesPosition => ({
  index: 1,
  count: 24,
  firstMonth: '2026-10',
  lastMonth: '2028-09',
  recurrence,
})

describe('parseRecurrence', () => {
  it('is a single launch by default', () => {
    expect(parseRecurrence(EMPTY_RECURRENCE, '2026-10')).toEqual({
      values: { repeatMonths: 1, openEnded: false, adjustment: null },
      errors: {},
    })
  })

  it('reads a series of some months or an open-ended one', () => {
    expect(parseRecurrence({ ...EMPTY_RECURRENCE, mode: 'MONTHS', months: '6' }, '2026-10').values).toEqual({
      repeatMonths: 6,
      openEnded: false,
      adjustment: null,
    })
    expect(parseRecurrence({ ...EMPTY_RECURRENCE, mode: 'OPEN', months: 'x' }, '2026-10').values).toEqual({
      repeatMonths: 1,
      openEnded: true,
      adjustment: null,
    })
  })

  it('reads the adjustment in basis points', () => {
    const draft = { ...EMPTY_RECURRENCE, mode: 'OPEN' as const, adjust: true, percent: '4,5', every: '12' }
    expect(parseRecurrence(draft, '2026-10').values!.adjustment).toEqual({ percentBp: 450, everyMonths: 12 })
    expect(parseRecurrence({ ...draft, firstMonth: '2027-03' }, '2026-10').values!.adjustment).toEqual({
      percentBp: 450,
      everyMonths: 12,
      firstMonth: '2027-03',
    })
  })

  it('lists every invalid field', () => {
    expect(
      parseRecurrence(
        { mode: 'MONTHS', months: '1', adjust: true, percent: '101', every: '0', firstMonth: '2026-10' },
        '2026-10',
      ),
    ).toEqual({
      values: null,
      errors: {
        months: 'Informe de 2 a 60 meses.',
        percent: 'Informe um percentual entre 0,01 e 100.',
        every: 'Informe de 1 a 60 meses.',
        firstMonth: 'Escolha um mês depois de out/26.',
      },
    })
  })
})

describe('projectAmounts', () => {
  it('compounds at each anniversary after the base, rounding half up like the API', () => {
    expect(adjustCents(10, 500)).toBe(11)
    expect(
      projectAmounts(100_000, '2026-10', ['2027-02', '2027-03', '2028-03', '2029-05'], yearly),
    ).toEqual([100_000, 105_000, 110_250, 115_763])
    expect(projectAmounts(100, '2026-10', ['2030-01'], null)).toEqual([100])
  })

  it('defaults the first adjustment to a period after the start', () => {
    expect(resolveAdjustment({ percentBp: 500, everyMonths: 12 }, '2026-10')).toEqual({
      percentBp: 500,
      everyMonths: 12,
      firstMonth: '2027-10',
    })
  })
})

describe('texts', () => {
  it('describes the adjustment', () => {
    expect(describeAdjustment(yearly)).toBe('+5% a cada 12 meses, desde mar/27')
    expect(describeAdjustment({ percentBp: 125, everyMonths: 1, firstMonth: '2027-01' })).toBe(
      '+1,25% todo mês, desde jan/27',
    )
  })

  it('warns in the scope question only when it matters', () => {
    const open = series({ endMonth: null, adjustment: null })
    const adjusted = series({ endMonth: '2030-01', adjustment: yearly })
    expect(scopeNote(open, 'delete')).toMatch('encerra a recorrência')
    expect(scopeNote(adjusted, 'delete')).toBeUndefined()
    expect(scopeNote(adjusted, 'update', true)).toMatch('passa a ser aplicado sobre o novo valor')
    expect(scopeNote(adjusted, 'update', false)).toBeUndefined()
    expect(scopeNote(null, 'delete')).toBeUndefined()
  })

  it('names the change in the toast', () => {
    expect(seriesToast({ untilMonth: null }, 24)).toBe('Recorrência ajustada: sem data de término')
    expect(seriesToast({ untilMonth: '2027-01' }, 1)).toBe('Recorrência ajustada: 1 lançamento')
  })
})

describe('recurrenceRequest', () => {
  it('sends only what is set', () => {
    expect(recurrenceRequest({ repeatMonths: 1, openEnded: false, adjustment: null })).toEqual({})
    expect(
      recurrenceRequest({ repeatMonths: 1, openEnded: true, adjustment: { percentBp: 5, everyMonths: 1 } }),
    ).toEqual({ openEnded: true, adjustment: { percentBp: 5, everyMonths: 1 } })
    expect(recurrenceRequest({ repeatMonths: 3, openEnded: false, adjustment: null })).toEqual({ repeatMonths: 3 })
  })
})
