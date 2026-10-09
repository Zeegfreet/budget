import type { Prisma } from '../prisma/generated/client.js';
import {
  computeShares,
  type MemberShare,
  redistribute,
  SplitRuleError,
} from './split.js';

export interface ResplitScope {
  /** Only occurrences of this month or later */
  fromMonth?: string;
  /** Only occurrences divided by this rule */
  splitMethodId?: number;
}

/**
 * Divides the group's unpaid transactions again with the current members and
 * rules, so a member who joined, a member who left or an edited rule reach
 * what is still pending (paid ones keep their snapshot):
 * - an active rule naming only active members divides it again (a FIXED rule
 *   also sets the amount to its total);
 * - otherwise (rule deleted or turned off) the shares of former members go to
 *   the remaining participants, in proportion to their shares; with nobody
 *   left, every active member splits it equally.
 * Only transactions whose shares change are written.
 */
export async function resplitPending(
  tx: Prisma.TransactionClient,
  groupId: number,
  { fromMonth, splitMethodId }: ResplitScope = {},
): Promise<void> {
  const [transactions, members] = await Promise.all([
    tx.groupTransaction.findMany({
      where: {
        groupId,
        paidByMemberId: null,
        ...(fromMonth && { month: { gte: fromMonth } }),
        ...(splitMethodId !== undefined && { splitMethodId }),
      },
      select: {
        id: true,
        amountCents: true,
        splitMethod: {
          select: {
            type: true,
            active: true,
            shares: { select: { memberId: true, value: true } },
          },
        },
        shares: { select: { memberId: true, amountCents: true } },
      },
    }),
    tx.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { id: true },
    }),
  ]);
  const activeIds = members.map((m) => m.id);
  if (activeIds.length === 0) return;

  for (const t of transactions) {
    const next = divide(t.amountCents, t.splitMethod, t.shares, activeIds);
    if (!next) continue;
    const amountCents = next.reduce((total, s) => total + s.amountCents, 0);
    if (amountCents === t.amountCents && sameShares(t.shares, next)) continue;
    if (amountCents !== t.amountCents) {
      await tx.groupTransaction.update({
        where: { id: t.id },
        data: { amountCents },
      });
    }
    await tx.groupTransactionShare.deleteMany({
      where: { transactionId: t.id },
    });
    await tx.groupTransactionShare.createMany({
      data: next.map((s) => ({ ...s, transactionId: t.id })),
    });
  }
}

export type Rule = {
  type: Parameters<typeof computeShares>[1]['type'];
  active: boolean;
  shares: { memberId: number; value: number }[];
} | null;

/** The transaction's new shares; `null` keeps the current ones. */
function divide(
  amountCents: number,
  rule: Rule,
  current: MemberShare[],
  activeIds: number[],
): MemberShare[] | null {
  if (
    rule?.active &&
    rule.shares.every((s) => activeIds.includes(s.memberId))
  ) {
    // A FIXED rule defines the amount itself
    const total =
      rule.type === 'FIXED'
        ? rule.shares.reduce((sum, s) => sum + s.value, 0)
        : amountCents;
    try {
      return computeShares(total, rule, activeIds);
    } catch (error) {
      if (!(error instanceof SplitRuleError)) throw error;
    }
  }
  if (current.every((s) => activeIds.includes(s.memberId))) return null;
  return (
    redistribute(amountCents, current, activeIds) ??
    computeShares(amountCents, { type: 'EQUAL', shares: [] }, activeIds)
  );
}

/**
 * Shares of a new occurrence of `amountCents` copied from a launch divided as
 * `template`: the current rule when it can divide it (a FIXED rule sets the
 * amount to its total), else the template's proportions among the active
 * members, else equal among them.
 */
export function divideCopy(
  amountCents: number,
  rule: Rule,
  template: MemberShare[],
  activeIds: number[],
): MemberShare[] {
  return (
    divide(amountCents, rule, template, activeIds) ??
    redistribute(amountCents, template, activeIds) ??
    computeShares(amountCents, { type: 'EQUAL', shares: [] }, activeIds)
  );
}

function sameShares(a: MemberShare[], b: MemberShare[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((s) => [s.memberId, s.amountCents]));
  return b.every((s) => byId.get(s.memberId) === s.amountCents);
}
