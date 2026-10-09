import type { TransactionInput, TransactionPatch } from '@/features/transactions/types'
import { draftReducer, type DraftAction, type Edits } from './draft'
import { addMonths } from './months'
import { lineTarget } from './rows'
import type {
  BudgetLine,
  CategoryGroup,
  CategoryPatch,
  EntryKind,
  GroupPatch,
  LineCellChange,
  Month,
  PlanRequest,
} from './types'
import { projectAmounts, resolveAdjustment } from '@/features/transactions/recurrence'

/**
 * Unsaved changes of the dashboard's planning table: the category tree, goals,
 * launches and the grid's values. Nothing reaches the API until the user saves
 * (`PUT /budget/plan`, all or nothing). Items created here get a negative id
 * (a "ref") until then.
 */

/** The payment method shown on a launch row */
export type LineMethod = BudgetLine['paymentMethod']

export interface CreatedGroup {
  ref: number
  kind: EntryKind
  name: string
  goalPercent: number | null
}

export interface CreatedCategory {
  ref: number
  /** An existing type, or the ref of a created one */
  groupId: number
  name: string
}

export interface CreatedLine {
  ref: number
  /** `categoryId` may be a ref */
  input: TransactionInput
  paymentMethod: LineMethod
}

/** A change of an existing launch from its first pending month on (`FOLLOWING`) */
export interface LineChange {
  transactionId: number
  month: Month
  patch: TransactionPatch
  /** Shown while `patch.paymentMethodId` is pending */
  paymentMethod?: LineMethod
}

/** An existing launch deleted from its first pending month on (`FOLLOWING`) */
export interface LineRemoval {
  transactionId: number
  month: Month
}

export interface Plan {
  /** The next ref to hand out (-1, -2, …) */
  nextRef: number
  createdGroups: CreatedGroup[]
  groupPatches: ReadonlyMap<number, GroupPatch>
  deletedGroups: ReadonlySet<number>
  createdCategories: CreatedCategory[]
  categoryPatches: ReadonlyMap<number, CategoryPatch>
  deletedCategories: ReadonlySet<number>
  createdLines: CreatedLine[]
  /** By the line's `anchorId` */
  lineChanges: ReadonlyMap<number, LineChange>
  lineRemovals: ReadonlyMap<number, LineRemoval>
  /** The grid's typed values */
  edits: Edits
}

/** What the server has: the saved tree and launch rows */
export interface PlanBase {
  groups: CategoryGroup[]
  lines: BudgetLine[]
}

export type PlanAction =
  | DraftAction
  | { type: 'create-group'; kind: EntryKind; name: string; goalPercent: number | null }
  | { type: 'update-group'; id: number; patch: GroupPatch }
  | { type: 'delete-group'; id: number }
  | { type: 'create-category'; groupId: number; name: string }
  | { type: 'update-category'; id: number; patch: CategoryPatch }
  | { type: 'delete-category'; id: number }
  | { type: 'create-line'; input: TransactionInput; paymentMethod: LineMethod }
  | { type: 'update-line'; anchorId: number; patch: TransactionPatch; paymentMethod?: LineMethod }
  | { type: 'delete-line'; anchorId: number }

/** Items created by the plan have negative ids until saved */
export const isUnsaved = (id: number) => id < 0

export const emptyPlan = (): Plan => ({
  nextRef: -1,
  createdGroups: [],
  groupPatches: new Map(),
  deletedGroups: new Set(),
  createdCategories: [],
  categoryPatches: new Map(),
  deletedCategories: new Set(),
  createdLines: [],
  lineChanges: new Map(),
  lineRemovals: new Map(),
  edits: new Map(),
})

const without = <K, V>(map: ReadonlyMap<K, V>, key: K) => {
  const next = new Map(map)
  next.delete(key)
  return next
}

/** The patch without the fields equal to the saved ones; `null` when nothing is left */
function pruned<T extends object>(patch: T, saved: Record<string, unknown>): T | null {
  const entries = Object.entries(patch).filter(([key, value]) => value !== undefined && value !== saved[key])
  return entries.length === 0 ? null : (Object.fromEntries(entries) as T)
}

const withPatch = <T extends object>(map: ReadonlyMap<number, T>, id: number, patch: T | null) =>
  patch ? new Map(map).set(id, patch) : without(map, id)

/** Drops the typed values of a row, from `fromMonth` on (every month without it) */
function dropEdits(edits: Edits, anchorId: number, fromMonth = ''): Edits {
  return new Map(
    [...edits].filter(([key]) => {
      const [id, month] = key.split(':')
      return Number(id) !== anchorId || month < fromMonth
    }),
  )
}

