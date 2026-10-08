import { describe, expect, it } from 'vitest'
import { makeLine } from '@/test/budget'
import { cellKey, changedCells, draftReducer, isChanged, realizedKeys, savedValues, valueOf, type Edits } from './draft'

const saved = savedValues([
  makeLine(1, 10, [['2026-10', 1000]]),
  makeLine(2, 10, [['2026-10', 500]]),
])
const none: Edits = new Map()

describe('budget draft', () => {
  it('reads saved values per launch row and month', () => {
    expect([...saved]).toEqual([
      ['1:2026-10', 1000],
      ['2:2026-10', 500],
    ])
  })

  it('reads the realized amount of realized months', () => {
    const lines = [
      makeLine(1, 10, [
        ['2026-10', 1000, 1250],
        ['2026-11', 1000],
      ]),
    ]
    expect([...savedValues(lines)]).toEqual([
      ['1:2026-10', 1250],
      ['1:2026-11', 1000],
    ])
    expect([...realizedKeys(lines)]).toEqual(['1:2026-10'])
  })

  it('reads edits over saved values, defaulting to zero', () => {
    const edits = draftReducer(none, { type: 'set', anchorId: 1, month: '2026-10', amountCents: 2000 })

    expect(valueOf(saved, edits, cellKey(1, '2026-10'))).toBe(2000)
    expect(valueOf(saved, edits, cellKey(2, '2026-10'))).toBe(500)
    expect(valueOf(saved, edits, cellKey(3, '2026-10'))).toBe(0)
  })

  it('does not mutate the previous state', () => {
    const edits = draftReducer(none, { type: 'set', anchorId: 1, month: '2026-10', amountCents: 1 })
    expect(none.size).toBe(0)
    expect(edits.size).toBe(1)
  })

  it('fills several months of a row with one value', () => {
    const edits = draftReducer(none, {
      type: 'fill',
      anchorId: 3,
      months: ['2026-11', '2026-12'],
      amountCents: 700,
    })
    expect(changedCells(saved, edits)).toEqual([
      { anchorId: 3, month: '2026-11', amountCents: 700 },
      { anchorId: 3, month: '2026-12', amountCents: 700 },
    ])
  })

  it('only reports real changes, with 0 deleting a saved month', () => {
    let edits = draftReducer(none, { type: 'set', anchorId: 1, month: '2026-10', amountCents: 1000 })
    edits = draftReducer(edits, { type: 'set', anchorId: 2, month: '2026-10', amountCents: 0 })
    edits = draftReducer(edits, { type: 'set', anchorId: 3, month: '2026-10', amountCents: 0 })

    expect(isChanged(saved, edits, cellKey(1, '2026-10'))).toBe(false)
    expect(isChanged(saved, edits, cellKey(2, '2026-10'))).toBe(true)
    expect(isChanged(saved, edits, cellKey(3, '2026-10'))).toBe(false)
    expect(changedCells(saved, edits)).toEqual([{ anchorId: 2, month: '2026-10', amountCents: 0 }])
  })

  it('discards every edit', () => {
    const edits = draftReducer(none, { type: 'set', anchorId: 1, month: '2026-10', amountCents: 5 })
    expect(draftReducer(edits, { type: 'discard' }).size).toBe(0)
  })

  it('forgets the edits of the given rows only', () => {
    let edits = draftReducer(none, { type: 'fill', anchorId: 1, months: ['2026-10', '2026-11'], amountCents: 5 })
    edits = draftReducer(edits, { type: 'set', anchorId: 12, month: '2026-10', amountCents: 7 })
    edits = draftReducer(edits, { type: 'set', anchorId: 2, month: '2026-10', amountCents: 9 })

    edits = draftReducer(edits, { type: 'forget', anchorIds: [1, 2] })

    expect([...edits.keys()]).toEqual([cellKey(12, '2026-10')])
  })
})
