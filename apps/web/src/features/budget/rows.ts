import type { CategoryGroup, EntryKind, Month } from './types'

export interface CategoryRow {
  id: number
  name: string
  values: number[]
}

export interface GroupRow {
  id: number
  name: string
  totals: number[]
  categories: CategoryRow[]
}

export interface Section {
  kind: EntryKind
  label: string
  totals: number[]
  groups: GroupRow[]
}

export interface BudgetTable {
  /** Despesas first, then Receitas */
  sections: Section[]
  incomes: number[]
  expenses: number[]
  /** Income − expenses per month */
  balances: number[]
  /** Projected balance at the end of each month, starting from `openingCents` */
  accumulated: number[]
}

const SECTIONS: { kind: EntryKind; label: string }[] = [
  { kind: 'EXPENSE', label: 'Despesas' },
  { kind: 'INCOME', label: 'Receitas' },
]

const sumColumns = (rows: number[][], width: number) =>
  Array.from({ length: width }, (_, i) => rows.reduce((sum, row) => sum + row[i], 0))

/** Builds the pivot table (all integer cents) from the category tree and cell values. */
export function buildBudgetTable(
  groups: CategoryGroup[],
  months: Month[],
  value: (categoryId: number, month: Month) => number,
  openingCents: number,
): BudgetTable {
  const sections = SECTIONS.map(({ kind, label }): Section => {
    const groupRows = groups
      .filter((g) => g.kind === kind)
      .map((g): GroupRow => {
        const categories = g.categories.map((c) => ({
          id: c.id,
          name: c.name,
          values: months.map((m) => value(c.id, m)),
        }))
        return {
          id: g.id,
          name: g.name,
          categories,
          totals: sumColumns(categories.map((c) => c.values), months.length),
        }
      })
    return {
      kind,
      label,
      groups: groupRows,
      totals: sumColumns(groupRows.map((g) => g.totals), months.length),
    }
  })

  const totalsOf = (kind: EntryKind) => sections.find((s) => s.kind === kind)!.totals
  const incomes = totalsOf('INCOME')
  const expenses = totalsOf('EXPENSE')
  const balances = months.map((_, i) => incomes[i] - expenses[i])
  let running = openingCents
  const accumulated = balances.map((b) => (running += b))

  return { sections, incomes, expenses, balances, accumulated }
}
