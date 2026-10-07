import { useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useMemo, useReducer } from 'react'
import { toast } from 'sonner'
import {
  createCategory,
  createGroup,
  deleteCategory,
  deleteGroup,
  updateCategory,
  updateGroup,
} from './api'
import {
  cellKey,
  changedEntries,
  draftReducer,
  isChanged,
  savedValues,
  valueOf,
  type Edits,
} from './draft'
import { budgetQueries } from './queries'
import type { CategoryInput, CategoryPatch, GroupInput, GroupPatch, MonthlyEntry, Month } from './types'

/** Local, unsaved edits of the budget grid on top of the saved entries. */
export function useBudgetDraft(entries: MonthlyEntry[]) {
  const saved = useMemo(() => savedValues(entries), [entries])
  const locked = useMemo(
    () => new Set(entries.filter((e) => (e.count ?? 1) > 1).map((e) => cellKey(e.categoryId, e.month))),
    [entries],
  )
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
    /** The saved value, ignoring edits */
    savedValue: useCallback(
      (categoryId: number, month: Month) => saved.get(cellKey(categoryId, month)) ?? 0,
      [saved],
    ),
    /** The cell holds several transactions: read-only here, edited in the statement */
    isLocked: useCallback(
      (categoryId: number, month: Month) => locked.has(cellKey(categoryId, month)),
      [locked],
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

/**
 * Changes to the category tree. Each resolves once the data is fresh again and
 * rejects with the API error, for forms to show it. `forget` receives the
 * categories that can no longer take values, to drop their unsaved edits.
 */
export function useCategoryActions(forget: (categoryIds: number[]) => void) {
  const queryClient = useQueryClient()
  // Deleting changes entries and the summary too; the rest only the tree
  const refresh = (everything = false) =>
    queryClient.invalidateQueries({
      queryKey: everything ? budgetQueries.all() : budgetQueries.categories().queryKey,
    })

  return {
    async createGroup(input: GroupInput) {
      await createGroup(input)
      await refresh()
      toast.success('Tipo criado')
    },
    async updateGroup(id: number, patch: GroupPatch, categoryIds: number[] = []) {
      await updateGroup(id, patch)
      if (patch.active === false) forget(categoryIds)
      await refresh()
    },
    async deleteGroup(id: number, categoryIds: number[]) {
      await deleteGroup(id)
      forget(categoryIds)
      await refresh(true)
      toast.success('Tipo excluído')
    },
    async createCategory(groupId: number, input: CategoryInput) {
      await createCategory(groupId, input)
      await refresh()
      toast.success('Categoria criada')
    },
    async updateCategory(id: number, patch: CategoryPatch) {
      await updateCategory(id, patch)
      if (patch.active === false) forget([id])
      await refresh()
    },
    async deleteCategory(id: number) {
      await deleteCategory(id)
      forget([id])
      await refresh(true)
      toast.success('Categoria excluída')
    },
  }
}
