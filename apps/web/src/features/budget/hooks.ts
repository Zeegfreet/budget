import { useBlocker } from '@tanstack/react-router'
import { useCallback, useMemo, useReducer } from 'react'
import {
  cellKey,
  changedEntries,
  draftReducer,
  isChanged,
  savedValues,
  valueOf,
  type Edits,
} from './draft'
import type { MonthlyEntry, Month } from './types'

/** Local, unsaved edits of the budget grid on top of the saved entries. */
export function useBudgetDraft(entries: MonthlyEntry[]) {
  const saved = useMemo(() => savedValues(entries), [entries])
  const [edits, dispatch] = useReducer(draftReducer, new Map() as Edits)

  return {
    dispatch,
    changes: useMemo(() => changedEntries(saved, edits), [saved, edits]),
    value: useCallback(
      (categoryId: number, month: Month) => valueOf(saved, edits, cellKey(categoryId, month)),
      [saved, edits],
    ),
    isChanged: useCallback(
      (categoryId: number, month: Month) => isChanged(saved, edits, cellKey(categoryId, month)),
      [saved, edits],
    ),
  }
}

export const UNSAVED_CHANGES_MESSAGE = 'Você tem alterações não salvas. Sair mesmo assim?'

/** Asks before leaving the page (in-app navigation or closing the tab) with unsaved changes. */
export function useUnsavedChangesGuard(dirty: boolean) {
  useBlocker({
    shouldBlockFn: () => !window.confirm(UNSAVED_CHANGES_MESSAGE),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  })
}
