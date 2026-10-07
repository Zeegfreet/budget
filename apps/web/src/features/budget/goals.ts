import type { BudgetTable } from './rows'

export type GoalStatus = 'ok' | 'warning' | 'over'

/** Share of the income spent by a type, in a month or the whole window. */
export interface GoalUsage {
  spentCents: number
  incomeCents: number
  /** Spent ÷ income in tenths of a percent (485 = 48,5%); null without income */
  permille: number | null
  status: GoalStatus
}

export interface GoalProgress {
  id: number
  name: string
  goalPercent: number
  month: GoalUsage
  period: GoalUsage
}

export interface GoalsOverview {
  goals: GoalProgress[]
  /** Sum of every goal, in percent (may exceed 100) */
  totalGoalPercent: number
  /** Every type with a goal together, against the sum of the goals */
  month: GoalUsage
  period: GoalUsage
}

/** At or above this share of the goal (in percent), the meter warns */
export const WARNING_RATIO = 90

export function goalUsage(spentCents: number, incomeCents: number, goalPercent: number): GoalUsage {
  // Integer math: cents are exact and tenths of a percent are enough to show
  const permille = incomeCents > 0 ? Math.round((spentCents * 1000) / incomeCents) : null
  let status: GoalStatus = 'ok'
  if (incomeCents <= 0) {
    if (spentCents > 0) status = 'over'
    // Compare exact cents, not the rounded share: spent/income vs goal/100
  } else if (spentCents * 100 > incomeCents * goalPercent) {
    status = 'over'
  } else if (spentCents * 100 * 100 >= incomeCents * goalPercent * WARNING_RATIO) {
    status = 'warning'
  }
  return { spentCents, incomeCents, permille, status }
}

/**
 * Goals of the active expense types, for the window's first month (the current
 * one) and for the whole window.
 */
export function buildGoalsOverview(table: BudgetTable): GoalsOverview {
  const expense = table.sections.find((s) => s.kind === 'EXPENSE')
  const withGoal = (expense?.groups ?? []).filter((g) => g.active && g.goalPercent !== null)
  const monthIncome = table.incomes[0] ?? 0
  const goals = withGoal.map(
    (g): GoalProgress => ({
      id: g.id,
      name: g.name,
      goalPercent: g.goalPercent!,
      month: goalUsage(g.totals[0] ?? 0, monthIncome, g.goalPercent!),
      period: goalUsage(g.total, table.incomeTotal, g.goalPercent!),
    }),
  )
  const totalGoalPercent = goals.reduce((sum, g) => sum + g.goalPercent, 0)
  const spent = (pick: (g: GoalProgress) => GoalUsage) => goals.reduce((sum, g) => sum + pick(g).spentCents, 0)
  return {
    goals,
    totalGoalPercent,
    month: goalUsage(spent((g) => g.month), monthIncome, totalGoalPercent),
    period: goalUsage(spent((g) => g.period), table.incomeTotal, totalGoalPercent),
  }
}

/** 485 → "48,5%" */
export function formatPermille(permille: number): string {
  return `${(permille / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