/** Forgets every change under these categories (they are being deleted) */
function dropCategories(plan: Plan, base: PlanBase, categoryIds: ReadonlySet<number>): Plan {
  const savedAnchors = base.lines.filter((l) => categoryIds.has(l.categoryId)).map((l) => l.anchorId)
  const moved = [...plan.lineChanges].filter(([, c]) => c.patch.categoryId !== undefined && categoryIds.has(c.patch.categoryId))
  const created = plan.createdLines.filter((l) => categoryIds.has(l.input.categoryId)).map((l) => l.ref)
  const anchors = new Set([...savedAnchors, ...moved.map(([anchorId]) => anchorId), ...created])
  let edits = plan.edits
  for (const anchorId of anchors) edits = dropEdits(edits, anchorId)
  return {
    ...plan,
    createdLines: plan.createdLines.filter((l) => !anchors.has(l.ref)),
    lineChanges: new Map([...plan.lineChanges].filter(([id]) => !anchors.has(id))),
    lineRemovals: new Map([...plan.lineRemovals].filter(([id]) => !anchors.has(id))),
    categoryPatches: new Map([...plan.categoryPatches].filter(([id]) => !categoryIds.has(id))),
    deletedCategories: new Set([...plan.deletedCategories].filter((id) => !categoryIds.has(id))),
    createdCategories: plan.createdCategories.filter((c) => !categoryIds.has(c.ref)),
    edits,
  }
}

function savedLine(base: PlanBase, anchorId: number): BudgetLine {
  const line = base.lines.find((l) => l.anchorId === anchorId)
  if (!line) throw new Error(`Unknown launch row ${anchorId}`)
  return line
}

/** A launch row's fields as a patch would compare them */
function lineFields(line: BudgetLine): Record<string, unknown> {
  return {
    categoryId: line.categoryId,
    description: line.description,
    dueDay: line.dueDay,
    paymentUrl: line.paymentUrl,
    paymentMethodId: line.paymentMethod?.id ?? null,
    plannedCents: lineTarget(line).plannedCents,
  }
}

