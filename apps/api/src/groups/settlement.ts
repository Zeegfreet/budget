import type { EntryKind } from '../prisma/generated/enums.js';
import type { MemberShare } from './split.js';

export interface SettlementTransaction {
  kind: EntryKind;
  amountCents: number;
  /** Who paid the expense or received the income; `null` while pending */
  paidByMemberId: number | null;
  shares: MemberShare[];
}

export interface MemberBalance {
  memberId: number;
  /** Share of the expenses minus share of the incomes (pending ones included) */
  shareCents: number;
  /** Expenses this member paid */
  paidCents: number;
  /** Incomes this member received (and holds for the group) */
  receivedCents: number;
  /** > 0: the group owes this member; < 0: this member owes the group. Paid items only. */
  netCents: number;
}

export interface Transfer {
  fromMemberId: number;
  toMemberId: number;
  amountCents: number;
}

export interface GroupBalance {
  incomeCents: number;
  expenseCents: number;
  /** Total of items nobody paid or received yet */
  pendingCents: number;
  members: MemberBalance[];
  transfers: Transfer[];
}

/**
 * Who paid what and who owes whom. A paid expense credits the payer and debits
 * each member's share; a received income works the other way round (the one
 * holding it owes the others their shares). The nets always add up to zero.
 */
export function computeGroupBalance(
  transactions: SettlementTransaction[],
  memberIds: number[],
): GroupBalance {
  const balances = new Map<number, MemberBalance>();
  const of = (memberId: number) => {
    let balance = balances.get(memberId);
    if (!balance) {
      balance = {
        memberId,
        shareCents: 0,
        paidCents: 0,
        receivedCents: 0,
        netCents: 0,
      };
      balances.set(memberId, balance);
    }
    return balance;
  };
  memberIds.forEach(of);

  let incomeCents = 0;
  let expenseCents = 0;
  let pendingCents = 0;
  for (const t of transactions) {
    const sign = t.kind === 'EXPENSE' ? 1 : -1;
    if (t.kind === 'EXPENSE') expenseCents += t.amountCents;
    else incomeCents += t.amountCents;
    for (const share of t.shares) {
      of(share.memberId).shareCents += sign * share.amountCents;
    }
    if (t.paidByMemberId === null) {
      pendingCents += t.amountCents;
      continue;
    }
    const payer = of(t.paidByMemberId);
    if (t.kind === 'EXPENSE') payer.paidCents += t.amountCents;
    else payer.receivedCents += t.amountCents;
    payer.netCents += sign * t.amountCents;
    for (const share of t.shares) {
      of(share.memberId).netCents -= sign * share.amountCents;
    }
  }

  const members = [...balances.values()].sort(
    (a, b) => a.memberId - b.memberId,
  );
  return {
    incomeCents,
    expenseCents,
    pendingCents,
    members,
    transfers: suggestTransfers(members),
  };
}

/**
 * Transfers that settle the nets: the largest debtor pays the largest
 * creditor until one of them is even (at most `members - 1` transfers).
 */
export function suggestTransfers(
  nets: { memberId: number; netCents: number }[],
): Transfer[] {
  const byAmount = (a: Entry, b: Entry) =>
    b.cents - a.cents || a.memberId - b.memberId;
  type Entry = { memberId: number; cents: number };
  const debtors: Entry[] = nets
    .filter((n) => n.netCents < 0)
    .map((n) => ({ memberId: n.memberId, cents: -n.netCents }))
    .sort(byAmount);
  const creditors: Entry[] = nets
    .filter((n) => n.netCents > 0)
    .map((n) => ({ memberId: n.memberId, cents: n.netCents }))
    .sort(byAmount);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amountCents = Math.min(debtors[d].cents, creditors[c].cents);
    transfers.push({
      fromMemberId: debtors[d].memberId,
      toMemberId: creditors[c].memberId,
      amountCents,
    });
    debtors[d].cents -= amountCents;
    creditors[c].cents -= amountCents;
    if (debtors[d].cents === 0) d += 1;
    if (creditors[c].cents === 0) c += 1;
  }
  return transfers;
}
