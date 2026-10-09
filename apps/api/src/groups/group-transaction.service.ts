import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  RecurrenceScope,
  SeriesEndDto,
} from '../budget/dto/transaction.dto.js';
import { addMonths } from '../budget/month.js';
import {
  assertRecurrenceInput,
  planSeriesEnd,
  recurrencesBySeries,
  reproject,
  resolveAdjustment,
  sameAdjustment,
  seriesPositions,
} from '../budget/series.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateGroup } from '../recurrence/generate.js';
import {
  adjustmentColumns,
  adjustmentOf,
  generationTarget,
  projectAmounts,
} from '../recurrence/recurrence.js';
import { RecurrenceService } from '../recurrence/recurrence.service.js';
import type {
  CreateGroupTransactionDto,
  GroupBalanceDto,
  GroupTransactionDto,
  SetSettlementDto,
  UpdateGroupTransactionDto,
} from './dto/group-transaction.dto.js';
import { activeMembers, assertMember } from './group-access.js';
import { assertUsableGroupCategory } from './group-category-access.js';
import { divideCopy } from './resplit.js';
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
  dueDay: true,
  paymentUrl: true,
  category: { select: { id: true, name: true } },
  splitMethod: { select: { id: true, name: true, type: true } },
  paidBy: memberName,
  shares: {
    orderBy: { memberId: 'asc' },
    select: { amountCents: true, settledAt: true, member: memberName },
  },
} satisfies Prisma.GroupTransactionSelect;

type GroupTransactionRow = Prisma.GroupTransactionGetPayload<{
  select: typeof groupTransactionSelect;
}>;

/**
 * The member who receives the money of a share: an expense's payer is paid
 * back by the share's member; an income's receiver passes the share on.
 */
export const receiverOf = (
  kind: GroupTransactionRow['kind'],
  payerMemberId: number,
  shareMemberId: number,
) => (kind === 'EXPENSE' ? payerMemberId : shareMemberId);

/** 409 for changes that would drop confirmed shares. */
const settledConflict = () =>
  new ConflictException('Undo the confirmed shares first');

