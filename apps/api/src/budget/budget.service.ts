import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { EntryKind, Prisma } from '../prisma/generated/client.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type BudgetSummary, computeSummary, sumByKind } from './balance.js';
import { assertWritableCategories } from './category-access.js';
import { DEFAULT_CATEGORIES } from './default-categories.js';
import { linkedShareCells } from './group-shares.js';
import type {
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';
import type { EntryDto } from './dto/save-entries.dto.js';
import { MAX_MONTH_SPAN, monthSpan } from './month.js';

const byPosition = { position: 'asc' } as const;

export const categorySelect = {
  id: true,
  name: true,
  position: true,
  active: true,
  description: true,
  dueDay: true,
} satisfies Prisma.CategorySelect;

export const groupSelect = {
  id: true,
  kind: true,
  name: true,
  position: true,
  active: true,
  goalPercent: true,
  categories: {
    orderBy: [byPosition, { id: 'asc' }],
    select: categorySelect,
  },
} satisfies Prisma.CategoryGroupSelect;

/**
 * Personal budget: category tree, the grid of planned amounts per category and
 * month (sums of transactions) and the balances. Every method takes the owner
 * from the auth context and scopes by it.
 */
@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's category tree (inactive items included), creating the default one on first access. */
  async categories(userId: number): Promise<CategoryGroupDto[]> {
    await this.ensureDefaults(userId);
    return this.prisma.categoryGroup.findMany({
      where: { userId },
      // Expenses first (enum order is alphabetical), as the dashboard shows them
      orderBy: [{ kind: 'asc' }, byPosition, { id: 'asc' }],
      select: groupSelect,
    });
  }

  /**
   * Planned amount and number of transactions of each non-empty cell in the
   * range, plus the user's shares of the groups linked to the category.
   */
  async entries(
    userId: number,
    from: string,
    to: string,
  ): Promise<MonthlyEntryDto[]> {
    const span = monthSpan(from, to);
    if (span < 1) throw new BadRequestException('from must not be after to');
    if (span > MAX_MONTH_SPAN) {
      throw new BadRequestException(
        `The range must span at most ${MAX_MONTH_SPAN} months`,
      );
    }
    const range = { gte: from, lte: to };
    const [cells, shares] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['month', 'categoryId'],
        where: { userId, month: range },
        orderBy: [{ month: 'asc' }, { categoryId: 'asc' }],
        _sum: { plannedCents: true },
        _count: { _all: true },
      }),
      linkedShareCells(this.prisma, userId, range),
    ]);
    const key = (c: { categoryId: number; month: string }) =>
      `${c.categoryId}:${c.month}`;
    const entries = new Map<string, MonthlyEntryDto>(
      cells.map((c) => [
        key(c),
        {
          categoryId: c.categoryId,
          month: c.month,
          amountCents: c._sum.plannedCents ?? 0,
          count: c._count._all,
          groupCents: 0,
        },
      ]),
    );
    // The user's shares of linked groups join the cell (read-only in the grid)
    for (const share of shares) {
      const entry = entries.get(key(share));
      if (entry) entry.groupCents = share.amountCents;
      else {
        entries.set(key(share), {
          categoryId: share.categoryId,
          month: share.month,
          amountCents: 0,
          count: 0,
          groupCents: share.amountCents,
        });
      }
    }
    return [...entries.values()].sort(
      (a, b) => a.month.localeCompare(b.month) || a.categoryId - b.categoryId,
    );
  }

  /**
   * Sets the planned amount of grid cells: creates the cell's transaction,
   * changes it, or deletes it (`0`). All or nothing: a category that isn't the
   * user's fails the whole save with 404 (no existence leak), an inactive one
   * (or one in an inactive type) with 400, and a cell holding several
   * transactions (edited in the statement) with 409.
   */
  async saveEntries(userId: number, entries: EntryDto[]): Promise<void> {
    await assertWritableCategories(
      this.prisma,
      userId,
      entries.map((e) => e.categoryId),
    );

    // Last write wins when the same cell appears twice in one request
    const key = (c: { categoryId: number; month: string }) =>
      `${c.categoryId}:${c.month}`;
    const cells = new Map(entries.map((e) => [key(e), e]));

    const existing = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [...cells.values()].map(({ categoryId, month }) => ({
          categoryId,
          month,
        })),
      },
      select: { id: true, categoryId: true, month: true },
    });
    const idsByCell = new Map<string, number[]>();
    for (const t of existing) {
      idsByCell.set(key(t), [...(idsByCell.get(key(t)) ?? []), t.id]);
    }
    if ([...idsByCell.values()].some((ids) => ids.length > 1)) {
      throw new ConflictException(
        'A cell has several transactions; edit them in the statement',
      );
    }

    const writes = [...cells.values()].flatMap(
      ({ categoryId, month, amountCents }) => {
        const [id] = idsByCell.get(key({ categoryId, month })) ?? [];
        if (id === undefined) {
          return amountCents === 0
            ? []
            : [
                this.prisma.transaction.create({
                  data: {
                    userId,
                    categoryId,
                    month,
                    plannedCents: amountCents,
                  },
                }),
              ];
        }
        return [
          amountCents === 0
            ? this.prisma.transaction.delete({ where: { id } })
            : this.prisma.transaction.update({
                where: { id },
                data: { plannedCents: amountCents },
              }),
        ];
      },
    );
    if (writes.length > 0) await this.prisma.$transaction(writes);
  }

  /** Balances from the effective amounts plus the user's linked group shares. */
  async summary(userId: number, month: string): Promise<BudgetSummary> {
    const [user, categories, previous, current, sharesBefore, sharesNow] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { initialBalanceCents: true },
        }),
        this.prisma.category.findMany({
          where: { userId },
          select: { id: true, group: { select: { kind: true } } },
        }),
        this.sumsByCategory(userId, { lt: month }),
        this.sumsByCategory(userId, { equals: month }),
        linkedShareCells(this.prisma, userId, { lt: month }),
        linkedShareCells(this.prisma, userId, { equals: month }),
      ]);
    const kindOf = new Map<number, EntryKind>(
      categories.map((c) => [c.id, c.group.kind]),
    );
    return computeSummary(
      month,
      user.initialBalanceCents,
      sumByKind([...previous, ...sharesBefore], kindOf),
      sumByKind([...current, ...sharesNow], kindOf),
    );
  }

  async setInitialBalance(
    userId: number,
    amountCents: number,
  ): Promise<{ amountCents: number }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { initialBalanceCents: amountCents },
      select: { initialBalanceCents: true },
    });
    return { amountCents: user.initialBalanceCents };
  }

  /**
   * Effective amount per category: what was realized, or the planned amount
   * while pending. A category may appear twice (once per state).
   */
  private async sumsByCategory(
    userId: number,
    month: { lt: string } | { equals: string },
  ) {
    const [realized, pending] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, month, realizedCents: { not: null } },
        _sum: { realizedCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, month, realizedCents: null },
        _sum: { plannedCents: true },
      }),
    ]);
    return [
      ...realized.map((r) => ({
        categoryId: r.categoryId,
        amountCents: r._sum.realizedCents ?? 0,
      })),
      ...pending.map((r) => ({
        categoryId: r.categoryId,
        amountCents: r._sum.plannedCents ?? 0,
      })),
    ];
  }

  /**
   * Creates the defaults once per user (the `budgetSeeded` flag, not the
   * current tree, says so: deleting every type must not bring them back).
   * Idempotent; a concurrent first access losing the race is fine.
   */
  private async ensureDefaults(userId: number): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { budgetSeeded: true },
    });
    if (user.budgetSeeded) return;
    try {
      await this.prisma.$transaction([
        // Fails the transaction (P2002 via the unique type names) if another
        // request seeded first; the flag flips together with the creates
        this.prisma.user.update({
          where: { id: userId },
          data: { budgetSeeded: true },
        }),
        ...DEFAULT_CATEGORIES.map((group, position) =>
          this.prisma.categoryGroup.create({
            data: {
              userId,
              kind: group.kind,
              name: group.name,
              position,
              categories: {
                create: group.categories.map((name, index) => ({
                  userId,
                  name,
                  position: index,
                })),
              },
            },
          }),
        ),
      ]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
}
