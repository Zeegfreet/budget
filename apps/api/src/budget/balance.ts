import type { EntryKind } from '../prisma/generated/client.js';

export interface KindTotals {
  incomeCents: number;
  expenseCents: number;
}

export interface BudgetSummary extends KindTotals {
  month: string;
  initialBalanceCents: number;
  /** Initial balance + income − expenses of every month before `month` */
  openingBalanceCents: number;
  /** Income − expenses of `month` */
  monthBalanceCents: number;
  /** Opening balance + month balance */
  closingBalanceCents: number;
}

/** Adds per-category sums into income and expense totals. Unknown categories are ignored. */
export function sumByKind(
  sums: { categoryId: number; amountCents: number }[],
  kindOf: ReadonlyMap<number, EntryKind>,
): KindTotals {
  const totals: KindTotals = { incomeCents: 0, expenseCents: 0 };
  for (const { categoryId, amountCents } of sums) {
    const kind = kindOf.get(categoryId);
    if (kind === 'INCOME') totals.incomeCents += amountCents;
    else if (kind === 'EXPENSE') totals.expenseCents += amountCents;
  }
  return totals;
}

export function computeSummary(
  month: string,
  initialBalanceCents: number,
  previous: KindTotals,
  current: KindTotals,
): BudgetSummary {
  const openingBalanceCents =
    initialBalanceCents + previous.incomeCents - previous.expenseCents;
  const monthBalanceCents = current.incomeCents - current.expenseCents;
  return {
    month,
    initialBalanceCents,
    openingBalanceCents,
    incomeCents: current.incomeCents,
    expenseCents: current.expenseCents,
    monthBalanceCents,
    closingBalanceCents: openingBalanceCents + monthBalanceCents,
  };
}