/** Launches with a due day first, by day; then by creation. */
type DueDayOrdered = { id: number; dueDay: number | null };
const byDueDay = (a: DueDayOrdered, b: DueDayOrdered) =>
  (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.id - b.id;

/**
 * The group's incomes and expenses ("lançamentos"). Each one is divided by a
 * split rule into per-member shares, stored with it so later rule changes
 * don't rewrite history. Paying (or receiving) it records which member did.
 * Only active members get in; anyone else gets a 404.
 */
@Injectable()
export class GroupTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrences: RecurrenceService,
  ) {}

  async list(
    userId: number,
    groupId: number,
    month: string,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    await this.recurrences.ensureForGroup(groupId, month);
    const rows = await this.prisma.groupTransaction.findMany({
      where: { groupId, month },
      orderBy: { id: 'asc' },
      select: groupTransactionSelect,
    });
    return this.present(groupId, rows.sort(byDueDay));
  }

  /**
   * Creates one occurrence per month; several share a new series. With
   * `openEnded` or a scheduled `adjustment` the series gets a rule
   * (`GroupRecurrence`) and its later months are created by `generateGroup`.
   */
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
      openEnded = false,
      adjustment,
      dueDay = null,
      paymentUrl = null,
      categoryId = null,
    }: CreateGroupTransactionDto,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    assertRecurrenceInput(repeatMonths, openEnded, adjustment !== undefined);
    if (categoryId !== null) {
      await assertUsableGroupCategory(this.prisma, groupId, categoryId, kind);
    }
    const shares = await this.shares(groupId, splitMethodId, amountCents);
    if (paidByMemberId !== null) {
      await this.assertActiveMember(groupId, paidByMemberId);
    }
    if (adjustment) await this.assertAdjustable(groupId, splitMethodId);
    if (openEnded || adjustment) {
      const seriesId = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.groupTransaction.create({
          data: {
            groupId,
            kind,
            description,
            month,
            amountCents,
            splitMethodId,
            paidByMemberId,
            createdById: userId,
            seriesId,
            dueDay,
            paymentUrl,
            categoryId,
            shares: { create: shares },
          },
        });
        const endMonth = openEnded ? null : addMonths(month, repeatMonths - 1);
        const rule = await tx.groupRecurrence.create({
          data: {
            groupId,
            seriesId,
            endMonth,
            generatedUntil: month,
            ...adjustmentColumns(resolveAdjustment(adjustment, month)),
          },
        });
        await generateGroup(tx, rule.id, endMonth ?? generationTarget(month));
      });
      return this.present(groupId, await this.seriesRows(groupId, seriesId));
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
            dueDay,
            paymentUrl,
            categoryId,
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
      dueDay,
      paymentUrl,
      categoryId,
    }: UpdateGroupTransactionDto,
  ): Promise<GroupTransactionDto> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    // The category must match the launch's kind, the new one or the kept one
    const nextCategoryId =
      categoryId === undefined ? (current.category?.id ?? null) : categoryId;
    if (
      nextCategoryId !== null &&
      (categoryId !== undefined ||
        (kind !== undefined && kind !== current.kind))
    ) {
      await assertUsableGroupCategory(
        this.prisma,
        groupId,
        nextCategoryId,
        kind ?? current.kind,
        current.category?.id ?? null,
      );
    }
    const following = await this.followingRows(groupId, current, scope);
    const ids = [id, ...following.map((r) => r.id)];
    let shares: MemberShare[] | undefined;
    // With a scheduled adjustment, a new amount is the base the later
    // occurrences are projected from (each with its own amount and shares)
    const projected = new Map<
      number,
      { amountCents: number; shares: MemberShare[] }
    >();
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
      if (current.shares.some((s) => s.settledAt !== null)) {
        throw settledConflict();
      }
      if (amountCents !== undefined && following.length > 0) {
        const adjustment = adjustmentOf(
          await this.prisma.groupRecurrence.findFirst({
            where: { groupId, seriesId: current.seriesId! },
          }),
        );
        if (adjustment) {
          const amounts = projectAmounts(
            amountCents,
            current.month,
            following.map((r) => r.month),
            adjustment,
          );
          for (const [i, row] of following.entries()) {
            projected.set(row.id, {
              amountCents: amounts[i],
              shares: await this.shares(groupId, methodId, amounts[i]),
            });
          }
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupTransaction.updateMany({
        where: { id: { in: ids } },
        data: {
          kind,
          description,
          amountCents: projected.size > 0 ? undefined : amountCents,
          splitMethodId,
          dueDay,
          paymentUrl,
          categoryId,
        },
      });
      if (projected.size > 0) {
        await tx.groupTransaction.update({
          where: { id },
          data: { amountCents },
        });
        for (const [rowId, next] of projected) {
          await tx.groupTransaction.update({
            where: { id: rowId },
            data: { amountCents: next.amountCents },
          });
        }
      }
      if (shares) {
        await tx.groupTransactionShare.deleteMany({
          where: { transactionId: { in: ids } },
        });
        await tx.groupTransactionShare.createMany({
          data: ids.flatMap((transactionId) =>
            (projected.get(transactionId)?.shares ?? shares).map((s) => ({
              ...s,
              transactionId,
            })),
          ),
        });
      }
    });
    return (await this.present(groupId, [await this.find(groupId, id)]))[0];
  }

  /**
   * Deletes the transaction and, with `FOLLOWING`, the later pending ones of
   * its series. A series with a rule then ends at the last occurrence left
   * (or loses the rule when none is left), so no new months come back.
   */
  async remove(
    userId: number,
    groupId: number,
    id: number,
    scope: RecurrenceScope = 'ONE',
  ): Promise<void> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    const following = await this.followingRows(groupId, current, scope);
    const ids = [id, ...following.map((r) => r.id)];
    const rule =
      scope === 'FOLLOWING' && current.seriesId
        ? await this.prisma.groupRecurrence.findFirst({
            where: { groupId, seriesId: current.seriesId },
          })
        : null;
    const left = rule
      ? await this.prisma.groupTransaction.findFirst({
          where: { groupId, seriesId: current.seriesId, id: { notIn: ids } },
          orderBy: [{ month: 'desc' }, { id: 'desc' }],
          select: { month: true },
        })
      : null;
    await this.prisma.$transaction([
      this.prisma.groupTransaction.deleteMany({
        where: { id: { in: ids } },
      }),
      ...(rule
        ? [
            left
              ? this.prisma.groupRecurrence.update({
                  where: { id: rule.id },
                  data: { endMonth: left.month },
                })
              : this.prisma.groupRecurrence.delete({ where: { id: rule.id } }),
          ]
        : []),
    ]);
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
    { untilMonth, adjustment }: SeriesEndDto,
  ): Promise<GroupTransactionDto[]> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    const rule = current.seriesId
      ? await this.prisma.groupRecurrence.findFirst({
          where: { groupId, seriesId: current.seriesId },
        })
      : null;
    if (rule || untilMonth === null || adjustment) {
      return this.setRecurrence(
        groupId,
        current,
        rule?.id ?? null,
        untilMonth,
        adjustment,
      );
    }
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
            dueDay: template.dueDay,
            paymentUrl: template.paymentUrl,
            categoryId: template.categoryId,
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

  /**
   * `setSeriesEnd` of a series with a rule (or getting one): the end may be
   * `null` (no end) and is not bound to `MAX_REPEAT_MONTHS`. Unpaid
   * occurrences after the end go (409 if a paid one would); a changed
   * adjustment recalculates the unpaid occurrences after the current month,
   * dividing them again.
   */
  private async setRecurrence(
    groupId: number,
    current: GroupTransactionRow,
    ruleId: number | null,
    untilMonth: string | null,
    adjustment: SeriesEndDto['adjustment'],
  ): Promise<GroupTransactionDto[]> {
    if (adjustment && current.splitMethod) {
      await this.assertAdjustable(groupId, current.splitMethod.id);
    }
    const seriesId = current.seriesId ?? randomUUID();
    await this.prisma.$transaction(async (tx) => {
      if (!current.seriesId) {
        await tx.groupTransaction.update({
          where: { id: current.id },
          data: { seriesId },
        });
      }
      const occurrences = await tx.groupTransaction.findMany({
        where: { groupId, seriesId },
        orderBy: [{ month: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          month: true,
          amountCents: true,
          paidByMemberId: true,
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
      const first = occurrences[0];
      if (untilMonth !== null && untilMonth < first.month) {
        throw new BadRequestException(
          'untilMonth must not be before the first occurrence',
        );
      }
      const after = occurrences.filter(
        (o) => untilMonth !== null && o.month > untilMonth,
      );
      if (after.some((o) => o.paidByMemberId !== null)) {
        throw new ConflictException(
          'An occurrence after untilMonth is already settled',
        );
      }
      await tx.groupTransaction.deleteMany({
        where: { groupId, id: { in: after.map((o) => o.id) } },
      });
      const kept = occurrences.filter((o) => !after.includes(o));

      const stored = ruleId
        ? adjustmentOf(
            await tx.groupRecurrence.findUniqueOrThrow({
              where: { id: ruleId },
            }),
          )
        : null;
      const next =
        adjustment === undefined
          ? stored
          : resolveAdjustment(adjustment ?? undefined, first.month);
      if (!sameAdjustment(stored, next)) {
        const changes = reproject(
          kept.map((o) => ({
            id: o.id,
            month: o.month,
            amountCents: o.amountCents,
            settled: o.paidByMemberId !== null,
          })),
          next,
        );
        const members = await tx.groupMember.findMany({
          where: { groupId, leftAt: null },
          select: { id: true },
        });
        const activeIds = members.map((m) => m.id);
        const byId = new Map(kept.map((o) => [o.id, o]));
        for (const change of changes) {
          const o = byId.get(change.id)!;
          const shares = divideCopy(
            change.amountCents,
            o.splitMethod,
            o.shares,
            activeIds,
          );
          await tx.groupTransaction.update({
            where: { id: o.id },
            data: {
              amountCents: shares.reduce((t, s) => t + s.amountCents, 0),
              shares: { deleteMany: {}, create: shares },
            },
          });
        }
      }
      const data = {
        endMonth: untilMonth,
        generatedUntil: kept[kept.length - 1].month,
        ...adjustmentColumns(next),
      };
      const saved = ruleId
        ? await tx.groupRecurrence.update({ where: { id: ruleId }, data })
        : await tx.groupRecurrence.create({
            data: { groupId, seriesId, ...data },
          });
      await generateGroup(
        tx,
        saved.id,
        generationTarget(untilMonth ?? undefined),
      );
    });
    return this.present(groupId, await this.seriesRows(groupId, seriesId));
  }

  /**
   * Records who paid (or received) it; `null` makes it pending again. Another
   * payer, or none, needs the confirmed shares undone first (409).
   */
  async setPayment(
    userId: number,
    groupId: number,
    id: number,
    memberId: number | null,
  ): Promise<GroupTransactionDto> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    if (memberId !== null) await this.assertActiveMember(groupId, memberId);
    if (
      memberId !== (current.paidBy?.id ?? null) &&
      current.shares.some((s) => s.settledAt !== null)
    ) {
      throw settledConflict();
    }
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
    const me = await assertMember(this.prisma, userId, groupId);
    await this.recurrences.ensureForGroup(groupId, month);
    const transactions = await this.prisma.groupTransaction.findMany({
      where: { groupId, month },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        kind: true,
        description: true,
        amountCents: true,
        paidByMemberId: true,
        dueDay: true,
        shares: {
          orderBy: { memberId: 'asc' },
          select: { memberId: true, amountCents: true, settledAt: true },
        },
      },
    });
    const active = await activeMembers(this.prisma, groupId);
    const balance = computeGroupBalance(
      transactions.map((t) => ({
        ...t,
        shares: t.shares.map((s) => ({ ...s, settled: s.settledAt !== null })),
      })),
      active.map((m) => m.id),
    );
    // Every share someone owes the payer (or the receiver owes its member)
    const settlements = transactions.sort(byDueDay).flatMap((t) =>
      t.paidByMemberId === null
        ? []
        : t.shares
            .filter((s) => s.memberId !== t.paidByMemberId)
            .map((s) => ({
              transactionId: t.id,
              kind: t.kind,
              description: t.description,
              memberId: s.memberId,
              payerMemberId: t.paidByMemberId!,
              amountCents: s.amountCents,
              settled: s.settledAt !== null,
              canSettle:
                receiverOf(t.kind, t.paidByMemberId!, s.memberId) === me.id,
            })),
    );
    const members = await this.prisma.groupMember.findMany({
      where: { id: { in: balance.members.map((m) => m.memberId) } },
      select: { id: true, leftAt: true, user: { select: { name: true } } },
    });
    const byId = new Map(members.map((m) => [m.id, m]));
    return {
      month,
      ...balance,
      settlements,
      members: balance.members.map((m) => ({
        ...m,
        name: byId.get(m.memberId)?.user.name ?? '',
        active: byId.get(m.memberId)?.leftAt === null,
      })),
    };
  }

  /**
   * Confirms (or undoes) that members' shares of paid transactions were paid
   * back. Only whoever receives the money confirms: the payer of an expense,
   * the share's own member for an income (403 for anyone else). All or
   * nothing: one invalid item rejects the whole request.
   */
  async setSettlement(
    userId: number,
    groupId: number,
    { items, settled }: SetSettlementDto,
  ): Promise<void> {
    const me = await assertMember(this.prisma, userId, groupId);
    const ids = [...new Set(items.map((i) => i.transactionId))];
    const transactions = await this.prisma.groupTransaction.findMany({
      where: { groupId, id: { in: ids } },
      select: {
        id: true,
        kind: true,
        paidByMemberId: true,
        shares: { select: { memberId: true } },
      },
    });
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const { transactionId, memberId } of items) {
      const t = byId.get(transactionId);
      if (!t || !t.shares.some((s) => s.memberId === memberId)) {
        throw new NotFoundException('Share not found');
      }
      if (t.paidByMemberId === null) {
        throw new BadRequestException('Transaction is pending');
      }
      if (t.paidByMemberId === memberId) {
        throw new BadRequestException(
          "The payer's own share has no settlement",
        );
      }
      if (receiverOf(t.kind, t.paidByMemberId, memberId) !== me.id) {
        throw new ForbiddenException(
          'Only who receives the money can confirm it',
        );
      }
    }
    const settledAt = settled ? new Date() : null;
    await this.prisma.$transaction(
      items.map(({ transactionId, memberId }) =>
        this.prisma.groupTransactionShare.updateMany({
          where: {
            transactionId,
            memberId,
            // Keeps the first confirmation date
            ...(settled && { settledAt: null }),
          },
          data: { settledAt },
        }),
      ),
    );
  }

  private async find(groupId: number, id: number) {
    const row = await this.prisma.groupTransaction.findFirst({
      where: { id, groupId },
      select: groupTransactionSelect,
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  /** Later pending occurrences of the series a `FOLLOWING` change also reaches, by month. */
  private followingRows(
    groupId: number,
    current: GroupTransactionRow,
    scope: RecurrenceScope,
  ): Promise<{ id: number; month: string }[]> {
    if (scope !== 'FOLLOWING' || !current.seriesId) return Promise.resolve([]);
    return this.prisma.groupTransaction.findMany({
      where: {
        groupId,
        seriesId: current.seriesId,
        month: { gte: current.month },
        paidByMemberId: null,
        id: { not: current.id },
      },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: { id: true, month: true },
    });
  }

  private seriesRows(groupId: number, seriesId: string) {
    return this.prisma.groupTransaction.findMany({
      where: { groupId, seriesId },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: groupTransactionSelect,
    });
  }

  /**
   * A FIXED rule defines the amount itself, so it can't have a scheduled
   * adjustment (400).
   */
  private async assertAdjustable(groupId: number, splitMethodId: number) {
    const method = await this.prisma.splitMethod.findFirst({
      where: { id: splitMethodId, groupId },
      select: { type: true },
    });
    if (method?.type === 'FIXED') {
      throw new BadRequestException(
        'A fixed split cannot have a scheduled adjustment',
      );
    }
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
    const [occurrences, rules] =
      seriesIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.groupTransaction.findMany({
              where: { groupId, seriesId: { in: seriesIds } },
              select: { id: true, seriesId: true, month: true },
            }),
            this.prisma.groupRecurrence.findMany({
              where: { groupId, seriesId: { in: seriesIds } },
            }),
          ]);
    const positions = seriesPositions(occurrences, recurrencesBySeries(rules));

    return rows.map(({ seriesId, paidBy, shares, ...row }) => ({
      ...row,
      paidBy: paidBy ? { memberId: paidBy.id, name: paidBy.user.name } : null,
      series: (seriesId && positions.get(seriesId)?.get(row.id)) || null,
      shares: shares.map((s) => ({
        memberId: s.member.id,
        name: s.member.user.name,
        amountCents: s.amountCents,
        settled: s.settledAt !== null,
      })),
    }));
  }
}
