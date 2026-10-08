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
  updateInitialBalance,
} from './api'
import type { TransactionInput, TransactionPatch } from '@/features/transactions/types'
import { ApiError } from '@/lib/api/client'
import { cellKey, changedCells, isChanged, realizedKeys, savedValues, valueOf } from './draft'
import { categoryErrorMessage } from './errors'
import {
  applyPlan,
  emptyPlan,
  isPendingItem,
  planChangeCount,
  planReducer,
  planRequest,
  type LineMethod,
  type Plan,
  type PlanAction,
  type PlanBase,
} from './plan'
import { budgetQueries } from './queries'
import type {
  BudgetLine,
  CategoryGroup,
  CategoryInput,
  CategoryPatch,
  GroupInput,
  GroupPatch,
  MonthlyEntry,
  Month,
} from './types'

/**
 * The dashboard's planning table while it is edited: the plan (tree, goals,
 * launches and typed values, see `plan.ts`) on top of the saved data, plus the
 * user's group shares per category (read-only). `base` must be memoized.
 */
export function useBudgetPlan(base: PlanBase, entries: MonthlyEntry[], months: Month[]) {
  const [plan, dispatch] = useReducer(
    (current: Plan, action: PlanAction) => planReducer(current, action, base),
    undefined,
    emptyPlan,
  )
  const projected = useMemo(() => applyPlan(base, plan, months), [base, plan, months])
  // Typed values compare with the plan's rows: an edit equal to what the plan
  // already sets (e.g. a new launch's amount) isn't a change
  const saved = useMemo(() => savedValues(projected.lines), [projected.lines])
  const stored = useMemo(() => savedValues(base.lines), [base.lines])
  const realized = useMemo(() => realizedKeys(projected.lines), [projected.lines])
  const shares = useMemo(
    () => new Map(entries.filter((e) => e.groupCents > 0).map((e) => [cellKey(e.categoryId, e.month), e.groupCents])),
    [entries],
  )
  const changes = useMemo(() => changedCells(saved, plan.edits), [saved, plan.edits])

  return {
    plan,
    dispatch,
    /** The tree and launch rows with the plan applied */
    groups: projected.groups,
    lines: projected.lines,
    /** Everything waiting for "Salvar": structural changes plus changed values */
    count: changes.length + planChangeCount(plan),
    /** Body of `PUT /budget/plan` */
    request: () => planRequest(plan, changes),
    /** What a row shows in a month (typed, or as the plan leaves it) */
    value: useCallback(
      (anchorId: number, month: Month) => valueOf(saved, plan.edits, cellKey(anchorId, month)),
      [saved, plan.edits],
    ),
    /** The row's transaction in the month is realized (shown, not editable) */
    isRealized: useCallback((anchorId: number, month: Month) => realized.has(cellKey(anchorId, month)), [realized]),
    /** The value stored on the server, ignoring the plan */
    savedValue: useCallback((anchorId: number, month: Month) => stored.get(cellKey(anchorId, month)) ?? 0, [stored]),
    isChanged: useCallback(
      (anchorId: number, month: Month) => isChanged(saved, plan.edits, cellKey(anchorId, month)),
      [saved, plan.edits],
    ),
    /** A type, category or launch row is new or changed in the plan */
    isPending: useCallback(
      (level: 'group' | 'category' | 'line', id: number) => isPendingItem(plan, level, id),
      [plan],
    ),
    /** The user's shares of linked groups in the category and month */
    groupShare: useCallback(
      (categoryId: number, month: Month) => shares.get(cellKey(categoryId, month)) ?? 0,
      [shares],
    ),
  }
}

/**
 * Saves the initial balance; it opens every month, so every summary is
 * refreshed. Rejects with the API error for the form to show it.
 */
