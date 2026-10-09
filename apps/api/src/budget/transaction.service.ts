import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import { assertUsablePaymentMethod } from '../payment-methods/payment-method-access.js';
import { type Db, inTransaction, runWrites } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generatePersonal } from '../recurrence/generate.js';
import {
  adjustmentColumns,
  adjustmentOf,
  generationTarget,
  projectAmounts,
} from '../recurrence/recurrence.js';
import { RecurrenceService } from '../recurrence/recurrence.service.js';
import { assertWritableCategories } from './category-access.js';
import type {
  CreateTransactionDto,
  RecurrenceScope,
  SeriesEndDto,
  TransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { addMonths } from './month.js';
import {
  assertRecurrenceInput,
  planSeriesEnd,
  recurrencesBySeries,
  reproject,
  resolveAdjustment,
  sameAdjustment,
  seriesPositions,
} from './series.js';

const transactionSelect = {
  id: true,
  month: true,
  description: true,
  plannedCents: true,
  realizedCents: true,
  seriesId: true,
  dueDay: true,
  paymentUrl: true,
  paymentMethod: {
    select: { id: true, name: true, type: true, dueDay: true, active: true },
  },
  category: {
    select: {
      id: true,
      name: true,
      active: true,
      position: true,
      group: {
        select: {
          id: true,
          name: true,
          kind: true,
          active: true,
          position: true,
        },
      },
    },
  },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

/** The payment method's due day, or else the launch's own. */
const effectiveDueDay = (t: TransactionRow) =>
  t.paymentMethod?.dueDay ?? t.dueDay;

/** Due day first (none last), then the grid's order. */
function byStatementOrder(a: TransactionRow, b: TransactionRow): number {
  const day = (t: TransactionRow) => effectiveDueDay(t) ?? 32;
  return (
    day(a) - day(b) ||
    a.category.group.position - b.category.group.position ||
    a.category.position - b.category.position ||
    a.id - b.id
  );
}

/**
 * Transactions ("lançamentos") behind the statement and the grid: planned
 * amounts per category and month, optionally realized with another amount and
 * grouped in recurring series. Everything is scoped by the owner; another
 * user's transaction is a 404. `create`, `update` and `remove` take an optional
 * `tx` to run inside a larger transaction (the dashboard's plan).
 */
@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrences: RecurrenceService,
  ) {}

  async list(userId: number, month: string): Promise<TransactionDto[]> {
    await this.recurrences.ensureForUser(userId, month);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, month },
      select: transactionSelect,
    });
    return this.present(userId, rows.sort(byStatementOrder));
  }

  /** The month's transactions paid with a payment method (its invoice). */
  async listByPaymentMethod(
    userId: number,
    paymentMethodId: number,
    month: string,
  ): Promise<TransactionDto[]> {
    await this.recurrences.ensureForUser(userId, month);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, paymentMethodId, month },
      select: transactionSelect,
    });
    return this.present(userId, rows.sort(byStatementOrder));
  }

  /**
   * Creates one occurrence per month; several share a new series. With
   * `openEnded` or a scheduled `adjustment` the series gets a rule
   * (`Recurrence`) and its months are created by `generatePersonal`, now up to
   * the horizon (or the end) and later as months are read.
   */
  async create(
    userId: number,
    {
      categoryId,
      month,
      description,
      plannedCents,
      repeatMonths = 1,
      openEnded = false,
      adjustment,
      dueDay = null,
      paymentUrl = null,
      paymentMethodId = null,
    }: CreateTransactionDto,
    tx?: Db,
  ): Promise<TransactionDto[]> {
    const db = tx ?? this.prisma;
    assertRecurrenceInput(repeatMonths, openEnded, adjustment !== undefined);
    await assertWritableCategories(db, userId, [categoryId]);
    if (paymentMethodId !== null) {
      await this.assertExpense(db, userId, categoryId);
      await assertUsablePaymentMethod(db, userId, paymentMethodId);
    }
    if (openEnded || adjustment) {
      const rows = await inTransaction(this.prisma, tx, async (t) => {
        const seriesId = randomUUID();
        await t.transaction.create({
          data: {
            userId,
            categoryId,
            month,
            description: description ?? null,
            plannedCents,
            seriesId,
            dueDay,
            paymentUrl,
            paymentMethodId,
          },
        });
        const endMonth = openEnded ? null : addMonths(month, repeatMonths - 1);
        const rule = await t.recurrence.create({
          data: {
            userId,
            seriesId,
            endMonth,
            generatedUntil: month,
            ...adjustmentColumns(resolveAdjustment(adjustment, month)),
          },
        });
        await generatePersonal(t, rule.id, endMonth ?? generationTarget(month));
        return t.transaction.findMany({
          where: { userId, seriesId },
          orderBy: [{ month: 'asc' }, { id: 'asc' }],
          select: transactionSelect,
        });
      });
      return this.present(userId, rows, db);
    }
    const seriesId = repeatMonths > 1 ? randomUUID() : null;
    const rows = (await runWrites(this.prisma, tx, (w) =>
      Array.from({ length: repeatMonths }, (_, i) =>
        w.transaction.create({
          data: {
            userId,
            categoryId,
            month: addMonths(month, i),
            description: description ?? null,
            plannedCents,
            seriesId,
            dueDay,
            paymentUrl,
            paymentMethodId,
          },
          select: transactionSelect,
        }),
      ),
    )) as TransactionRow[];
    return this.present(userId, rows, db);
  }

  /**
   * Changes the transaction and, with `FOLLOWING`, the later occurrences of its
   * series that are still pending (earlier and realized ones are kept).
   */
  async update(
    userId: number,
    id: number,
    {
      scope = 'ONE',
      categoryId,
      description,
      plannedCents,
      dueDay,
      paymentUrl,
      paymentMethodId,
    }: UpdateTransactionDto,
    tx?: Db,
  ): Promise<TransactionDto> {
    const db = tx ?? this.prisma;
    const current = await this.find(userId, id, db);
    if (!current.category.active || !current.category.group.active) {
      throw new BadRequestException('Category is inactive');
    }
    const categoryChanges =
      categoryId !== undefined && categoryId !== current.category.id;
    if (categoryChanges) {
      await assertWritableCategories(db, userId, [categoryId]);
    }
    const currentMethodId = current.paymentMethod?.id ?? null;
    const methodId =
      paymentMethodId === undefined ? currentMethodId : paymentMethodId;
    if (methodId !== null) {
      if (categoryChanges) await this.assertExpense(db, userId, categoryId);
      else if (current.category.group.kind !== 'EXPENSE') {
        throw new BadRequestException('Only expenses have a payment method');
      }
      // Keeping a method that was inactivated afterwards is fine
      if (methodId !== currentMethodId) {
        await assertUsablePaymentMethod(db, userId, methodId);
      }
    }
    // `undefined` leaves a field as is, `null` clears an optional one
    const data = {
      categoryId,
      description,
      plannedCents,
      dueDay,
      paymentUrl,
      paymentMethodId,
    };
    // With a scheduled adjustment, a new amount is the base the later
    // occurrences are projected from (each gets its own amount)
    const projected =
      plannedCents !== undefined && scope === 'FOLLOWING'
        ? await this.projectFollowing(db, userId, current, plannedCents)
        : [];
    const [updated] = (await runWrites(this.prisma, tx, (w) => [
      w.transaction.update({
        where: { id },
        data,
        select: transactionSelect,
      }),
      ...this.following(userId, current, scope).map((where) =>
        w.transaction.updateMany({
          where,
          data:
            projected.length > 0 ? { ...data, plannedCents: undefined } : data,
        }),
      ),
      ...projected.map(({ id: followingId, plannedCents: amount }) =>
        w.transaction.update({
          where: { id: followingId },
          data: { plannedCents: amount },
        }),
      ),
    ])) as [TransactionRow];
    return (await this.present(userId, [updated], db))[0];
  }

  /**
   * Deletes the transaction and, with `FOLLOWING`, the later pending ones of
   * its series. A series with a rule then ends at the last occurrence left
   * (or loses the rule when none is left), so no new months come back.
   */
  async remove(
    userId: number,
    id: number,
    scope: RecurrenceScope = 'ONE',
    tx?: Db,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const current = await this.find(userId, id, db);
    const rule =
      scope === 'FOLLOWING' && current.seriesId
        ? await db.recurrence.findFirst({
            where: { userId, seriesId: current.seriesId },
          })
        : null;
    const following = this.following(userId, current, scope);
    const left = rule
      ? await db.transaction.findFirst({
          where: {
            userId,
            seriesId: current.seriesId,
            id: { not: id },
            NOT: following,
          },
          orderBy: [{ month: 'desc' }, { id: 'desc' }],
          select: { month: true },
        })
      : null;
    await runWrites(this.prisma, tx, (w) => [
      w.transaction.delete({ where: { id } }),
      ...following.map((where) => w.transaction.deleteMany({ where })),
      ...(rule
        ? [
            left
              ? w.recurrence.update({
                  where: { id: rule.id },
                  data: { endMonth: left.month },
                })
              : w.recurrence.delete({ where: { id: rule.id } }),
          ]
        : []),
    ]);
  }

  /**
   * Moves the series' last month to `untilMonth`: later months get copies of
   * the last occurrence kept (pending), or the pending occurrences after it go.
   * A plain launch becomes a series when extended.
   */
  async setSeriesEnd(
    userId: number,
    id: number,
    { untilMonth, adjustment }: SeriesEndDto,
  ): Promise<TransactionDto[]> {
    const current = await this.find(userId, id);
    const rule = current.seriesId
      ? await this.prisma.recurrence.findFirst({
          where: { userId, seriesId: current.seriesId },
        })
      : null;
    if (rule || untilMonth === null || adjustment) {
      return this.setRecurrence(userId, current, rule, untilMonth, adjustment);
    }
    const occurrences = current.seriesId
      ? await this.prisma.transaction.findMany({
          where: { userId, seriesId: current.seriesId },
          select: { id: true, month: true, realizedCents: true },
        })
      : [current];
    const plan = planSeriesEnd(
      occurrences.map((o) => ({
        id: o.id,
        month: o.month,
        settled: o.realizedCents !== null,
      })),
      untilMonth,
    );
    const template = await this.prisma.transaction.findUniqueOrThrow({
      where: { id: plan.templateId },
      include: {
        category: {
          select: { active: true, group: { select: { active: true } } },
        },
      },
    });
    const { category } = template;
    if (
      plan.addMonths.length > 0 &&
      !(category.active && category.group.active)
    ) {
      throw new BadRequestException('Category is inactive');
    }
    const seriesId =
      current.seriesId ?? (plan.addMonths.length > 0 ? randomUUID() : null);
    await this.prisma.$transaction([
      ...(seriesId && !current.seriesId
        ? [
            this.prisma.transaction.update({
              where: { id },
              data: { seriesId },
            }),
          ]
        : []),
      this.prisma.transaction.deleteMany({
        where: { userId, id: { in: plan.removeIds } },
      }),
      ...plan.addMonths.map((month) =>
        this.prisma.transaction.create({
          data: {
            userId,
            categoryId: template.categoryId,
            month,
            description: template.description,
            plannedCents: template.plannedCents,
            seriesId,
            dueDay: template.dueDay,
            paymentUrl: template.paymentUrl,
            paymentMethodId: template.paymentMethodId,
          },
        }),
      ),
    ]);
    const rows = await this.prisma.transaction.findMany({
      where: seriesId ? { userId, seriesId } : { userId, id },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: transactionSelect,
    });
    return this.present(userId, rows);
  }

  /**
   * `setSeriesEnd` of a series with a rule (or getting one): the end may be
   * `null` (no end) and is not bound to `MAX_REPEAT_MONTHS`, since months are
   * created as they are read. Pending occurrences after the end go (409 if a
   * realized one would); a changed adjustment recalculates the pending
   * occurrences after the current month (`reprojectionBase`).
   */
  private async setRecurrence(
    userId: number,
    current: TransactionRow,
    rule: { id: number; adjustPercentBp: number | null } | null,
    untilMonth: string | null,
    adjustment: SeriesEndDto['adjustment'],
  ): Promise<TransactionDto[]> {
    const seriesId = current.seriesId ?? randomUUID();
    await this.prisma.$transaction(async (tx) => {
      if (!current.seriesId) {
        await tx.transaction.update({
          where: { id: current.id },
          data: { seriesId },
        });
      }
      const occurrences = await tx.transaction.findMany({
        where: { userId, seriesId },
        orderBy: [{ month: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          month: true,
          plannedCents: true,
          realizedCents: true,
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
      if (after.some((o) => o.realizedCents !== null)) {
        throw new ConflictException(
          'An occurrence after untilMonth is already settled',
        );
      }
      const kept = occurrences.filter((o) => !after.includes(o));
      const last = kept[kept.length - 1].month;
      if (untilMonth === null || untilMonth > last) {
        const { category } = current;
        if (!category.active || !category.group.active) {
          throw new BadRequestException('Category is inactive');
        }
      }
      await tx.transaction.deleteMany({
        where: { userId, id: { in: after.map((o) => o.id) } },
      });

      const stored = rule
        ? adjustmentOf(
            await tx.recurrence.findUniqueOrThrow({ where: { id: rule.id } }),
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
            amountCents: o.plannedCents,
            settled: o.realizedCents !== null,
          })),
          next,
        );
        for (const { id, amountCents } of changes) {
          await tx.transaction.update({
            where: { id },
            data: { plannedCents: amountCents },
          });
        }
      }
      const data = {
        endMonth: untilMonth,
        generatedUntil: last,
        ...adjustmentColumns(next),
      };
      const saved = rule
        ? await tx.recurrence.update({ where: { id: rule.id }, data })
        : await tx.recurrence.create({ data: { userId, seriesId, ...data } });
      await generatePersonal(
        tx,
        saved.id,
        generationTarget(untilMonth ?? undefined),
      );
    });
    const rows = await this.prisma.transaction.findMany({
      where: { userId, seriesId },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: transactionSelect,
    });
    return this.present(userId, rows);
  }

  /**
   * The amounts of the later pending occurrences when `current` changes to
   * `plannedCents` in a series with a scheduled adjustment (empty otherwise:
   * they all get the same amount).
   */
  private async projectFollowing(
    db: Db,
    userId: number,
    current: TransactionRow,
    plannedCents: number,
  ): Promise<{ id: number; plannedCents: number }[]> {
    if (!current.seriesId) return [];
    const rule = await db.recurrence.findFirst({
      where: { userId, seriesId: current.seriesId },
    });
    const adjustment = adjustmentOf(rule);
    if (!adjustment) return [];
    const rows = await db.transaction.findMany({
      where: this.following(userId, current, 'FOLLOWING')[0],
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: { id: true, month: true },
    });
    const amounts = projectAmounts(
      plannedCents,
      current.month,
      rows.map((r) => r.month),
      adjustment,
    );
    return rows.map((r, i) => ({ id: r.id, plannedCents: amounts[i] }));
  }

  /** Marks as realized with the amount actually paid or received; `null` undoes it. */
  async setRealized(
    userId: number,
    id: number,
    realizedCents: number | null,
  ): Promise<TransactionDto> {
    await this.find(userId, id);
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { realizedCents },
      select: transactionSelect,
    });
    return (await this.present(userId, [updated]))[0];
  }

  /** Payment methods are for expenses only (400 for an income category). */
  private async assertExpense(db: Db, userId: number, categoryId: number) {
    const category = await db.category.findFirst({
      where: { id: categoryId, userId },
      select: { group: { select: { kind: true } } },
    });
    if (category?.group.kind !== 'EXPENSE') {
      throw new BadRequestException('Only expenses have a payment method');
    }
  }

  private async find(
    userId: number,
    id: number,
    db: Db = this.prisma,
  ): Promise<TransactionRow> {
    const row = await db.transaction.findFirst({
      where: { id, userId },
      select: transactionSelect,
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  /** Filter for the later pending occurrences a `FOLLOWING` change also reaches. */
  private following(
    userId: number,
    current: TransactionRow,
    scope: RecurrenceScope,
  ): Prisma.TransactionWhereInput[] {
    if (scope !== 'FOLLOWING' || !current.seriesId) return [];
    return [
      {
        userId,
        seriesId: current.seriesId,
        month: { gte: current.month },
        realizedCents: null,
        id: { not: current.id },
      },
    ];
  }

  /** Response shape, with each transaction's position in its series (e.g. 3 of 12). */
  private async present(
    userId: number,
    rows: TransactionRow[],
    db: Db = this.prisma,
  ): Promise<TransactionDto[]> {
    const seriesIds = [
      ...new Set(rows.flatMap((r) => (r.seriesId ? [r.seriesId] : []))),
    ];
    const [occurrences, rules] =
      seriesIds.length === 0
        ? [[], []]
        : await Promise.all([
            db.transaction.findMany({
              where: { userId, seriesId: { in: seriesIds } },
              select: { id: true, seriesId: true, month: true },
            }),
            db.recurrence.findMany({
              where: { userId, seriesId: { in: seriesIds } },
            }),
          ]);
    const positions = seriesPositions(occurrences, recurrencesBySeries(rules));

    return rows.map((full) => {
      const { seriesId, category, dueDay, ...row } = full;
      const { position: _position, group, ...categoryFields } = category;
      const { position: _groupPosition, ...groupFields } = group;
      return {
        ...row,
        series: (seriesId && positions.get(seriesId)?.get(row.id)) || null,
        category: { ...categoryFields, group: groupFields },
        ownDueDay: dueDay,
        dueDay: effectiveDueDay(full),
      };
    });
  }
}
