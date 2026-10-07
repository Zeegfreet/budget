import type { MonthlyEntry, Month } from './types'

/**
 * Unsaved edits of the budget grid, keyed by cell. Saved values come from the
 * server; an edit equal to the saved value is not a change.
 */
export type Edits = ReadonlyMap<string, number>
export type SavedValues = ReadonlyMap<string, number>

export const cellKey = (categoryId: number, month: Month) => `${categoryId}:${month}`

export type DraftAction =
  | { type: 'set'; categoryId: number; month: Month; amountCents: number }
  | { type: 'fill'; categoryId: number; months: Month[]; amountCents: number }
  | { type: 'discard' }
  /** Drops the edits of categories that can no longer be saved (deleted or inactivated) */
  | { type: 'forget'; categoryIds: number[] }

export function draftReducer(edits: Edits, action: DraftAction): Edits {
  switch (action.type) {
    case 'set':
      return new Map(edits).set(cellKey(action.categoryId, action.month), action.amountCents)
    case 'fill': {
      const next = new Map(edits)
      for (const month of action.months) {
        next.set(cellKey(action.categoryId, month), action.amountCents)
      }
      return next
    }
    case 'discard':
      return new Map()
    case 'forget': {
      const ids = new Set(action.categoryIds.map(String))
      return new Map([...edits].filter(([key]) => !ids.has(key.split(':')[0])))
    }
  }
}

export function savedValues(entries: MonthlyEntry[]): SavedValues {
  return new Map(entries.map((e) => [cellKey(e.categoryId, e.month), e.amountCents]))
}

/** The user's group shares per cell (read-only part of the shown value) */
export function groupValues(entries: MonthlyEntry[]): SavedValues {
  return new Map(
    entries.filter((e) => (e.groupCents ?? 0) > 0).map((e) => [cellKey(e.categoryId, e.month), e.groupCents ?? 0]),
  )
}

export function valueOf(saved: SavedValues, edits: Edits, key: string): number {
  return edits.get(key) ?? saved.get(key) ?? 0
}

export function isChanged(saved: SavedValues, edits: Edits, key: string): boolean {
  return edits.has(key) && edits.get(key) !== (saved.get(key) ?? 0)
}

/** Cells to send to `PUT /budget/entries` (only real changes; 0 clears). */
export function changedEntries(saved: SavedValues, edits: Edits): MonthlyEntry[] {
  return [...edits]
    .filter(([key]) => isChanged(saved, edits, key))
    .map(([key, amountCents]) => {
      const [categoryId, month] = key.split(':')
      return { categoryId: Number(categoryId), month, amountCents }
    })
}
