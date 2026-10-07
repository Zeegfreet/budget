import type { EntryKind } from '@/features/budget/types'
import type { Transaction } from './types'

/** The transactions of one type ("Despesas Básicas") within a section */
export interface StatementGroup {
  id: number
  name: string
  active: boolean
  transactions: Transaction[]
  /** Subtotal: realized amounts, or planned while pending */
  effectiveCents: number
}

export interface StatementSection {
  kind: EntryKind
  label: string
  transactions: Transaction[]
  /** The same transactions split by type, in the tree's order */
  groups: StatementGroup[]
  plannedCents: number
  /** Sum of the realized amounts of realized transactions */
  realizedCents: number
  /** Planned amount still pending */
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
 * Groups a section's transactions by type, keeping their order inside each type.
 * Types follow `groupOrder` (ids in the tree's order); unknown ones go last, as they appear.
 */
function groupByType(items: Transaction[], groupOrder: number[]): StatementGroup[] {
  const groups = new Map<number, StatementGroup>()
  for (const t of items) {
    const { id, name, active } = t.category.group
    let group = groups.get(id)
    if (!group) groups.set(id, (group = { id, name, active, transactions: [], effectiveCents: 0 }))
    group.transactions.push(t)
    group.effectiveCents += effectiveCents(t)
  }
  const rank = (id: number) => {
    const index = groupOrder.indexOf(id)
    return index === -1 ? groupOrder.length : index
  }
  // Array#sort is stable: types missing from `groupOrder` keep their order of appearance
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

/**
 * Splits a month's transactions by kind and then by type (keeping their order
 * inside each type) and totals them, in integer cents.
 */
export function buildStatement(transactions: Transaction[], groupOrder: number[] = []): Statement {
  const sections = SECTIONS.map(({ kind, label }): StatementSection => {
    const items = transactions.filter((t) => t.category.group.kind === kind)
    let plannedCents = 0
    let realizedCents = 0
    let pendingCents = 0
    for (const t of items) {
      plannedCents += t.plannedCents
      if (t.realizedCents === null) pendingCents += t.plannedCents
      else realizedCents += t.realizedCents
    }
    return {
      kind,
      label,
      transactions: items,
      groups: groupByType(items, groupOrder),
      plannedCents,
      realizedCents,
      pendingCents,
      effectiveCents: realizedCents + pendingCents,
    }
  })
  const [income, expense] = sections
  return { sections, balanceCents: income.effectiveCents - expense.effectiveCents }
}

/** Whether a change may also apply to later occurrences of its series */
export const hasFollowing = (t: Transaction) => t.series !== null && t.series.index < t.series.count

/** "Aluguel" or, without description, the category name */
export const transactionTitle = (t: Transaction) => t.description ?? t.category.name
