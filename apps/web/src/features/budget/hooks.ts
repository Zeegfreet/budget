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
import { cellKey, changedCells, draftReducer, isChanged, savedValues, valueOf, type Edits } from './draft'
import { categoryErrorMessage } from './errors'
import { budgetQueries } from './queries'
import type {
  BudgetLine,
  CategoryInput,
  CategoryPatch,
  GroupInput,
  GroupPatch,
  MonthlyEntry,
  Month,
} from './types'

/**
 * Local, unsaved edits of the grid's launch rows on top of the saved values,
 * plus the user's group shares per category (read-only).
 */
export function useBudgetDraft(lines: BudgetLine[], entries: MonthlyEntry[]) {
  const saved = useMemo(() => savedValues(lines), [lines])
  const shares = useMemo(
    () => new Map(entries.filter((e) => e.groupCents > 0).map((e) => [cellKey(e.categoryId, e.month), e.groupCents])),
    [entries],
  )
  const [edits, dispatch] = useReducer(draftReducer, new Map() as Edits)

  return {
    dispatch,
    changes: useMemo(() => changedCells(saved, edits), [saved, edits]),
    /** What a row shows in a month (edited or saved) */
    value: useCallback(
      (anchorId: number, month: Month) => valueOf(saved, edits, cellKey(anchorId, month)),
      [saved, edits],
    ),
    /** The saved value, ignoring edits */
    savedValue: useCallback((anchorId: number, month: Month) => saved.get(cellKey(anchorId, month)) ?? 0, [saved]),
    isChanged: useCallback(
      (anchorId: number, month: Month) => isChanged(saved, edits, cellKey(anchorId, month)),
      [saved, edits],
    ),
    /** The user's shares of linked groups in the category and month */
    groupShare: useCallback(
      (categoryId: number, month: Month) => shares.get(cellKey(categoryId, month)) ?? 0,
      [shares],
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

/**
 * Inactivating or reactivating a type or category from a menu, with a toast
 * for the outcome (errors included, as there is no form to show them).
 */
export function useCategoryToggle(actions: ReturnType<typeof useCategoryActions>) {
  async function run(change: () => Promise<void>, active: boolean, name: string) {
    try {
      await change()
      toast.success(active ? `${name} reativado(a)` : `${name} inativado(a)`)
    } catch (error) {
      toast.error(categoryErrorMessage(error, 'Não foi possível alterar.'))
    }
  }
  return {
    toggleGroup(group: { id: number; name: string; active: boolean; categories: { id: number }[] }) {
      const active = !group.active
      const ids = group.categories.map((c) => c.id)
      return run(() => actions.updateGroup(group.id, { active }, ids), active, group.name)
    },
    toggleCategory(category: { id: number; name: string; active: boolean }) {
      const active = !category.active
      return run(() => actions.updateCategory(category.id, { active }), active, category.name)
    },
  }
}
