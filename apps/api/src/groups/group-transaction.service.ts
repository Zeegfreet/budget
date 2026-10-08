import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RecurrenceScope } from '../budget/dto/transaction.dto.js';
import { addMonths } from '../budget/month.js';
import { planSeriesEnd, seriesPositions } from '../budget/series.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateGroupTransactionDto,
  GroupBalanceDto,
  GroupTransactionDto,
  UpdateGroupTransactionDto,
} from './dto/group-transaction.dto.js';
import { activeMembers, assertMember } from './group-access.js';
import { computeGroupBalance } from './settlement.js';
import { computeShares, type MemberShare, SplitRuleError } from './split.js';

const memberName = {
  select: { id: true, user: { select: { name: true } } },
} as const;

const groupTransactionSelect = {
  id: true,
  kind: true,
  description: true,
  month: true,
  amountCents: true,
  seriesId: true,
  splitMethod: { select: { id: true, name: true, type: true } },
  paidBy: memberName,
  shares: {
    orderBy: { memberId: 'asc' },
    select: { amountCents: true, member: memberName },
  },
} satisfies Prisma.GroupTransactionSelect;

type GroupTransactionRow = Prisma.GroupTransactionGetPayload<{
  select: typeof groupTransactionSelect;
}>;

/**
 * The group's incomes and expenses ("lançamentos"). Each one is divided by a
 * split rule into per-member shares, stored with it so later rule changes
 * don't rewrite history. Paying (or receiving) it records which member did.
 * Only active members get in; anyone else gets a 404.
 */
