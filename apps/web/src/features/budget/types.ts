export type EntryKind = 'INCOME' | 'EXPENSE'

/** A month as `YYYY-MM`, matching the API */
export type Month = string

export interface Category {
  id: number
  name: string
  position: number
  /** Inactive categories are hidden and read-only; their values still count */
  active: boolean
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
}

/** Fields to change */
export type CategoryPatch = Partial<Pick<Category, 'name' | 'active'>>

/** A category's month: the sum of its transactions plus the user's group shares */
export interface MonthlyEntry {
  categoryId: number
  month: Month
  /** Integer cents, never negative; the sign comes from the kind. Sum of the cell's transactions. */
  amountCents: number
  /** Transactions behind the cell */
  count: number
  /** The user's shares of linked groups in the category (not part of `amountCents`, read-only) */
  groupCents: number
}

/** Where an occurrence sits in its recurring series (e.g. 3 of 12, Oct/2026 to Sep/2027) */
export interface SeriesPosition {
  index: number
  count: number
  firstMonth: Month
  lastMonth: Month
}

/** One month of a launch row: the transaction there */
export interface LineCell {
  month: Month
  transactionId: number
  plannedCents: number
  /** `null` while pending */
  realizedCents: number | null
}

/** A launch row of the grid: one recurring series, or one plain launch (`GET /budget/lines`) */
export interface BudgetLine {
  /** A transaction of the row; identifies it when saving */
  anchorId: number
  categoryId: number
  description: string | null
  /** The launch's own due day */
  dueDay: number | null
  /** Its due day overrides the launch's */
  paymentMethod: { id: number; name: string; dueDay: number | null } | null
  /** Months with a transaction */
  cells: LineCell[]
}

/** A row's planned amount in a month (`PUT /budget/lines`); 0 deletes that month's transaction */
export interface LineCellChange {
  anchorId: number
  month: Month
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

/** The personal category a group share counts in (same shape as a transaction's) */
export interface ShareCategory {
  id: number
  name: string
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
  /** Effective due day: for expenses, the linked payment method's, or else the transaction's */
  dueDay: number | null
  shareCents: number
  /** The whole transaction's amount */
  totalCents: number
  /** The user's share is done: they paid (or received) it, or the member who did confirmed being paid back */
  paid: boolean
  /** Someone in the group paid (or received) it */
  groupPaid: boolean
  paidByName: string | null
  series: SeriesPosition | null
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
