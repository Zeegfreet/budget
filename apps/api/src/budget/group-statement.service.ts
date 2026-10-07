import { Injectable } from '@nestjs/common';
import { computeGroupBalance } from '../groups/settlement.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  GroupStatementDto,
  GroupStatementItemDto,
} from './dto/group-statement.dto.js';
import { linkedCategoryId } from './group-shares.js';

const categorySelect = {
  id: true,
  name: true,
  dueDay: true,
  active: true,
  group: { select: { id: true, name: true, kind: true, active: true } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;

const linkRef = (c: CategoryRow | null) =>
  c ? { id: c.id, name: c.name } : null;

/**
 * The final statement of the user's groups in a month, from their side: their
 * shares, what they paid or received, what they owe or are owed, and which
 * personal category each share counts in. Groups the user left only show up
 * while the month still has their shares (those keep counting in the budget).
 */
@Injectable()
export class GroupStatementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number, month: string): Promise<GroupStatementDto[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: {
        userId,
        OR: [
          { leftAt: null },
          { shares: { some: { transaction: { month } } } },
        ],
      },
      orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        groupId: true,
        leftAt: true,
        group: { select: { id: true, name: true } },
        expenseCategory: { select: categorySelect },
        incomeCategory: { select: categorySelect },
      },
    });
    if (memberships.length === 0) return [];
    const groupIds = memberships.map((m) => m.groupId);

    const [transactions, members] = await Promise.all([
      this.prisma.groupTransaction.findMany({
        where: { groupId: { in: groupIds }, month },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          groupId: true,
          kind: true,
          description: true,
          month: true,
          amountCents: true,
          paidByMemberId: true,
          seriesId: true,
          shares: { select: { memberId: true, amountCents: true } },
        },
      }),
      this.prisma.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: {
          id: true,
          groupId: true,
          leftAt: true,
          user: { select: { name: true } },
        },
      }),
    ]);
    const nameOf = new Map(members.map((m) => [m.id, m.user.name]));
    const series = await this.seriesPositions(
      transactions.flatMap((t) => (t.seriesId ? [t.seriesId] : [])),
    );

    return memberships.map((me) => {
      const own = transactions.filter((t) => t.groupId === me.groupId);
      const balance = computeGroupBalance(
        own,
        members
          .filter((m) => m.groupId === me.groupId && m.leftAt === null)
          .map((m) => m.id),
      );
      const mine = balance.members.find((m) => m.memberId === me.id);
      const categories = {
        EXPENSE: me.expenseCategory,
        INCOME: me.incomeCategory,
      };

      let expenseShareCents = 0;
      let incomeShareCents = 0;
      const items = own.flatMap((t): GroupStatementItemDto[] => {
        const share = t.shares.find((s) => s.memberId === me.id);
        if (!share) return [];
        if (t.kind === 'EXPENSE') expenseShareCents += share.amountCents;
        else incomeShareCents += share.amountCents;
        const categoryId = linkedCategoryId(t.kind, {
          expenseCategoryId: me.expenseCategory?.id ?? null,
          incomeCategoryId: me.incomeCategory?.id ?? null,
        });
        return [
          {
            transactionId: t.id,
            kind: t.kind,
            description: t.description,
            month: t.month,
            shareCents: share.amountCents,
            totalCents: t.amountCents,
            paid: t.paidByMemberId !== null,
            paidByName:
              t.paidByMemberId === null
                ? null
                : (nameOf.get(t.paidByMemberId) ?? null),
            series: (t.seriesId && series.get(t.seriesId)?.get(t.id)) || null,
            category: categoryId === null ? null : categories[t.kind],
          },
        ];
      });

      return {
        group: me.group,
        active: me.leftAt === null,
        memberId: me.id,
        link: {
          expenseCategory: linkRef(me.expenseCategory),
          incomeCategory: linkRef(me.incomeCategory),
        },
        expenseCents: balance.expenseCents,
        incomeCents: balance.incomeCents,
        pendingCents: balance.pendingCents,
        expenseShareCents,
        incomeShareCents,
        paidCents: mine?.paidCents ?? 0,
        receivedCents: mine?.receivedCents ?? 0,
        netCents: mine?.netCents ?? 0,
        transfers: balance.transfers
          .filter((t) => t.fromMemberId === me.id || t.toMemberId === me.id)
          .map((t) => ({
            ...t,
            fromName: nameOf.get(t.fromMemberId) ?? '',
            toName: nameOf.get(t.toMemberId) ?? '',
          })),
        items,
      };
    });
  }

  /** Position of each occurrence in its series (e.g. 3 of 12), by series and id. */
  private async seriesPositions(seriesIds: string[]) {
    const positions = new Map<
      string,
      Map<number, { index: number; count: number }>
    >();
    if (seriesIds.length === 0) return positions;
    const occurrences = await this.prisma.groupTransaction.findMany({
      where: { seriesId: { in: [...new Set(seriesIds)] } },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: { id: true, seriesId: true },
    });
    const idsBySeries = new Map<string, number[]>();
    for (const o of occurrences) {
      idsBySeries.set(o.seriesId!, [
        ...(idsBySeries.get(o.seriesId!) ?? []),
        o.id,
      ]);
    }
    for (const [seriesId, ids] of idsBySeries) {
      if (ids.length < 2) continue;
      positions.set(
        seriesId,
        new Map(ids.map((id, i) => [id, { index: i + 1, count: ids.length }])),
      );
    }
    return positions;
  }
}