export function planReducer(plan: Plan, action: PlanAction, base: PlanBase): Plan {
  switch (action.type) {
    case 'set':
    case 'fill':
      return { ...plan, edits: draftReducer(plan.edits, action) }
    case 'discard':
      return emptyPlan()

    case 'create-group': {
      const { kind, name, goalPercent } = action
      return {
        ...plan,
        nextRef: plan.nextRef - 1,
        createdGroups: [...plan.createdGroups, { ref: plan.nextRef, kind, name, goalPercent }],
      }
    }
    case 'update-group': {
      const { id, patch } = action
      if (isUnsaved(id)) {
        const { name, goalPercent } = patch
        return {
          ...plan,
          createdGroups: plan.createdGroups.map((g) =>
            g.ref === id
              ? { ...g, ...(name !== undefined && { name }), ...(goalPercent !== undefined && { goalPercent }) }
              : g,
          ),
        }
      }
      const saved = base.groups.find((g) => g.id === id)!
      const merged = { ...plan.groupPatches.get(id), ...patch }
      return { ...plan, groupPatches: withPatch(plan.groupPatches, id, pruned(merged, { ...saved })) }
    }
    case 'delete-group': {
      const { id } = action
      const categoryIds = new Set([
        ...(base.groups.find((g) => g.id === id)?.categories.map((c) => c.id) ?? []),
        ...plan.createdCategories.filter((c) => c.groupId === id).map((c) => c.ref),
      ])
      const next = dropCategories(plan, base, categoryIds)
      return isUnsaved(id)
        ? { ...next, createdGroups: next.createdGroups.filter((g) => g.ref !== id) }
        : {
            ...next,
            groupPatches: without(next.groupPatches, id),
            deletedGroups: new Set(next.deletedGroups).add(id),
          }
    }

    case 'create-category':
      return {
        ...plan,
        nextRef: plan.nextRef - 1,
        createdCategories: [
          ...plan.createdCategories,
          { ref: plan.nextRef, groupId: action.groupId, name: action.name },
        ],
      }
    case 'update-category': {
      const { id, patch } = action
      if (isUnsaved(id)) {
        const { name } = patch
        return {
          ...plan,
          createdCategories: plan.createdCategories.map((c) =>
            c.ref === id && name !== undefined ? { ...c, name } : c,
          ),
        }
      }
      const saved = base.groups.flatMap((g) => g.categories).find((c) => c.id === id)!
      const merged = { ...plan.categoryPatches.get(id), ...patch }
      return { ...plan, categoryPatches: withPatch(plan.categoryPatches, id, pruned(merged, { ...saved })) }
    }
    case 'delete-category': {
      const { id } = action
      const next = dropCategories(plan, base, new Set([id]))
      return isUnsaved(id) ? next : { ...next, deletedCategories: new Set(next.deletedCategories).add(id) }
    }

    case 'create-line':
      return {
        ...plan,
        nextRef: plan.nextRef - 1,
        createdLines: [
          ...plan.createdLines,
          { ref: plan.nextRef, input: action.input, paymentMethod: action.paymentMethod },
        ],
      }
    case 'update-line': {
      const { anchorId, patch, paymentMethod } = action
      if (isUnsaved(anchorId)) {
        const created = plan.createdLines.find((l) => l.ref === anchorId)!
        const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
        const changesAmount = patch.plannedCents !== undefined && patch.plannedCents !== created.input.plannedCents
        return {
          ...plan,
          createdLines: plan.createdLines.map((l) =>
            l.ref === anchorId
              ? {
                  ...l,
                  input: { ...l.input, ...defined },
                  ...(patch.paymentMethodId !== undefined && { paymentMethod: paymentMethod ?? null }),
                }
              : l,
          ),
          // The new amount replaces the typed values, like a saved launch's edit
          edits: changesAmount ? dropEdits(plan.edits, anchorId) : plan.edits,
        }
      }
      const saved = savedLine(base, anchorId)
      const { transactionId, month } = lineTarget(saved)
      const previous = plan.lineChanges.get(anchorId)
      const merged = pruned({ ...previous?.patch, ...patch }, lineFields(saved))
      const change: LineChange | null = merged && {
        transactionId,
        month,
        patch: merged,
        ...(merged.paymentMethodId !== undefined && {
          paymentMethod: patch.paymentMethodId !== undefined ? (paymentMethod ?? null) : previous?.paymentMethod,
        }),
      }
      return {
        ...plan,
        lineChanges: withPatch(plan.lineChanges, anchorId, change),
        edits: patch.plannedCents !== undefined ? dropEdits(plan.edits, anchorId, month) : plan.edits,
      }
    }
    case 'delete-line': {
      const { anchorId } = action
      if (isUnsaved(anchorId)) {
        return {
          ...plan,
          createdLines: plan.createdLines.filter((l) => l.ref !== anchorId),
          edits: dropEdits(plan.edits, anchorId),
        }
      }
      const { transactionId, month } = lineTarget(savedLine(base, anchorId))
      return {
        ...plan,
        lineChanges: without(plan.lineChanges, anchorId),
        lineRemovals: new Map(plan.lineRemovals).set(anchorId, { transactionId, month }),
        edits: dropEdits(plan.edits, anchorId, month),
      }
    }
  }
}

/** A launch created by the plan as a grid row: pending cells in the window from its month */
function createdRow({ ref, input, paymentMethod }: CreatedLine, months: Month[]): BudgetLine {
  // Exclusive end; an open-ended launch fills every month of the window from its start
  const end = input.openEnded ? null : addMonths(input.month, input.repeatMonths ?? 1)
  const shown = months.filter((m) => m >= input.month && (end === null || m < end))
  const adjustment = input.adjustment ? resolveAdjustment(input.adjustment, input.month) : null
  const amounts = projectAmounts(input.plannedCents, input.month, shown, adjustment)
  return {
    anchorId: ref,
    categoryId: input.categoryId,
    description: input.description ?? null,
    dueDay: input.dueDay ?? null,
    paymentUrl: input.paymentUrl ?? null,
    paymentMethod,
    cells: shown.map((month, i) => ({ month, transactionId: ref, plannedCents: amounts[i], realizedCents: null })),
  }
}

/** A saved row with its pending change: fields for the row, the amount from the change's month on */
function changedRow(line: BudgetLine, { month, patch, paymentMethod }: LineChange): BudgetLine {
  const { categoryId, description, dueDay, paymentUrl, paymentMethodId, plannedCents } = patch
  return {
    ...line,
    ...(categoryId !== undefined && { categoryId }),
    ...(description !== undefined && { description }),
    ...(dueDay !== undefined && { dueDay }),
    ...(paymentUrl !== undefined && { paymentUrl }),
    ...(paymentMethodId !== undefined && { paymentMethod: paymentMethod ?? null }),
    cells: line.cells.map((c) =>
      plannedCents !== undefined && c.realizedCents === null && c.month >= month ? { ...c, plannedCents } : c,
    ),
  }
}

