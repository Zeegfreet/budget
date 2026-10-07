import { describe, expect, it } from 'vitest'
import {
  cellKey,
  changedEntries,
  draftReducer,
  isChanged,
  groupValues,
  savedValues,
  valueOf,
  type Edits,
} from './draft'

const saved = savedValues([
  { categoryId: 1, month: '2026-10', amountCents: 1000 },
  { categoryId: 2, month: '2026-10', amountCents: 500 },
])
const none: Edits = new Map()

describe('budget draft', () => {
  it('reads edits over saved values, defaulting to zero', () => {
    const edits = draftReducer(none, { type: 'set', categoryId: 1, month: '2026-10', amountCents: 2000 })

    expect(valueOf(saved, edits, cellKey(1, '2026-10'))).toBe(2000)
    expect(valueOf(saved, edits, cellKey(2, '2026-10'))).toBe(500)
    expect(valueOf(saved, edits, cellKey(3, '2026-10'))).toBe(0)
  })

  it('does not mutate the previous state', () => {
    const edits = draftReducer(none, { type: 'set', categoryId: 1, month: '2026-10', amountCents: 1 })
    expect(none.size).toBe(0)
    expect(edits.size).toBe(1)
  })

  it('fills several months with one value', () => {
    const edits = draftReducer(none, {
      type: 'fill',
      categoryId: 3,
      months: ['2026-11', '2026-12'],
      amountCents: 700,
    })
    expect(changedEntries(saved, edits)).toEqual([
      { categoryId: 3, month: '2026-11', amountCents: 700 },
      { categoryId: 3, month: '2026-12', amountCents: 700 },
    ])
  })

  it('only reports real changes, with 0 clearing a saved cell', () => {
    let edits = draftReducer(none, { type: 'set', categoryId: 1, month: '2026-10', amountCents: 1000 })
    edits = draftReducer(edits, { type: 'set', categoryId: 2, month: '2026-10', amountCents: 0 })
    edits = draftReducer(edits, { type: 'set', categoryId: 3, month: '2026-10', amountCents: 0 })

    expect(isChanged(saved, edits, cellKey(1, '2026-10'))).toBe(false)
    expect(isChanged(saved, edits, cellKey(2, '2026-10'))).toBe(true)
    expect(isChanged(saved, edits, cellKey(3, '2026-10'))).toBe(false)
    expect(changedEntries(saved, edits)).toEqual([
      { categoryId: 2, month: '2026-10', amountCents: 0 },
    ])
  })

  it('discards every edit', () => {
    const edits = draftReducer(none, { type: 'set', categoryId: 1, month: '2026-10', amountCents: 5 })
    expect(draftReducer(edits, { type: 'discard' }).size).toBe(0)
  })

  it('forgets the edits of the given categories only', () => {
    let edits = draftReducer(none, { type: 'fill', categoryId: 1, months: ['2026-10', '2026-11'], amountCents: 5 })
    edits = draftReducer(edits, { type: 'set', categoryId: 12, month: '2026-10', amountCents: 7 })
    edits = draftReducer(edits, { type: 'set', categoryId: 2, month: '2026-10', amountCents: 9 })

    edits = draftReducer(edits, { type: 'forget', categoryIds: [1, 2] })

    expect([...edits.keys()]).toEqual([cellKey(12, '2026-10')])
  })
})

describe('groupValues', () => {
  it('keeps only the cells with group shares, apart from the personal amount', () => {
    const entries = [
      { categoryId: 1, month: '2026-10', amountCents: 5000, count: 1, groupCents: 1500 },
      { categoryId: 2, month: '2026-10', amountCents: 300, count: 1, groupCents: 0 },
      { categoryId: 3, month: '2026-10', amountCents: 300 },
    ]

    expect(groupValues(entries)).toEqual(new Map([['1:2026-10', 1500]]))
    expect(savedValues(entries).get('1:2026-10')).toBe(5000)
  })
})
