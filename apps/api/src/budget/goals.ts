import type {
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';

/**
 * Goals of the expense types: the share of the income each one may take. Pure,
 * integer math mirroring the dashboard (`apps/web/src/features/budget/goals.ts`).
 */

export type GoalStatus = 'ok' | 'warning' | 'over';

/**
 * Share of the income spent by a type, in a month or the whole window. For the
 * leftover, `spentCents` is what is left (income − every expense, may be negative).
 */
export interface GoalUsage {
  spentCents: number;
  incomeCents: number;
  /** The goal as an amount: the goal's share of the income (0 without income) */
  targetCents: number;
  /** Spent ÷ income in tenths of a percent (485 = 48,5%); null without income */
  permille: number | null;
  status: GoalStatus;
}

export interface GoalProgress {
  typeId: number;
  name: string;
  goalPercent: number;
  month: GoalUsage;
  period: GoalUsage;
}

/** What is left of the income to save or invest, against the share no goal takes */
export interface LeftoverProgress {
  /** 100 − the sum of the goals (0 when they take everything): the minimum to keep */
  targetPercent: number;
  month: GoalUsage;
  period: GoalUsage;
}

export interface GoalsOverview {
  /** The window; `from` is the reference month of the `month` usages */
  from: string;
  to: string;
  goals: GoalProgress[];
  /** Sum of every goal, in percent (may exceed 100) */
  totalGoalPercent: number;
  /** Every type with a goal together, against the sum of the goals */
  total: { month: GoalUsage; period: GoalUsage };
  leftover: LeftoverProgress;
}

/** At or above this share of the goal (in percent), the usage warns */
export const WARNING_RATIO = 90;

/** `percent` of the income in cents, rounded to the nearest cent (none without income) */
export function shareOfIncome(incomeCents: number, percent: number): number {
  return incomeCents > 0 ? Math.round((incomeCents * percent) / 100) : 0;
}

export function goalUsage(
  spentCents: number,
  incomeCents: number,
  goalPercent: number,
): GoalUsage {
  const permille =
    incomeCents > 0 ? Math.round((spentCents * 1000) / incomeCents) : null;
  let status: GoalStatus = 'ok';
  if (incomeCents <= 0) {
    if (spentCents > 0) status = 'over';
    // Compare exact cents, not the rounded share: spent/income vs goal/100
  } else if (spentCents * 100 > incomeCents * goalPercent) {
    status = 'over';
  } else if (
    spentCents * 100 * 100 >=
    incomeCents * goalPercent * WARNING_RATIO
  ) {
    status = 'warning';
  }
  return {
    spentCents,
    incomeCents,
    targetCents: shareOfIncome(incomeCents, goalPercent),
    permille,
    status,
  };
}

/**
 * The leftover's goal is a minimum: below it warns, a negative leftover (more
 * expenses than income) is over.
 */
export function leftoverUsage(
  savedCents: number,
  incomeCents: number,
  targetPercent: number,
): GoalUsage {
  const permille =
    incomeCents > 0 ? Math.round((savedCents * 1000) / incomeCents) : null;
  let status: GoalStatus = 'ok';
  if (savedCents < 0) status = 'over';
  // Exact cents again: saved/income vs target/100
  else if (incomeCents > 0 && savedCents * 100 < incomeCents * targetPercent) {
    status = 'warning';
  }
  return {
    spentCents: savedCents,
    incomeCents,
    targetCents: shareOfIncome(incomeCents, targetPercent),
    permille,
    status,
  };
}

/**
 * Goals of the active expense types for the window's first month (`from`) and
 * for the whole window (`entries` holds only the window's months). Cells count their group shares; inactive types and categories
 * still count in the income and the leftover (their history is kept).
 */
export function buildGoalsOverview(
  types: CategoryGroupDto[],
  entries: MonthlyEntryDto[],
  from: string,
  to: string,
): GoalsOverview {
  const typeOf = new Map<number, CategoryGroupDto>();
  for (const type of types) {
    for (const category of type.categories) typeOf.set(category.id, type);
  }

  /** Per type id: [first month, whole window] */
  const byType = new Map<number, [number, number]>();
  const income: [number, number] = [0, 0];
  const expense: [number, number] = [0, 0];
  for (const entry of entries) {
    const type = typeOf.get(entry.categoryId);
    if (!type) continue;
    const cents = entry.amountCents + entry.groupCents;
    const inFirst = entry.month === from ? cents : 0;
    const totals = type.kind === 'INCOME' ? income : expense;
    totals[0] += inFirst;
    totals[1] += cents;
    if (type.kind === 'EXPENSE') {
      const sums = byType.get(type.id) ?? [0, 0];
      sums[0] += inFirst;
      sums[1] += cents;
      byType.set(type.id, sums);
    }
  }

  const goals = types
    .filter((t) => t.kind === 'EXPENSE' && t.active && t.goalPercent !== null)
    .map((t): GoalProgress => {
      const goalPercent = t.goalPercent!;
      const [month, period] = byType.get(t.id) ?? [0, 0];
      return {
        typeId: t.id,
        name: t.name,
        goalPercent,
        month: goalUsage(month, income[0], goalPercent),
        period: goalUsage(period, income[1], goalPercent),
      };
    });
  const totalGoalPercent = goals.reduce((sum, g) => sum + g.goalPercent, 0);
  const spent = (pick: (g: GoalProgress) => GoalUsage) =>
    goals.reduce((sum, g) => sum + pick(g).spentCents, 0);
  // Every expense counts in the leftover, with a goal or not
  const targetPercent = Math.max(0, 100 - totalGoalPercent);
  return {
    from,
    to,
    goals,
    totalGoalPercent,
    total: {
      month: goalUsage(
        spent((g) => g.month),
        income[0],
        totalGoalPercent,
      ),
      period: goalUsage(
        spent((g) => g.period),
        income[1],
        totalGoalPercent,
      ),
    },
    leftover: {
      targetPercent,
      month: leftoverUsage(income[0] - expense[0], income[0], targetPercent),
      period: leftoverUsage(income[1] - expense[1], income[1], targetPercent),
    },
  };
}
