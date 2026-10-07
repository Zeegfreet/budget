import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntryKind, Prisma } from '../prisma/generated/client.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type BudgetSummary, computeSummary, sumByKind } from './balance.js';
import { DEFAULT_CATEGORIES } from './default-categories.js';
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
 * Personal budget: category tree and one amount per category and month.
 * Every method takes the owner from the auth context and scopes by it.
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
    return this.prisma.monthlyEntry.findMany({
      where: { userId, month: { gte: from, lte: to } },
      orderBy: [{ month: 'asc' }, { categoryId: 'asc' }],
      select: { categoryId: true, month: true, amountCents: true },
    });
  }

  /**
   * Upserts the given cells; `0` clears one. All or nothing: a category that
   * isn't the user's fails the whole save with 404 (no existence leak), and an
   * inactive one (or one in an inactive type) with 400.
   */
  async saveEntries(userId: number, entries: EntryDto[]): Promise<void> {
    const categoryIds = [...new Set(entries.map((e) => e.categoryId))];
    const owned = await this.prisma.category.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { active: true, group: { select: { active: true } } },
    });
    if (owned.length !== categoryIds.length) {
      throw new NotFoundException('Category not found');
    }
    if (owned.some((c) => !c.active || !c.group.active)) {
      throw new BadRequestException('Category is inactive');
    }

    // Last write wins when the same cell appears twice in one request
    const cells = new Map(
      entries.map((e) => [`${e.categoryId}:${e.month}`, e]),
    );

    await this.prisma.$transaction(
      [...cells.values()].map(({ categoryId, month, amountCents }) => {
        const where = { categoryId_month: { categoryId, month } };
        return amountCents === 0
          ? this.prisma.monthlyEntry.deleteMany({
              where: { userId, categoryId, month },
            })
          : this.prisma.monthlyEntry.upsert({
              where,
              create: { userId, categoryId, month, amountCents },
              update: { amountCents },
            });
      }),
    );
  }

  async summary(userId: number, month: string): Promise<BudgetSummary> {
    const [user, categories, previous, current] = await Promise.all([
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
    ]);
    const kindOf = new Map<number, EntryKind>(
      categories.map((c) => [c.id, c.group.kind]),
    );
    return computeSummary(
      month,
      user.initialBalanceCents,
      sumByKind(previous, kindOf),
      sumByKind(current, kindOf),
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

  private async sumsByCategory(
    userId: number,
    month: { lt: string } | { equals: string },
  ) {
    const rows = await this.prisma.monthlyEntry.groupBy({
      by: ['categoryId'],
      where: { userId, month },
      _sum: { amountCents: true },
    });
    return rows.map((r) => ({
      categoryId: r.categoryId,
      amountCents: r._sum.amountCents ?? 0,
    }));
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
