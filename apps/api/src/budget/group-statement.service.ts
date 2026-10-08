import { Injectable } from '@nestjs/common';
import { computeGroupBalance, isShareSettled } from '../groups/settlement.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  GroupStatementDto,
  GroupStatementItemDto,
} from './dto/group-statement.dto.js';
import { linkedCategoryId } from './group-shares.js';
import { seriesPositions } from './series.js';

const categorySelect = {
  id: true,
  name: true,
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
 * personal category each share counts in. A share someone else paid only
 * counts as paid once that member confirms the user paid them back. Groups the user left only show up
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
        paymentMethod: { select: { id: true, name: true, dueDay: true } },
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
          dueDay: true,
          paymentUrl: true,
          shares: {
            select: { memberId: true, amountCents: true, settledAt: true },
          },
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
        own.map((t) => ({
          ...t,
          shares: t.shares.map((s) => ({
            ...s,
            settled: s.settledAt !== null,
          })),
        })),
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
            // Expense shares are paid with the linked method, whose due day wins
            dueDay:
              (t.kind === 'EXPENSE' ? me.paymentMethod?.dueDay : null) ??
              t.dueDay,
            paymentUrl: t.paymentUrl,
            shareCents: share.amountCents,
            totalCents: t.amountCents,
            paid: isShareSettled(t.paidByMemberId, share),
            groupPaid: t.paidByMemberId !== null,
            paidByName:
              t.paidByMemberId === null
                ? null
                : (nameOf.get(t.paidByMemberId) ?? null),
            series: (t.seriesId && series.get(t.seriesId)?.get(t.id)) || null,
            category: categoryId === null ? null : categories[t.kind],
          },
        ];
      });
      items.sort(
        (a, b) =>
          (a.dueDay ?? 32) - (b.dueDay ?? 32) ||
          a.transactionId - b.transactionId,
      );

      return {
        group: me.group,
        active: me.leftAt === null,
        memberId: me.id,
        link: {
          expenseCategory: linkRef(me.expenseCategory),
          incomeCategory: linkRef(me.incomeCategory),
          paymentMethod: me.paymentMethod,
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
    if (seriesIds.length === 0) return seriesPositions([]);
    return seriesPositions(
      await this.prisma.groupTransaction.findMany({
        where: { seriesId: { in: [...new Set(seriesIds)] } },
        select: { id: true, seriesId: true, month: true },
      }),
    );
  }
}
