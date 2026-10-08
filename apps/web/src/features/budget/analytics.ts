import type { CategoryGroup, EntryKind, Month, MonthlyEntry } from './types'

/** 100% in basis points */
const FULL = 10000

/** A month of the dashboard's chart */
export interface TrendPoint {
  month: Month
  incomeCents: number
  expenseCents: number
  /** Income − expenses of the month */
  balanceCents: number
  /** The opening balance of the period plus every month's balance up to this one */
  accumulatedCents: number
}

/** An expense category in the period */
export interface BreakdownRow {
  categoryId: number
  name: string
  /** The category's type */
  groupName: string
  /** In the period's first month */
  monthCents: number
  /** In the whole period */
  periodCents: number
  /** Share of the period's expenses, in basis points (the rows add up to 100%) */
  shareBasisPoints: number
}

export interface ExpenseBreakdown {
  rows: BreakdownRow[]
  monthTotalCents: number
  periodTotalCents: number
}

/** What a cell counts: its transactions plus the user's group shares, like the summary */
const cellCents = (entry: MonthlyEntry) => entry.amountCents + entry.groupCents

function kindByCategory(groups: CategoryGroup[]): Map<number, EntryKind> {
  return new Map(groups.flatMap((g) => g.categories.map((c) => [c.id, g.kind] as const)))
}

/**
 * Income, expenses, balance and accumulated balance per month. Inactive
 * categories count (their history stays); unknown categories are ignored.
 */
export function buildMonthlyTrend(
  groups: CategoryGroup[],
  entries: MonthlyEntry[],
  months: Month[],
  openingCents: number,
): TrendPoint[] {
  const kindOf = kindByCategory(groups)
  const totals = new Map(months.map((m) => [m, { incomeCents: 0, expenseCents: 0 }]))
  for (const entry of entries) {
    const total = totals.get(entry.month)
    const kind = kindOf.get(entry.categoryId)
    if (!total || !kind) continue
    if (kind === 'INCOME') total.incomeCents += cellCents(entry)
    else total.expenseCents += cellCents(entry)
  }
  let accumulatedCents = openingCents
  return months.map((month) => {
    const { incomeCents, expenseCents } = totals.get(month)!
    const balanceCents = incomeCents - expenseCents
    accumulatedCents += balanceCents
    return { month, incomeCents, expenseCents, balanceCents, accumulatedCents }
  })
}

/**
 * Expenses per category in the first month and in the whole period, largest
 * first. Categories without any amount are left out.
 */
export function buildExpenseBreakdown(
  groups: CategoryGroup[],
  entries: MonthlyEntry[],
  months: Month[],
): ExpenseBreakdown {
  const inPeriod = new Set(months)
  const first = months[0]
  const sums = new Map<number, { monthCents: number; periodCents: number }>()
  for (const entry of entries) {
    if (!inPeriod.has(entry.month)) continue
    const sum = sums.get(entry.categoryId) ?? { monthCents: 0, periodCents: 0 }
    sum.periodCents += cellCents(entry)
    if (entry.month === first) sum.monthCents += cellCents(entry)
    sums.set(entry.categoryId, sum)
  }

  const rows: Omit<BreakdownRow, 'shareBasisPoints'>[] = []
  for (const group of groups) {
    if (group.kind !== 'EXPENSE') continue
    for (const category of group.categories) {
      const sum = sums.get(category.id)
      if (!sum || (sum.periodCents === 0 && sum.monthCents === 0)) continue
      rows.push({ categoryId: category.id, name: category.name, groupName: group.name, ...sum })
    }
  }
  // Largest first; ties keep the tree's order
  rows.sort((a, b) => b.periodCents - a.periodCents)

  const periodTotalCents = rows.reduce((sum, r) => sum + r.periodCents, 0)
  const monthTotalCents = rows.reduce((sum, r) => sum + r.monthCents, 0)
  const shares = shareOf(
    rows.map((r) => r.periodCents),
    periodTotalCents,
  )
  return {
    rows: rows.map((row, i) => ({ ...row, shareBasisPoints: shares[i] })),
    monthTotalCents,
    periodTotalCents,
  }
}

/**
 * Each value's share of `total` in basis points, by largest remainder (ties to
 * the first), so they add up to exactly 100%. All zero when the total is.
 */
export function shareOf(values: number[], total: number): number[] {
  if (total <= 0) return values.map(() => 0)
  const exact = values.map((v) => v * FULL)
  const shares = exact.map((e) => Math.floor(e / total))
  let left = FULL - shares.reduce((sum, s) => sum + s, 0)
  const byRemainder = exact
    .map((e, i) => ({ i, remainder: e % total }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    shares[i] += 1
    left -= 1
  }
  return shares
}
