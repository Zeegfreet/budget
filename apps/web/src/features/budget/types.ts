export type EntryKind = 'INCOME' | 'EXPENSE'

/** A month as `YYYY-MM`, matching the API */
export type Month = string

export interface Category {
  id: number
  name: string
  position: number
  /** Inactive categories are hidden and read-only; their values still count */
  active: boolean
  /** Short note, e.g. "Apartamento do centro" */
  description: string | null
  /** Day of the month the bill is due (1–31) */
  dueDay: number | null
}

/** A category "type", e.g. Despesas Básicas or Salário */
export interface CategoryGroup {
  id: number
  kind: EntryKind
  name: string
  position: number
  active: boolean
  /** Target share of the income, in whole percent (expense types only) */
  goalPercent: number | null
  categories: Category[]
}

export interface GroupInput {
  kind: EntryKind
  name: string
  goalPercent?: number | null
}

/** Fields to change; `null` clears the goal */
export type GroupPatch = Partial<Pick<CategoryGroup, 'name' | 'active' | 'goalPercent'>>

export interface CategoryInput {
  name: string
  description?: string | null
  dueDay?: number | null
}

/** Fields to change; `null` clears description or due day */
export type CategoryPatch = Partial<Pick<Category, 'name' | 'active' | 'description' | 'dueDay'>>

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