export function useInitialBalance() {
  const queryClient = useQueryClient()
  return async (cents: number) => {
    await updateInitialBalance(cents)
    await queryClient.invalidateQueries({ queryKey: [...budgetQueries.all(), 'summary'] })
    toast.success('Saldo inicial salvo')
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
 * Changes to the category tree, saved right away (`useCategoryActions`) or
 * kept in the dashboard's plan (`usePlanCategoryActions`). Each rejects with
 * an `ApiError` for forms to show it.
 */
export interface CategoryActions {
  createGroup(input: GroupInput): Promise<void>
  updateGroup(id: number, patch: GroupPatch): Promise<void>
  deleteGroup(id: number): Promise<void>
  createCategory(groupId: number, input: CategoryInput): Promise<void>
  updateCategory(id: number, patch: CategoryPatch): Promise<void>
  deleteCategory(id: number): Promise<void>
}

/** Changes to the category tree saved right away; each resolves once the data is fresh again. */
export function useCategoryActions(): CategoryActions {
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
    async updateGroup(id: number, patch: GroupPatch) {
      await updateGroup(id, patch)
      await refresh()
    },
    async deleteGroup(id: number) {
      await deleteGroup(id)
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
      await refresh()
    },
    async deleteCategory(id: number) {
      await deleteCategory(id)
      await refresh(true)
      toast.success('Categoria excluída')
    },
  }
}

/**
 * Inactivating or reactivating a type or category from a menu, with a toast
 * for the outcome (errors included, as there is no form to show them).
 */
export function useCategoryToggle(actions: CategoryActions) {
  async function run(change: () => Promise<void>, active: boolean, name: string) {
    try {
      await change()
      toast.success(active ? `${name} reativado(a)` : `${name} inativado(a)`)
    } catch (error) {
      toast.error(categoryErrorMessage(error, 'Não foi possível alterar.'))
    }
  }
  return {
    toggleGroup(group: { id: number; name: string; active: boolean }) {
      const active = !group.active
      return run(() => actions.updateGroup(group.id, { active }), active, group.name)
    },
    toggleCategory(category: { id: number; name: string; active: boolean }) {
      const active = !category.active
      return run(() => actions.updateCategory(category.id, { active }), active, category.name)
    },
  }
}

/** The API's answer to a duplicate name, so forms show the same message */
const duplicateName = () => new ApiError(409, ['An item with this name already exists'])

const sameName = (a: string, b: string) => a.trim() === b.trim()

/**
 * The category tree's changes kept in the dashboard's plan (nothing is saved
 * until "Salvar"). `groups` is the planned tree, to reject a duplicate name
 * right away, like the API would.
 */
export function usePlanCategoryActions(
  groups: CategoryGroup[],
  dispatch: (action: PlanAction) => void,
): CategoryActions {
  const groupOf = (categoryId: number) => groups.find((g) => g.categories.some((c) => c.id === categoryId))
  return {
    async createGroup({ kind, name, goalPercent = null }) {
      if (groups.some((g) => g.kind === kind && sameName(g.name, name))) throw duplicateName()
      dispatch({ type: 'create-group', kind, name: name.trim(), goalPercent })
    },
    async updateGroup(id, patch) {
      const kind = groups.find((g) => g.id === id)?.kind
      const { name } = patch
      if (name !== undefined && groups.some((g) => g.id !== id && g.kind === kind && sameName(g.name, name))) {
        throw duplicateName()
      }
      dispatch({ type: 'update-group', id, patch: name !== undefined ? { ...patch, name: name.trim() } : patch })
    },
    async deleteGroup(id) {
      dispatch({ type: 'delete-group', id })
    },
    async createCategory(groupId, { name }) {
      const group = groups.find((g) => g.id === groupId)
      if (group?.categories.some((c) => sameName(c.name, name))) throw duplicateName()
      dispatch({ type: 'create-category', groupId, name: name.trim() })
    },
    async updateCategory(id, patch) {
      const { name } = patch
      if (name !== undefined && groupOf(id)?.categories.some((c) => c.id !== id && sameName(c.name, name))) {
        throw duplicateName()
      }
      dispatch({ type: 'update-category', id, patch: name !== undefined ? { ...patch, name: name.trim() } : patch })
    },
    async deleteCategory(id) {
      dispatch({ type: 'delete-category', id })
    },
  }
}

/** Launches of the dashboard grid; `paymentMethod` is shown on the row until saved */
export interface LineActions {
  create(input: TransactionInput, paymentMethod: LineMethod): Promise<void>
  /** From the row's first pending month on */
  update(line: BudgetLine, patch: TransactionPatch, paymentMethod?: LineMethod): Promise<void>
  /** From the row's first pending month on; realized months stay */
  remove(line: BudgetLine): Promise<void>
}

/** The grid's launches kept in the dashboard's plan (nothing is saved until "Salvar") */
export function usePlanLineActions(dispatch: (action: PlanAction) => void): LineActions {
  return {
    async create(input, paymentMethod) {
      dispatch({ type: 'create-line', input, paymentMethod })
    },
    async update(line, patch, paymentMethod) {
      dispatch({ type: 'update-line', anchorId: line.anchorId, patch, paymentMethod })
    },
    async remove(line) {
      dispatch({ type: 'delete-line', anchorId: line.anchorId })
    },
  }
}