@Injectable()
export class GroupTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: number,
    groupId: number,
    month: string,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    const rows = await this.prisma.groupTransaction.findMany({
      where: { groupId, month },
      orderBy: { id: 'asc' },
      select: groupTransactionSelect,
    });
    return this.present(groupId, rows);
  }

  /** Creates one occurrence per month; several share a new series. */
  async create(
    userId: number,
    groupId: number,
    {
      kind,
      description,
      month,
      amountCents,
      splitMethodId,
      paidByMemberId = null,
      repeatMonths = 1,
    }: CreateGroupTransactionDto,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    const shares = await this.shares(groupId, splitMethodId, amountCents);
    if (paidByMemberId !== null) {
      await this.assertActiveMember(groupId, paidByMemberId);
    }
    const seriesId = repeatMonths > 1 ? randomUUID() : null;
    const rows = await this.prisma.$transaction(
      Array.from({ length: repeatMonths }, (_, i) =>
        this.prisma.groupTransaction.create({
          data: {
            groupId,
            kind,
            description,
            month: addMonths(month, i),
            amountCents,
            splitMethodId,
            // Only the first occurrence is already paid
            paidByMemberId: i === 0 ? paidByMemberId : null,
            createdById: userId,
            seriesId,
            shares: { create: shares },
          },
          select: groupTransactionSelect,
        }),
      ),
    );
    return this.present(groupId, rows);
  }

  /**
   * Changes the transaction and, with `FOLLOWING`, the later occurrences of its
   * series still pending. A new amount or rule recomputes the shares.
   */
  async update(
    userId: number,
    groupId: number,
    id: number,
    {
      scope = 'ONE',
      kind,
      description,
      amountCents,
      splitMethodId,
    }: UpdateGroupTransactionDto,
  ): Promise<GroupTransactionDto> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    let shares: MemberShare[] | undefined;
    if (amountCents !== undefined || splitMethodId !== undefined) {
      const methodId = splitMethodId ?? current.splitMethod?.id;
      if (methodId === undefined) {
        throw new BadRequestException('Choose a split method');
      }
      shares = await this.shares(
        groupId,
        methodId,
        amountCents ?? current.amountCents,
      );
    }

    const ids = [id, ...(await this.followingIds(groupId, current, scope))];
    await this.prisma.$transaction(async (tx) => {
      await tx.groupTransaction.updateMany({
        where: { id: { in: ids } },
        data: { kind, description, amountCents, splitMethodId },
      });
      if (shares) {
        await tx.groupTransactionShare.deleteMany({
          where: { transactionId: { in: ids } },
        });
        await tx.groupTransactionShare.createMany({
          data: ids.flatMap((transactionId) =>
            shares.map((s) => ({ ...s, transactionId })),
          ),
        });
      }
    });
    return (await this.present(groupId, [await this.find(groupId, id)]))[0];
  }

  /** Deletes the transaction and, with `FOLLOWING`, the later pending ones of its series. */
  async remove(
    userId: number,
    groupId: number,
    id: number,
    scope: RecurrenceScope = 'ONE',
  ): Promise<void> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    const ids = [id, ...(await this.followingIds(groupId, current, scope))];
    await this.prisma.groupTransaction.deleteMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * Moves the series' last month to `untilMonth`: later months get copies of
   * the last occurrence kept (pending, same shares), or the unpaid occurrences
   * after it go. A single transaction becomes a series when extended.
   */
  async setSeriesEnd(
    userId: number,
    groupId: number,
    id: number,
    untilMonth: string,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    const occurrences = current.seriesId
      ? await this.prisma.groupTransaction.findMany({
          where: { groupId, seriesId: current.seriesId },
          select: { id: true, month: true, paidByMemberId: true },
        })
      : [{ id, month: current.month, paidByMemberId: current.paidBy?.id }];
    const plan = planSeriesEnd(
      occurrences.map((o) => ({
        id: o.id,
        month: o.month,
        settled: o.paidByMemberId != null,
      })),
      untilMonth,
    );
    const template = await this.prisma.groupTransaction.findUniqueOrThrow({
      where: { id: plan.templateId },
      include: { shares: { select: { memberId: true, amountCents: true } } },
    });
    const seriesId =
      current.seriesId ?? (plan.addMonths.length > 0 ? randomUUID() : null);
    await this.prisma.$transaction([
      ...(seriesId && !current.seriesId
        ? [
            this.prisma.groupTransaction.update({
              where: { id },
              data: { seriesId },
            }),
          ]
        : []),
      this.prisma.groupTransaction.deleteMany({
        where: { groupId, id: { in: plan.removeIds } },
      }),
      ...plan.addMonths.map((month) =>
        this.prisma.groupTransaction.create({
          data: {
            groupId,
            kind: template.kind,
            description: template.description,
            month,
            amountCents: template.amountCents,
            splitMethodId: template.splitMethodId,
            createdById: userId,
            seriesId,
            shares: { create: template.shares },
          },
        }),
      ),
    ]);
    const rows = await this.prisma.groupTransaction.findMany({
      where: seriesId ? { groupId, seriesId } : { groupId, id },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: groupTransactionSelect,
    });
    return this.present(groupId, rows);
  }

  /** Records who paid (or received) it; `null` makes it pending again. */
  async setPayment(
    userId: number,
    groupId: number,
    id: number,
    memberId: number | null,
  ): Promise<GroupTransactionDto> {
    await assertMember(this.prisma, userId, groupId);
    await this.find(groupId, id);
    if (memberId !== null) await this.assertActiveMember(groupId, memberId);
    const updated = await this.prisma.groupTransaction.update({
      where: { id },
      data: { paidByMemberId: memberId },
      select: groupTransactionSelect,
    });
    return (await this.present(groupId, [updated]))[0];
  }

  /** Per-member shares, payments and who owes whom in the month. */
  async balance(
    userId: number,
    groupId: number,
    month: string,
  ): Promise<GroupBalanceDto> {
    await assertMember(this.prisma, userId, groupId);
    const transactions = await this.prisma.groupTransaction.findMany({
      where: { groupId, month },
      select: {
        kind: true,
        amountCents: true,
        paidByMemberId: true,
        shares: { select: { memberId: true, amountCents: true } },
      },
    });
    const active = await activeMembers(this.prisma, groupId);
    const balance = computeGroupBalance(
      transactions,
      active.map((m) => m.id),
    );
    const members = await this.prisma.groupMember.findMany({
      where: { id: { in: balance.members.map((m) => m.memberId) } },
      select: { id: true, leftAt: true, user: { select: { name: true } } },
    });
    const byId = new Map(members.map((m) => [m.id, m]));
    return {
      month,
      ...balance,
      members: balance.members.map((m) => ({
        ...m,
        name: byId.get(m.memberId)?.user.name ?? '',
        active: byId.get(m.memberId)?.leftAt === null,
      })),
    };
  }

  private async find(groupId: number, id: number) {
    const row = await this.prisma.groupTransaction.findFirst({
      where: { id, groupId },
      select: groupTransactionSelect,
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  /** Later pending occurrences of the series a `FOLLOWING` change also reaches. */
  private async followingIds(
    groupId: number,
    current: GroupTransactionRow,
    scope: RecurrenceScope,
  ): Promise<number[]> {
    if (scope !== 'FOLLOWING' || !current.seriesId) return [];
    const rows = await this.prisma.groupTransaction.findMany({
      where: {
        groupId,
        seriesId: current.seriesId,
        month: { gte: current.month },
        paidByMemberId: null,
        id: { not: current.id },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Divides the amount with an active rule of the group (400 when it can't). */
  private async shares(
    groupId: number,
    splitMethodId: number,
    amountCents: number,
  ): Promise<MemberShare[]> {
    const method = await this.prisma.splitMethod.findFirst({
      where: { id: splitMethodId, groupId },
      select: { type: true, active: true, shares: true },
    });
    if (!method) throw new NotFoundException('Split method not found');
    if (!method.active) {
      throw new BadRequestException('Split method is inactive');
    }
    const active = await activeMembers(this.prisma, groupId);
    const activeIds = active.map((m) => m.id);
    if (method.shares.some((s) => !activeIds.includes(s.memberId))) {
      throw new BadRequestException('Split method is inactive');
    }
    try {
      return computeShares(amountCents, method, activeIds);
    } catch (error) {
      if (error instanceof SplitRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async assertActiveMember(groupId: number, memberId: number) {
    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId, leftAt: null },
    });
    if (!member) throw new BadRequestException('Unknown member');
  }

  /** Response shape, with each transaction's position in its series (e.g. 3 of 12). */
  private async present(
    groupId: number,
    rows: GroupTransactionRow[],
  ): Promise<GroupTransactionDto[]> {
    const seriesIds = [
      ...new Set(rows.flatMap((r) => (r.seriesId ? [r.seriesId] : []))),
    ];
    const positions = seriesPositions(
      seriesIds.length === 0
        ? []
        : await this.prisma.groupTransaction.findMany({
            where: { groupId, seriesId: { in: seriesIds } },
            select: { id: true, seriesId: true, month: true },
          }),
    );

    return rows.map(({ seriesId, paidBy, shares, ...row }) => ({
      ...row,
      paidBy: paidBy ? { memberId: paidBy.id, name: paidBy.user.name } : null,
      series: (seriesId && positions.get(seriesId)?.get(row.id)) || null,
      shares: shares.map((s) => ({
        memberId: s.member.id,
        name: s.member.user.name,
        amountCents: s.amountCents,
      })),
    }));
  }
}
