/** A personal transaction of the invoice (amounts in integer cents). */
export interface InvoiceTransaction {
  plannedCents: number;
  realizedCents: number | null;
}

/** The user's share of a group expense paid with the method. */
export interface InvoiceShare {
  shareCents: number;
  paid: boolean;
}

export interface InvoiceTotals {
  /** Planned amounts plus the group shares */
  plannedCents: number;
  /** Realized amounts plus the paid group shares */
  realizedCents: number;
  /** Planned amount still pending (unpaid group shares included) */
  pendingCents: number;
  /** What the invoice weighs: realized amounts, or planned while pending */
  effectiveCents: number;
  /** Items in it (transactions and shares) */
  count: number;
}

/** Totals of an invoice; a paid share counts as realized, an unpaid one as pending. */
export function invoiceTotals(
  transactions: InvoiceTransaction[],
  shares: InvoiceShare[] = [],
): InvoiceTotals {
  let plannedCents = 0;
  let realizedCents = 0;
  let pendingCents = 0;
  for (const t of transactions) {
    plannedCents += t.plannedCents;
    if (t.realizedCents === null) pendingCents += t.plannedCents;
    else realizedCents += t.realizedCents;
  }
  for (const s of shares) {
    plannedCents += s.shareCents;
    if (s.paid) realizedCents += s.shareCents;
    else pendingCents += s.shareCents;
  }
  return {
    plannedCents,
    realizedCents,
    pendingCents,
    effectiveCents: realizedCents + pendingCents,
    count: transactions.length + shares.length,
  };
}

/**
 * The invoice's due date (`YYYY-MM-DD`) in `month`; a day past the month's
 * end falls on its last day (day 31 in February → the 28th or 29th).
 */
export function dueDate(month: string, dueDay: number | null): string | null {
  if (dueDay === null) return null;
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}
