import type { BudgetLine, LineCellChange, Month } from './types'

/**
 * Unsaved edits of the budget grid, keyed by launch row and month. Saved
 * values come from the server; an edit equal to the saved value is not a change.
 */
export type Edits = ReadonlyMap<string, number>
export type SavedValues = ReadonlyMap<string, number>

export const cellKey = (anchorId: number, month: Month) => `${anchorId}:${month}`

export type DraftAction =
  | { type: 'set'; anchorId: number; month: Month; amountCents: number }
  | { type: 'fill'; anchorId: number; months: Month[]; amountCents: number }
  | { type: 'discard' }
  /** Drops the edits of rows that can no longer be saved (category inactivated or deleted) */
  | { type: 'forget'; anchorIds: number[] }

export function draftReducer(edits: Edits, action: DraftAction): Edits {
  switch (action.type) {
    case 'set':
      return new Map(edits).set(cellKey(action.anchorId, action.month), action.amountCents)
    case 'fill': {
      const next = new Map(edits)
      for (const month of action.months) {
        next.set(cellKey(action.anchorId, month), action.amountCents)
      }
      return next
    }
    case 'discard':
      return new Map()
    case 'forget': {
      const ids = new Set(action.anchorIds.map(String))
      return new Map([...edits].filter(([key]) => !ids.has(key.split(':')[0])))
    }
  }
}

/** Planned amount of each row and month that has a transaction */
export function savedValues(lines: BudgetLine[]): SavedValues {
  return new Map(lines.flatMap((l) => l.cells.map((c) => [cellKey(l.anchorId, c.month), c.plannedCents] as const)))
}

export function valueOf(saved: SavedValues, edits: Edits, key: string): number {
  return edits.get(key) ?? saved.get(key) ?? 0
}

export function isChanged(saved: SavedValues, edits: Edits, key: string): boolean {
  return edits.has(key) && edits.get(key) !== (saved.get(key) ?? 0)
}

/** Cells to send to `PUT /budget/lines` (only real changes; 0 deletes). */
export function changedCells(saved: SavedValues, edits: Edits): LineCellChange[] {
  return [...edits]
    .filter(([key]) => isChanged(saved, edits, key))
    .map(([key, amountCents]) => {
      const [anchorId, month] = key.split(':')
      return { anchorId: Number(anchorId), month, amountCents }
    })
}
