export type EntryKind = 'INCOME' | 'EXPENSE'

/** A month as `YYYY-MM`, matching the API */
export type Month = string

export interface Category {
  id: number
  name: string
  position: number
}

/** A category "type", e.g. Despesas Básicas or Salário */
export interface CategoryGroup {
  id: number
  kind: EntryKind
  name: string
  position: number
  categories: Category[]
}

export interface MonthlyEntry {
  categoryId: number
  month: Month
  /** Integer cents, never negative; the sign comes from the kind */
  amountCents: number
}

export interface BudgetSummary {
  month: Month
  initialBalanceCents: number
  openingBalanceCents: number
  incomeCents: number
  expenseCents: number
  monthBalanceCents: number
  closingBalanceCents: number
}
