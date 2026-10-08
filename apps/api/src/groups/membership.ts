import { currentMonth } from '../budget/month.js';
import type { GroupMember, Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { resplitPending } from './resplit.js';

/**
 * Ends a membership (leaving or removal). The row stays, with `leftAt`, so the
 * group's history keeps its payer and shares. Then the group adapts:
 * - no active member left: the group is deleted;
 * - the owner left: the oldest remaining member becomes the owner;
 * - equal and weight rules drop the member (and turn off if left empty);
 *   percent and fixed rules naming the member turn off until edited, since
 *   their values no longer add up;
 * - the unpaid transactions from the current month on are divided again
 *   without the member (see `resplitPending`).
 */
export async function endMembership(
  prisma: PrismaService,
  member: GroupMember,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.groupMember.update({
      where: { id: member.id },
      data: { leftAt: new Date(), role: 'MEMBER' },
    });
    const remaining = await tx.groupMember.findMany({
      where: { groupId: member.groupId, leftAt: null },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });
    if (remaining.length === 0) {
      await tx.financeGroup.delete({ where: { id: member.groupId } });
      return;
    }
    if (!remaining.some((m) => m.role === 'OWNER')) {
      await tx.groupMember.update({
        where: { id: remaining[0].id },
        data: { role: 'OWNER' },
      });
    }
    await adjustRules(tx, member);
    await resplitPending(tx, member.groupId, { fromMonth: currentMonth() });
  });
}

/**
 * Brings a member who just joined into the group's equal and weight rules
 * (weight 1), turning back on those that were off for having nobody left,
 * then divides the unpaid transactions from the current month on again.
 * Equal rules without participants already cover every active member;
 * percent and fixed rules stay as they are, since their values would no
 * longer add up.
 */
export async function includeInRules(
  tx: Prisma.TransactionClient,
  groupId: number,
  memberId: number,
): Promise<void> {
  const rules = await tx.splitMethod.findMany({
    where: { groupId, type: { in: ['EQUAL', 'WEIGHT'] } },
    select: {
      id: true,
      type: true,
      active: true,
      shares: { select: { memberId: true } },
    },
  });
  for (const rule of rules) {
    // An equal rule naming nobody is the "everyone" rule: nothing to add
    if (rule.type === 'EQUAL' && rule.active && rule.shares.length === 0) {
      continue;
    }
    if (!rule.shares.some((s) => s.memberId === memberId)) {
      await tx.splitMethodShare.create({
        data: { splitMethodId: rule.id, memberId, value: 1 },
      });
    }
    if (!rule.active && rule.shares.length === 0) {
      await tx.splitMethod.update({
        where: { id: rule.id },
        data: { active: true },
      });
    }
  }
  await resplitPending(tx, groupId, { fromMonth: currentMonth() });
}

async function adjustRules(tx: Prisma.TransactionClient, member: GroupMember) {
  const rules = await tx.splitMethod.findMany({
    where: {
      groupId: member.groupId,
      shares: { some: { memberId: member.id } },
    },
    select: { id: true, type: true, _count: { select: { shares: true } } },
  });
  for (const rule of rules) {
    if (rule.type === 'EQUAL' || rule.type === 'WEIGHT') {
      await tx.splitMethodShare.delete({
        where: {
          splitMethodId_memberId: {
            splitMethodId: rule.id,
            memberId: member.id,
          },
        },
      });
      if (rule._count.shares === 1) {
        await tx.splitMethod.update({
          where: { id: rule.id },
          data: { active: false },
        });
      }
    } else {
      await tx.splitMethod.update({
        where: { id: rule.id },
        data: { active: false },
      });
    }
  }
}
