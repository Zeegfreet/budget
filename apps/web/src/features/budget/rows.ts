import type { BudgetLine, CategoryGroup, EntryKind, LineCell, Month } from './types'

/** A launch row under its category: one recurring series or one plain launch */
export interface LineRow {
  line: BudgetLine
  /** The description, or a placeholder */
  label: string
  /** Effective due day: the payment method's, or else the launch's */
  dueDay: number | null
  values: number[]
  total: number
}

export interface CategoryRow {
  id: number
  name: string
  active: boolean
  /** Takes values: the category and its type are active */
  editable: boolean
  /** Its launches plus the group shares, per month */
  values: number[]
  /** Sum of every month in the window */
  total: number
  lines: LineRow[]
  /** The user's shares of linked groups per month, or `null` when there are none */
  shares: number[] | null
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

export const UNNAMED_LINE = 'Sem descrição'

/** Where the table's amounts come from (draft values while editing, or saved ones) */
export interface TableValues {
  /** A launch row's planned amount in a month */
  line: (anchorId: number, month: Month) => number
  /** The user's group shares in a category and month */
  groupShare: (categoryId: number, month: Month) => number
}

/**
 * Builds the pivot table (all integer cents) from the category tree, its
 * launch rows and the values. Inactive types and categories stay in the totals
 * (their history is kept); hiding them is up to the view.
 */
export function buildBudgetTable(
  groups: CategoryGroup[],
  lines: BudgetLine[],
  months: Month[],
  { line: lineValue, groupShare }: TableValues,
  openingCents: number,
): BudgetTable {
  const linesOf = new Map<number, BudgetLine[]>()
  for (const line of lines) linesOf.set(line.categoryId, [...(linesOf.get(line.categoryId) ?? []), line])
  const sections = SECTIONS.map(({ kind, label }): Section => {
    const groupRows = groups
      .filter((g) => g.kind === kind)
      .map((g): GroupRow => {
        const categories = g.categories.map((c): CategoryRow => {
          const lineRows = (linesOf.get(c.id) ?? []).map((line): LineRow => {
            const values = months.map((m) => lineValue(line.anchorId, m))
            return {
              line,
              label: line.description ?? UNNAMED_LINE,
              dueDay: line.paymentMethod?.dueDay ?? line.dueDay,
              values,
              total: sum(values),
            }
          })
          const shares = months.map((m) => groupShare(c.id, m))
          const values = sumColumns([...lineRows.map((l) => l.values), shares], months.length)
          return {
            id: c.id,
            name: c.name,
            active: c.active,
            editable: g.active && c.active,
            values,
            total: sum(values),
            lines: lineRows,
            shares: shares.some((v) => v !== 0) ? shares : null,
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

/**
 * The occurrence a row's edit or delete starts from: its first pending month
 * in the window (realized ones stay as they are), or else its first month.
 */
export function lineTarget(line: BudgetLine): LineCell {
  return line.cells.find((c) => c.realizedCents === null) ?? line.cells[0]
}
