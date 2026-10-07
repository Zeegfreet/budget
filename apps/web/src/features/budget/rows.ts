import type { CategoryGroup, EntryKind, Month } from './types'

export interface CategoryRow {
  id: number
  name: string
  description: string | null
  dueDay: number | null
  active: boolean
  /** Takes values: the category and its type are active */
  editable: boolean
  values: number[]
  /** Sum of every month in the window */
  total: number
}

export interface GroupRow {
  id: number
  kind: EntryKind
  name: string
  active: boolean
  goalPercent: number | null
  totals: number[]
  total: number
  categories: CategoryRow[]
}

export interface Section {
  kind: EntryKind
  label: string
  totals: number[]
  total: number
  groups: GroupRow[]
}

export interface BudgetTable {
  /** Despesas first, then Receitas. Inactive rows are included (they still count). */
  sections: Section[]
  incomes: number[]
  expenses: number[]
  /** Income − expenses per month */
  balances: number[]
  /** Projected balance at the end of each month, starting from `openingCents` */
  accumulated: number[]
  incomeTotal: number
  expenseTotal: number
  /** Income − expenses of the whole window */
  balanceTotal: number
  /** Projected balance at the end of the window */
  accumulatedTotal: number
}

const SECTIONS: { kind: EntryKind; label: string }[] = [
  { kind: 'EXPENSE', label: 'Despesas' },
  { kind: 'INCOME', label: 'Receitas' },
]

const sumColumns = (rows: number[][], width: number) =>
  Array.from({ length: width }, (_, i) => rows.reduce((sum, row) => sum + row[i], 0))

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0)

/**
 * Builds the pivot table (all integer cents) from the category tree and cell
 * values. Inactive types and categories stay in the totals (their history is
 * kept); hiding them is up to the view.
 */
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
        const categories = g.categories.map((c): CategoryRow => {
          const values = months.map((m) => value(c.id, m))
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            dueDay: c.dueDay,
            active: c.active,
            editable: g.active && c.active,
            values,
            total: sum(values),
          }
        })
        const totals = sumColumns(categories.map((c) => c.values), months.length)
        return {
          id: g.id,
          kind: g.kind,
          name: g.name,
          active: g.active,
          goalPercent: g.goalPercent,
          categories,
          totals,
          total: sum(totals),
        }
      })
    const totals = sumColumns(groupRows.map((g) => g.totals), months.length)
    return { kind, label, groups: groupRows, totals, total: sum(totals) }
  })

  const totalsOf = (kind: EntryKind) => sections.find((s) => s.kind === kind)!.totals
  const incomes = totalsOf('INCOME')
  const expenses = totalsOf('EXPENSE')
  const balances = months.map((_, i) => incomes[i] - expenses[i])
  let running = openingCents
  const accumulated = balances.map((b) => (running += b))
  const balanceTotal = sum(balances)

  return {
    sections,
    incomes,
    expenses,
    balances,
    accumulated,
    incomeTotal: sum(incomes),
    expenseTotal: sum(expenses),
    balanceTotal,
    accumulatedTotal: openingCents + balanceTotal,
  }
}
