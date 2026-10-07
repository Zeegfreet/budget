import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertWritableCategories } from './category-access.js';
import type {
  CreateTransactionDto,
  RecurrenceScope,
  TransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { addMonths } from './month.js';

const transactionSelect = {
  id: true,
  month: true,
  description: true,
  plannedCents: true,
  realizedCents: true,
  seriesId: true,
  category: {
    select: {
      id: true,
      name: true,
      dueDay: true,
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

/** Due day first (none last), then the grid's order. */
function byStatementOrder(a: TransactionRow, b: TransactionRow): number {
  const day = (t: TransactionRow) => t.category.dueDay ?? 32;
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
 * user's transaction is a 404.
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

  /** Creates one occurrence per month; several share a new series. */
  async create(
    userId: number,
    {
      categoryId,
      month,
      description,
      plannedCents,
      repeatMonths = 1,
    }: CreateTransactionDto,
  ): Promise<TransactionDto[]> {
    await assertWritableCategories(this.prisma, userId, [categoryId]);
    const seriesId = repeatMonths > 1 ? randomUUID() : null;
    const rows = await this.prisma.$transaction(
      Array.from({ length: repeatMonths }, (_, i) =>
        this.prisma.transaction.create({
          data: {
            userId,
            categoryId,
            month: addMonths(month, i),
            description: description ?? null,
            plannedCents,
            seriesId,
          },
          select: transactionSelect,
        }),
      ),
    );
    return this.present(userId, rows);
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
    }: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    const current = await this.find(userId, id);
    if (!current.category.active || !current.category.group.active) {
      throw new BadRequestException('Category is inactive');
    }
    if (categoryId !== undefined && categoryId !== current.category.id) {
      await assertWritableCategories(this.prisma, userId, [categoryId]);
    }
    // `undefined` leaves a field as is, `null` clears the description
    const data = { categoryId, description, plannedCents };
    const [updated] = await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id },
        data,
        select: transactionSelect,
      }),
      ...this.following(userId, current, scope).map((where) =>
        this.prisma.transaction.updateMany({ where, data }),
      ),
    ]);
    return (await this.present(userId, [updated]))[0];
  }

  /** Deletes the transaction and, with `FOLLOWING`, the later pending ones of its series. */
  async remove(
    userId: number,
    id: number,
    scope: RecurrenceScope = 'ONE',
  ): Promise<void> {
    const current = await this.find(userId, id);
    await this.prisma.$transaction([
      this.prisma.transaction.delete({ where: { id } }),
      ...this.following(userId, current, scope).map((where) =>
        this.prisma.transaction.deleteMany({ where }),
      ),
    ]);
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

  private async find(userId: number, id: number): Promise<TransactionRow> {
    const row = await this.prisma.transaction.findFirst({
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
  ): Promise<TransactionDto[]> {
    const seriesIds = [
      ...new Set(rows.flatMap((r) => (r.seriesId ? [r.seriesId] : []))),
    ];
    const members =
      seriesIds.length === 0
        ? []
        : await this.prisma.transaction.findMany({
            where: { userId, seriesId: { in: seriesIds } },
            orderBy: [{ month: 'asc' }, { id: 'asc' }],
            select: { id: true, seriesId: true },
          });
    const idsBySeries = new Map<string, number[]>();
    for (const m of members) {
      idsBySeries.set(m.seriesId!, [
        ...(idsBySeries.get(m.seriesId!) ?? []),
        m.id,
      ]);
    }

    return rows.map(({ seriesId, category, ...row }) => {
      const ids = seriesId ? idsBySeries.get(seriesId) : undefined;
      const { position: _position, group, ...categoryFields } = category;
      const { position: _groupPosition, ...groupFields } = group;
      return {
        ...row,
        series:
          ids && ids.length > 1
            ? { index: ids.indexOf(row.id) + 1, count: ids.length }
            : null,
        category: { ...categoryFields, group: groupFields },
      };
    });
  }
}
