import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import { assertUsablePaymentMethod } from '../payment-methods/payment-method-access.js';
import { type Db, runWrites } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertWritableCategories } from './category-access.js';
import type {
  CreateTransactionDto,
  RecurrenceScope,
  TransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { addMonths } from './month.js';
import { planSeriesEnd, seriesPositions } from './series.js';

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
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number, month: string): Promise<TransactionDto[]> {
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
    const rows = await this.prisma.transaction.findMany({
      where: { userId, paymentMethodId, month },
      select: transactionSelect,
    });
    return this.present(userId, rows.sort(byStatementOrder));
  }

  /** Creates one occurrence per month; several share a new series. */
  async create(
    userId: number,
    {
      categoryId,
      month,
      description,
      plannedCents,
      repeatMonths = 1,
      dueDay = null,
      paymentUrl = null,
      paymentMethodId = null,
    }: CreateTransactionDto,
    tx?: Db,
  ): Promise<TransactionDto[]> {
    const db = tx ?? this.prisma;
    await assertWritableCategories(db, userId, [categoryId]);
    if (paymentMethodId !== null) {
      await this.assertExpense(db, userId, categoryId);
      await assertUsablePaymentMethod(db, userId, paymentMethodId);
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
    const [updated] = (await runWrites(this.prisma, tx, (w) => [
      w.transaction.update({
        where: { id },
        data,
        select: transactionSelect,
      }),
      ...this.following(userId, current, scope).map((where) =>
        w.transaction.updateMany({ where, data }),
      ),
    ])) as [TransactionRow];
    return (await this.present(userId, [updated], db))[0];
  }

  /** Deletes the transaction and, with `FOLLOWING`, the later pending ones of its series. */
  async remove(
    userId: number,
    id: number,
    scope: RecurrenceScope = 'ONE',
    tx?: Db,
  ): Promise<void> {
    const current = await this.find(userId, id, tx);
    await runWrites(this.prisma, tx, (w) => [
      w.transaction.delete({ where: { id } }),
      ...this.following(userId, current, scope).map((where) =>
        w.transaction.deleteMany({ where }),
      ),
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
    untilMonth: string,
  ): Promise<TransactionDto[]> {
    const current = await this.find(userId, id);
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
    const positions = seriesPositions(
      seriesIds.length === 0
        ? []
        : await db.transaction.findMany({
            where: { userId, seriesId: { in: seriesIds } },
            select: { id: true, seriesId: true, month: true },
          }),
    );

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
