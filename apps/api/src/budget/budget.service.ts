import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntryKind, Prisma } from '../prisma/generated/client.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type BudgetSummary, computeSummary, sumByKind } from './balance.js';
import { assertWritableCategories } from './category-access.js';
import { DEFAULT_CATEGORIES } from './default-categories.js';
import { linkedShareCells } from './group-shares.js';
import type {
  BudgetLineDto,
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';
import type { LineCellDto } from './dto/save-lines.dto.js';
import { MAX_MONTH_SPAN, monthSpan } from './month.js';

const byPosition = { position: 'asc' } as const;

export const categorySelect = {
  id: true,
  name: true,
  position: true,
  active: true,
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

/** `{ gte, lte }` for a month range, at most `MAX_MONTH_SPAN` long (400 otherwise). */
function monthRange(from: string, to: string) {
  const span = monthSpan(from, to);
  if (span < 1) throw new BadRequestException('from must not be after to');
  if (span > MAX_MONTH_SPAN) {
    throw new BadRequestException(
      `The range must span at most ${MAX_MONTH_SPAN} months`,
    );
  }
  return { gte: from, lte: to };
}

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
   * Effective amount (realized, or planned while pending) and number of
   * transactions of each non-empty cell in the range, plus the user's shares
   * of the groups linked to the category.
   */
  async entries(
    userId: number,
    from: string,
    to: string,
  ): Promise<MonthlyEntryDto[]> {
    const range = monthRange(from, to);
    const [cells, realized, shares] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['month', 'categoryId'],
        where: { userId, month: range },
        orderBy: [{ month: 'asc' }, { categoryId: 'asc' }],
        _sum: { plannedCents: true },
        _count: { _all: true },
      }),
      // The realized ones swap their planned amount for the realized one
      this.prisma.transaction.groupBy({
        by: ['month', 'categoryId'],
        where: { userId, month: range, realizedCents: { not: null } },
        orderBy: [{ month: 'asc' }, { categoryId: 'asc' }],
        _sum: { plannedCents: true, realizedCents: true },
      }),
      linkedShareCells(this.prisma, userId, range),
    ]);
    const key = (c: { categoryId: number; month: string }) =>
      `${c.categoryId}:${c.month}`;
    const realizedDelta = new Map(
      realized.map((r) => [
        key(r),
        (r._sum.realizedCents ?? 0) - (r._sum.plannedCents ?? 0),
      ]),
    );
    const entries = new Map<string, MonthlyEntryDto>(
      cells.map((c) => [
        key(c),
        {
          categoryId: c.categoryId,
          month: c.month,
          amountCents:
            (c._sum.plannedCents ?? 0) + (realizedDelta.get(key(c)) ?? 0),
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
   * The launch rows of the grid in the range: one per recurring series, one
   * per plain launch, each with its planned amount per month. Ordered by
   * category, effective due day (none last), description and id.
   */
  async lines(
    userId: number,
    from: string,
    to: string,
  ): Promise<BudgetLineDto[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, month: monthRange(from, to) },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        month: true,
        description: true,
        dueDay: true,
        paymentUrl: true,
        plannedCents: true,
        realizedCents: true,
        seriesId: true,
        paymentMethod: { select: { id: true, name: true, dueDay: true } },
      },
    });
    const lines = new Map<string, BudgetLineDto>();
    for (const t of rows) {
      const key = t.seriesId ?? `#${t.id}`;
      const cell = {
        month: t.month,
        transactionId: t.id,
        plannedCents: t.plannedCents,
        realizedCents: t.realizedCents,
      };
      const line = lines.get(key);
      if (line) {
        line.anchorId = Math.min(line.anchorId, t.id);
        line.cells.push(cell);
      } else {
        // The first occurrence in the range names the line
        lines.set(key, {
          anchorId: t.id,
          categoryId: t.categoryId,
          description: t.description,
          dueDay: t.dueDay,
          paymentUrl: t.paymentUrl,
          paymentMethod: t.paymentMethod,
          cells: [cell],
        });
      }
    }
    const day = (l: BudgetLineDto) => l.paymentMethod?.dueDay ?? l.dueDay ?? 32;
    return [...lines.values()].sort(
      (a, b) =>
        a.categoryId - b.categoryId ||
        day(a) - day(b) ||
        (a.description ?? '').localeCompare(b.description ?? '', 'pt-BR') ||
        a.anchorId - b.anchorId,
    );
  }

  /**
   * Sets the planned amount of launch rows per month: changes the month's
   * transaction, deletes it (`0`) or creates it as a new occurrence of the
   * row (a copy of its anchor; a plain launch becomes a series). All or
   * nothing: an anchor that isn't the user's fails with 404 and writing to an
   * inactive category (or type) with 400; deleting is always allowed.
   */
  async saveLines(userId: number, cells: LineCellDto[]): Promise<void> {
    const anchorIds = [...new Set(cells.map((c) => c.anchorId))];
    const anchors = await this.prisma.transaction.findMany({
      where: { userId, id: { in: anchorIds } },
      select: {
        id: true,
        categoryId: true,
        description: true,
        dueDay: true,
        paymentUrl: true,
        paymentMethodId: true,
        seriesId: true,
      },
    });
    if (anchors.length !== anchorIds.length) {
      throw new NotFoundException('Transaction not found');
    }
    const anchorOf = new Map(anchors.map((a) => [a.id, a]));

    // Last write wins when the same cell appears twice in one request
    const key = (c: { anchorId: number; month: string }) =>
      `${c.anchorId}:${c.month}`;
    const latest = [...new Map(cells.map((c) => [key(c), c])).values()];

    const seriesIds = anchors.flatMap((a) => (a.seriesId ? [a.seriesId] : []));
    const occurrences = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          { id: { in: anchorIds } },
          ...(seriesIds.length > 0 ? [{ seriesId: { in: seriesIds } }] : []),
        ],
        month: { in: [...new Set(latest.map((c) => c.month))] },
      },
      select: { id: true, month: true, seriesId: true, categoryId: true },
    });
    const existing = (anchorId: number, month: string) => {
      const anchor = anchorOf.get(anchorId)!;
      return occurrences.filter(
        (o) =>
          o.month === month &&
          (anchor.seriesId
            ? o.seriesId === anchor.seriesId
            : o.id === anchorId),
      );
    };

    await assertWritableCategories(
      this.prisma,
      userId,
      latest.flatMap((c) =>
        c.amountCents === 0
          ? []
          : [
              anchorOf.get(c.anchorId)!.categoryId,
              ...existing(c.anchorId, c.month).map((o) => o.categoryId),
            ],
      ),
    );

    const newSeries = new Map<number, string>();
    const writes = latest.flatMap(
      ({ anchorId, month, amountCents }): Prisma.PrismaPromise<unknown>[] => {
        const found = existing(anchorId, month);
        if (amountCents === 0) {
          return found.length === 0
            ? []
            : [
                this.prisma.transaction.deleteMany({
                  where: { userId, id: { in: found.map((o) => o.id) } },
                }),
              ];
        }
        if (found.length > 1) {
          throw new ConflictException(
            'The row has several transactions in the month; edit them in the statement',
          );
        }
        if (found.length === 1) {
          return [
            this.prisma.transaction.update({
              where: { id: found[0].id },
              data: { plannedCents: amountCents },
            }),
          ];
        }
        const { id: _id, seriesId, ...fields } = anchorOf.get(anchorId)!;
        let series = seriesId ?? newSeries.get(anchorId);
        const joins: Prisma.PrismaPromise<unknown>[] = [];
        if (!series) {
          series = randomUUID();
          newSeries.set(anchorId, series);
          joins.push(
            this.prisma.transaction.update({
              where: { id: anchorId },
              data: { seriesId: series },
            }),
          );
        }
        return [
          ...joins,
          this.prisma.transaction.create({
            data: {
              userId,
              ...fields,
              month,
              plannedCents: amountCents,
              seriesId: series,
            },
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
