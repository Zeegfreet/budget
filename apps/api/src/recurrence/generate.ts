import { divideCopy } from '../groups/resplit.js';
import type { Db } from '../prisma/db.js';
import {
  adjustmentOf,
  monthsToGenerate,
  projectAmounts,
} from './recurrence.js';

/**
 * Creates the personal rule's missing occurrences up to `until`, copying the
 * series' last occurrence (pending, its amount raised by the scheduled
 * adjustment), and moves `generatedUntil` forward. Runs inside `tx` with the
 * rule's row locked, so concurrent reads don't create a month twice. A paused
 * series (inactive category or type) waits without moving forward; a series
 * left without occurrences loses its rule.
 */
export async function generatePersonal(
  tx: Db,
  ruleId: number,
  until: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Recurrence" WHERE "id" = ${ruleId} FOR UPDATE`;
  const rule = await tx.recurrence.findUnique({ where: { id: ruleId } });
  if (!rule) return;
  const months = monthsToGenerate(rule, until);
  if (months.length === 0) return;
  const template = await tx.transaction.findFirst({
    where: { userId: rule.userId, seriesId: rule.seriesId },
    orderBy: [{ month: 'desc' }, { id: 'desc' }],
    include: {
      category: {
        select: { active: true, group: { select: { active: true } } },
      },
    },
  });
  if (!template) {
    await tx.recurrence.delete({ where: { id: ruleId } });
    return;
  }
  if (!template.category.active || !template.category.group.active) return;

  // Months up to the last occurrence (e.g. one the grid added) stay as they are
  const later = months.filter((month) => month > template.month);
  const amounts = projectAmounts(
    template.plannedCents,
    template.month,
    later,
    adjustmentOf(rule),
  );
  if (later.length > 0) {
    await tx.transaction.createMany({
      data: later.map((month, i) => ({
        userId: rule.userId,
        categoryId: template.categoryId,
        month,
        description: template.description,
        plannedCents: amounts[i],
        seriesId: rule.seriesId,
        dueDay: template.dueDay,
        paymentUrl: template.paymentUrl,
        paymentMethodId: template.paymentMethodId,
      })),
    });
  }
  await tx.recurrence.update({
    where: { id: ruleId },
    data: { generatedUntil: months[months.length - 1] },
  });
}

/**
 * The group's `generatePersonal`: new occurrences are unpaid and divided with
 * the current members (the launch's rule when it can, else the last
 * occurrence's proportions), like the pending ones after a membership change.
 */
export async function generateGroup(
  tx: Db,
  ruleId: number,
  until: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "GroupRecurrence" WHERE "id" = ${ruleId} FOR UPDATE`;
  const rule = await tx.groupRecurrence.findUnique({ where: { id: ruleId } });
  if (!rule) return;
  const months = monthsToGenerate(rule, until);
  if (months.length === 0) return;
  const template = await tx.groupTransaction.findFirst({
    where: { groupId: rule.groupId, seriesId: rule.seriesId },
    orderBy: [{ month: 'desc' }, { id: 'desc' }],
    include: {
      shares: { select: { memberId: true, amountCents: true } },
      splitMethod: {
        select: {
          type: true,
          active: true,
          shares: { select: { memberId: true, value: true } },
        },
      },
    },
  });
  if (!template) {
    await tx.groupRecurrence.delete({ where: { id: ruleId } });
    return;
  }
  const members = await tx.groupMember.findMany({
    where: { groupId: rule.groupId, leftAt: null },
    select: { id: true },
  });
  if (members.length === 0) return;
  const activeIds = members.map((m) => m.id);

  const later = months.filter((month) => month > template.month);
  const amounts = projectAmounts(
    template.amountCents,
    template.month,
    later,
    adjustmentOf(rule),
  );
  for (const [i, month] of later.entries()) {
    const shares = divideCopy(
      amounts[i],
      template.splitMethod,
      template.shares,
      activeIds,
    );
    await tx.groupTransaction.create({
      data: {
        groupId: rule.groupId,
        kind: template.kind,
        description: template.description,
        month,
        amountCents: shares.reduce((total, s) => total + s.amountCents, 0),
        splitMethodId: template.splitMethodId,
        createdById: template.createdById,
        seriesId: rule.seriesId,
        dueDay: template.dueDay,
        paymentUrl: template.paymentUrl,
        categoryId: template.categoryId,
        shares: { create: shares },
      },
    });
  }
  await tx.groupRecurrence.update({
    where: { id: ruleId },
    data: { generatedUntil: months[months.length - 1] },
  });
}
