import type { GroupMember, Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Ends a membership (leaving or removal). The row stays, with `leftAt`, so the
 * group's history keeps its payer and shares. Then the group adapts:
 * - no active member left: the group is deleted;
 * - the owner left: the oldest remaining member becomes the owner;
 * - equal and weight rules drop the member (and turn off if left empty);
 *   percent and fixed rules naming the member turn off until edited, since
 *   their values no longer add up.
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
  });
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
