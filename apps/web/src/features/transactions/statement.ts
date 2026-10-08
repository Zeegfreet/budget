import type { EntryKind, GroupStatement, GroupStatementItem } from '@/features/budget/types'
import type { Transaction } from './types'

/** The user's share of a group transaction, counted in a personal category */
export interface StatementShare {
  group: { id: number; name: string }
  item: GroupStatementItem & { category: NonNullable<GroupStatementItem['category']> }
  /** Where the user pays their expense shares of the group (`null` for incomes or when unset) */
  paymentMethod: { id: number; name: string } | null
}

/** One row of a type: a personal transaction or a linked group share */
export type StatementItem =
  | { kind: 'transaction'; transaction: Transaction }
  | { kind: 'share'; share: StatementShare }

/** The transactions of one type ("Despesas Básicas") within a section */
export interface StatementGroup {
  id: number
  name: string
  active: boolean
  /** Its transactions, then the user's group shares linked to its categories (read-only here) */
  items: StatementItem[]
  /** Subtotal: realized amounts, or planned while pending */
  effectiveCents: number
}

export interface StatementSection {
  kind: EntryKind
  label: string
  transactions: Transaction[]
  shares: StatementShare[]
  /** The same transactions split by type, in the tree's order */
  groups: StatementGroup[]
  plannedCents: number
  /** Sum of the realized amounts of realized transactions (and of paid group shares) */
  realizedCents: number
  /** Planned amount still pending (unpaid group shares included) */
  pendingCents: number
  /** What counts in the balance: realized amounts, or planned while pending */
  effectiveCents: number
}

export interface Statement {
  /** Receitas first, then Despesas */
  sections: StatementSection[]
  /** Effective income − effective expenses */
  balanceCents: number
}

const SECTIONS: { kind: EntryKind; label: string }[] = [
  { kind: 'INCOME', label: 'Receitas' },
  { kind: 'EXPENSE', label: 'Despesas' },
]

/** The effective amount of one transaction */
export const effectiveCents = (t: Transaction) => t.realizedCents ?? t.plannedCents

/**
 * Groups a section's transactions (then its group shares) by type, keeping
 * their order inside each type. Types follow `groupOrder` (ids in the tree's
 * order); unknown ones go last, as they appear.
 */
function groupByType(items: Transaction[], shares: StatementShare[], groupOrder: number[]): StatementGroup[] {
  const groups = new Map<number, StatementGroup>()
  const of = ({ id, name, active }: { id: number; name: string; active: boolean }) => {
    let group = groups.get(id)
    if (!group) groups.set(id, (group = { id, name, active, items: [], effectiveCents: 0 }))
    return group
  }
  for (const t of items) {
    const group = of(t.category.group)
    group.items.push({ kind: 'transaction', transaction: t })
    group.effectiveCents += effectiveCents(t)
  }
  for (const share of shares) {
    const group = of(share.item.category.group)
    group.items.push({ kind: 'share', share })
    group.effectiveCents += share.item.shareCents
  }
  const rank = (id: number) => {
    const index = groupOrder.indexOf(id)
    return index === -1 ? groupOrder.length : index
  }
  // Array#sort is stable: types missing from `groupOrder` keep their order of appearance
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

/** The shares of `statements` that count in the budget (linked to a category) */
export function linkedShares(statements: GroupStatement[]): StatementShare[] {
  return statements.flatMap(({ group, link, items }) =>
    items.flatMap((item) => {
      if (!item.category) return []
      const method = item.kind === 'EXPENSE' ? link.paymentMethod : null
      return [
        {
          group,
          item: { ...item, category: item.category },
          paymentMethod: method && { id: method.id, name: method.name },
        },
      ]
    }),
  )
}

/**
 * Splits a month's transactions and linked group shares by kind and then by
 * type (keeping their order inside each type) and totals them, in integer
 * cents. A paid share counts as realized, an unpaid one as pending.
 */
export function buildStatement(
  transactions: Transaction[],
  groupOrder: number[] = [],
  groupStatements: GroupStatement[] = [],
): Statement {
  const allShares = linkedShares(groupStatements)
  const sections = SECTIONS.map(({ kind, label }): StatementSection => {
    const items = transactions.filter((t) => t.category.group.kind === kind)
    const shares = allShares.filter((s) => s.item.category.group.kind === kind)
    let plannedCents = 0
    let realizedCents = 0
    let pendingCents = 0
    for (const t of items) {
      plannedCents += t.plannedCents
      if (t.realizedCents === null) pendingCents += t.plannedCents
      else realizedCents += t.realizedCents
    }
    for (const { item } of shares) {
      plannedCents += item.shareCents
      if (item.paid) realizedCents += item.shareCents
      else pendingCents += item.shareCents
    }
    return {
      kind,
      label,
      transactions: items,
      shares,
      groups: groupByType(items, shares, groupOrder),
      plannedCents,
      realizedCents,
      pendingCents,
      effectiveCents: realizedCents + pendingCents,
    }
  })
  const [income, expense] = sections
  return { sections, balanceCents: income.effectiveCents - expense.effectiveCents }
}

/** Whether the item is done: a realized transaction or a share the user settled */
export const isItemDone = (item: StatementItem) =>
  item.kind === 'transaction' ? item.transaction.realizedCents !== null : item.share.item.paid

/** What the item counts in the balance */
export const itemCents = (item: StatementItem) =>
  item.kind === 'transaction' ? effectiveCents(item.transaction) : item.share.item.shareCents

/** Whether a change may also apply to later occurrences of its series */
export const hasFollowing = (t: Transaction) => t.series !== null && t.series.index < t.series.count

/** "Aluguel" or, without description, the category name */
export const transactionTitle = (t: Transaction) => t.description ?? t.category.name
