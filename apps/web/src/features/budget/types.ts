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

/** A grid cell: the planned amount of a category in a month */
export interface MonthlyEntry {
  categoryId: number
  month: Month
  /** Integer cents, never negative; the sign comes from the kind. Sum of the cell's transactions. */
  amountCents: number
  /**
   * Transactions behind the cell (responses only). With more than one the cell
   * is read-only in the grid and edited in the statement.
   */
  count?: number
  /**
   * The user's shares of linked groups in the category (responses only, not
   * part of `amountCents`). With any, the cell is read-only in the grid.
   */
  groupCents?: number
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

/** The personal category a group share counts in (same shape as a transaction's) */
export interface ShareCategory {
  id: number
  name: string
  dueDay: number | null
  active: boolean
  group: { id: number; name: string; kind: EntryKind; active: boolean }
}

/** The user's share of one group transaction */
export interface GroupStatementItem {
  /** The group transaction's id */
  transactionId: number
  kind: EntryKind
  description: string
  month: Month
  shareCents: number
  /** The whole transaction's amount */
  totalCents: number
  /** Someone paid (or received) it */
  paid: boolean
  paidByName: string | null
  series: { index: number; count: number } | null
  /** Where it counts in the budget (the group's link for its kind); `null` = not counted */
  category: ShareCategory | null
}

export interface GroupStatementTransfer {
  fromMemberId: number
  fromName: string
  toMemberId: number
  toName: string
  amountCents: number
}

/** A group's month from the user's side (`GET /budget/group-statements`) */
export interface GroupStatement {
  group: { id: number; name: string }
  /** false for a group the user left (listed while the month still has their shares) */
  active: boolean
  /** The user's membership id */
  memberId: number
  link: {
    expenseCategory: { id: number; name: string } | null
    incomeCategory: { id: number; name: string } | null
    /** Where the expense shares are paid */
    paymentMethod: { id: number; name: string; dueDay: number | null } | null
  }
  /** The group's totals in the month */
  expenseCents: number
  incomeCents: number
  pendingCents: number
  /** The user's side */
  expenseShareCents: number
  incomeShareCents: number
  paidCents: number
  receivedCents: number
  /** > 0: to receive; < 0: owes. Paid items only. */
  netCents: number
  /** Suggested transfers the user is part of */
  transfers: GroupStatementTransfer[]
  items: GroupStatementItem[]
}
