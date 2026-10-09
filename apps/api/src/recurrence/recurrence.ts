import { addMonths, currentMonth, MAX_MONTH_SPAN } from '../budget/month.js';

/** 100% in basis points. */
const FULL_PERCENT = 10_000;

/** Largest amount an `Int` column holds: a compounded adjustment stops there. */
const MAX_PROJECTED_CENTS = 2_147_483_647;

/** Farthest month (from the current one) a read may create occurrences up to. */
export const MAX_GENERATION_AHEAD = 120;

/** Scheduled adjustment: `percentBp` every `everyMonths`, from `firstMonth` on. */
export interface Adjustment {
  percentBp: number;
  everyMonths: number;
  firstMonth: string;
}

/** The stored rule (`Recurrence` / `GroupRecurrence`) as the math needs it. */
export interface RecurrenceRule {
  endMonth: string | null;
  generatedUntil: string;
  adjustPercentBp: number | null;
  adjustEveryMonths: number | null;
  adjustFirstMonth: string | null;
}

/** The rule's adjustment, or `null` when it has none. */
export function adjustmentOf(rule: RecurrenceRule | null): Adjustment | null {
  if (
    !rule ||
    rule.adjustPercentBp === null ||
    rule.adjustEveryMonths === null ||
    rule.adjustFirstMonth === null
  ) {
    return null;
  }
  return {
    percentBp: rule.adjustPercentBp,
    everyMonths: rule.adjustEveryMonths,
    firstMonth: rule.adjustFirstMonth,
  };
}

/** Columns of an adjustment (all `null` without one). */
export function adjustmentColumns(adjustment: Adjustment | null) {
  return {
    adjustPercentBp: adjustment?.percentBp ?? null,
    adjustEveryMonths: adjustment?.everyMonths ?? null,
    adjustFirstMonth: adjustment?.firstMonth ?? null,
  };
}

/** Whether the adjustment applies in `month` (its first month, then every N). */
export function isAdjustmentMonth(adjustment: Adjustment, month: string) {
  if (month < adjustment.firstMonth) return false;
  const [fy, fm] = adjustment.firstMonth.split('-').map(Number);
  const [y, m] = month.split('-').map(Number);
  return ((y - fy) * 12 + (m - fm)) % adjustment.everyMonths === 0;
}

/** `cents` raised by `percentBp`, rounded half up to whole cents. */
export function adjust(cents: number, percentBp: number): number {
  const raised = Math.floor(
    (cents * (FULL_PERCENT + percentBp) + FULL_PERCENT / 2) / FULL_PERCENT,
  );
  return Math.min(raised, MAX_PROJECTED_CENTS);
}

/**
 * The amount of each month in `months` (ascending, after `baseMonth`) when
 * `baseMonth` is worth `baseCents`: every adjustment month in between raises
 * it, compounding step by step. Without an adjustment every month is the base.
 */
export function projectAmounts(
  baseCents: number,
  baseMonth: string,
  months: string[],
  adjustment: Adjustment | null,
): number[] {
  let amount = baseCents;
  let cursor = baseMonth;
  return months.map((month) => {
    while (cursor < month) {
      cursor = addMonths(cursor, 1);
      if (adjustment && isAdjustmentMonth(adjustment, cursor)) {
        amount = adjust(amount, adjustment.percentBp);
      }
    }
    return amount;
  });
}

/** Where a rule's creation stands: its end and the last month created. */
export type RuleWindow = Pick<RecurrenceRule, 'endMonth' | 'generatedUntil'>;

/** Months still to create, after `generatedUntil` up to `until` (or the end). */
export function monthsToGenerate(rule: RuleWindow, until: string): string[] {
  const last =
    rule.endMonth !== null && rule.endMonth < until ? rule.endMonth : until;
  const months: string[] = [];
  for (
    let month = addMonths(rule.generatedUntil, 1);
    month <= last;
    month = addMonths(month, 1)
  ) {
    months.push(month);
  }
  return months;
}

/** Whether the rule still has months to create up to `until`. */
export function needsGeneration(rule: RuleWindow, until: string): boolean {
  return monthsToGenerate(rule, until).length > 0;
}

/**
 * How far a read creates occurrences: the shown horizon (the current month and
 * the next `MAX_MONTH_SPAN - 1`) or the month read, if later, capped at
 * `MAX_GENERATION_AHEAD` months from now.
 */
export function generationTarget(
  requested?: string,
  now: string = currentMonth(),
): string {
  const horizon = addMonths(now, MAX_MONTH_SPAN - 1);
  const cap = addMonths(now, MAX_GENERATION_AHEAD);
  const wanted = requested && requested > horizon ? requested : horizon;
  return wanted < cap ? wanted : cap;
}