/**
 * The tree and launch rows as they will be once the plan is saved, for the
 * grid, the goals and the cards. Realized months never change.
 */
export function applyPlan(base: PlanBase, plan: Plan, months: Month[]): PlanBase {
  const createdCategoriesOf = (groupId: number) =>
    plan.createdCategories
      .filter((c) => c.groupId === groupId)
      .map((c, i) => ({ id: c.ref, name: c.name, position: 1000 + i, active: true }))
  const deletedCategories = new Set([
    ...plan.deletedCategories,
    ...base.groups.filter((g) => plan.deletedGroups.has(g.id)).flatMap((g) => g.categories.map((c) => c.id)),
  ])

  const groups: CategoryGroup[] = [
    ...base.groups
      .filter((g) => !plan.deletedGroups.has(g.id))
      .map((g) => ({
        ...g,
        ...plan.groupPatches.get(g.id),
        categories: [
          ...g.categories
            .filter((c) => !deletedCategories.has(c.id))
            .map((c) => ({ ...c, ...plan.categoryPatches.get(c.id) })),
          ...createdCategoriesOf(g.id),
        ],
      })),
    ...plan.createdGroups.map((g, i) => ({
      id: g.ref,
      kind: g.kind,
      name: g.name,
      goalPercent: g.goalPercent,
      active: true,
      position: 1000 + i,
      categories: createdCategoriesOf(g.ref),
    })),
  ]

  const lines = [
    ...base.lines
      .filter((l) => !deletedCategories.has(l.categoryId))
      .flatMap((l) => {
        const change = plan.lineChanges.get(l.anchorId)
        const line = change ? changedRow(l, change) : l
        const removal = plan.lineRemovals.get(l.anchorId)
        if (!removal) return [line]
        // FOLLOWING deletes the pending occurrences from its month on
        const cells = line.cells.filter((c) => c.realizedCents !== null || c.month < removal.month)
        return cells.length > 0 ? [{ ...line, cells }] : []
      }),
    ...plan.createdLines.map((l) => createdRow(l, months)),
  ]

  return { groups, lines }
}

/** Structural changes waiting to be saved (the grid's values are counted apart) */
export function planChangeCount(plan: Plan): number {
  return (
    plan.createdGroups.length +
    plan.groupPatches.size +
    plan.deletedGroups.size +
    plan.createdCategories.length +
    plan.categoryPatches.size +
    plan.deletedCategories.size +
    plan.createdLines.length +
    plan.lineChanges.size +
    plan.lineRemovals.size
  )
}

/** Drops `null`/`undefined` fields: the API takes an absent optional field as "none" */
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T

/** Body of `PUT /budget/plan` (only the non-empty lists) */
export function planRequest(plan: Plan, cells: LineCellChange[]): PlanRequest {
  const request: PlanRequest = {
    createGroups: plan.createdGroups.map(({ ref, kind, name, goalPercent }) =>
      defined({ ref, kind, name, goalPercent: goalPercent ?? undefined }),
    ),
    updateGroups: [...plan.groupPatches].map(([id, patch]) => ({ id, ...patch })),
    deleteGroups: [...plan.deletedGroups],
    createCategories: plan.createdCategories.map(({ ref, groupId, name }) => ({ ref, groupId, name })),
    updateCategories: [...plan.categoryPatches].map(([id, patch]) => ({ id, ...patch })),
    deleteCategories: [...plan.deletedCategories],
    createLines: plan.createdLines.map(({ ref, input }) => defined({ ref, ...input })),
    updateLines: [...plan.lineChanges.values()].map(({ transactionId, patch }) => ({ transactionId, ...patch })),
    deleteLines: [...plan.lineRemovals.values()].map((r) => r.transactionId),
    cells,
  }
  return Object.fromEntries(
    Object.entries(request).filter(([, list]) => (list as unknown[]).length > 0),
  ) as PlanRequest
}

/** The plan has a pending change for this type, category or launch row (new ones included) */
export function isPendingItem(plan: Plan, level: 'group' | 'category' | 'line', id: number): boolean {
  if (isUnsaved(id)) return true
  switch (level) {
    case 'group':
      return plan.groupPatches.has(id)
    case 'category':
      return plan.categoryPatches.has(id)
    case 'line':
      return plan.lineChanges.has(id)
  }
}
