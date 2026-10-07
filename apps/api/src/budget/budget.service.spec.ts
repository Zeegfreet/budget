import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BudgetService } from './budget.service.js';
import { DEFAULT_CATEGORIES } from './default-categories.js';

describe('BudgetService', () => {
  const prisma = {
    $transaction: vi.fn(),
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    category: { findMany: vi.fn() },
    categoryGroup: { create: vi.fn(), findMany: vi.fn() },
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    groupTransactionShare: { findMany: vi.fn() },
  };
  const service = new BudgetService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.groupTransactionShare.findMany.mockResolvedValue([]);
    // Builders return descriptions of the operation, so tests can inspect them
    prisma.categoryGroup.create.mockImplementation((args) => ({
      create: args,
    }));
    prisma.user.update.mockImplementation((args) => ({ update: args }));
    prisma.transaction.create.mockImplementation((args) => ({ create: args }));
    prisma.transaction.update.mockImplementation((args) => ({ update: args }));
    prisma.transaction.delete.mockImplementation((args) => ({ delete: args }));
  });

  describe('categories', () => {
    const seeded = (budgetSeeded: boolean) =>
      prisma.user.findUniqueOrThrow.mockResolvedValue({ budgetSeeded });

    it('creates the default tree once and flags the user as seeded', async () => {
      seeded(false);
      prisma.categoryGroup.findMany.mockResolvedValue([]);

      await service.categories(7);

      const [flag, ...ops] = prisma.$transaction.mock.calls[0][0];
      expect(flag).toEqual({
        update: { where: { id: 7 }, data: { budgetSeeded: true } },
      });
      expect(ops).toHaveLength(DEFAULT_CATEGORIES.length);
      expect(ops[0].create.data).toMatchObject({
        userId: 7,
        kind: 'EXPENSE',
        name: 'Despesas Básicas',
        position: 0,
        categories: {
          create: expect.arrayContaining([
            { userId: 7, name: 'Moradia', position: 0 },
          ]),
        },
      });
      expect(prisma.categoryGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
    });

    it('does not recreate defaults for a seeded user, even with no types left', async () => {
      seeded(true);
      prisma.categoryGroup.findMany.mockResolvedValue([]);

      await expect(service.categories(7)).resolves.toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tolerates a concurrent request creating the defaults first', async () => {
      seeded(false);
      prisma.categoryGroup.findMany.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.categories(7)).resolves.toEqual([]);
    });

    it('rethrows other database errors', async () => {
      seeded(false);
      prisma.$transaction.mockRejectedValue(new Error('disk full'));

      await expect(service.categories(7)).rejects.toThrow('disk full');
    });
  });

  describe('entries', () => {
    it('sums the planned amounts per cell of the user’s range', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId: 1,
          month: '2026-10',
          _sum: { plannedCents: 300 },
          _count: { _all: 2 },
        },
      ]);

      await expect(service.entries(7, '2026-10', '2027-09')).resolves.toEqual([
        {
          categoryId: 1,
          month: '2026-10',
          amountCents: 300,
          count: 2,
          groupCents: 0,
        },
      ]);
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7, month: { gte: '2026-10', lte: '2027-09' } },
        }),
      );
    });

    it('adds the linked group shares to the cells', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId: 1,
          month: '2026-11',
          _sum: { plannedCents: 300 },
          _count: { _all: 1 },
        },
      ]);
      const link = { expenseCategoryId: 1, incomeCategoryId: null };
      prisma.groupTransactionShare.findMany.mockResolvedValue([
        {
          amountCents: 1500,
          member: link,
          transaction: { kind: 'EXPENSE', month: '2026-11' },
        },
        {
          amountCents: 700,
          member: link,
          transaction: { kind: 'EXPENSE', month: '2026-10' },
        },
      ]);

      await expect(service.entries(7, '2026-10', '2027-09')).resolves.toEqual([
        {
          categoryId: 1,
          month: '2026-10',
          amountCents: 0,
          count: 0,
          groupCents: 700,
        },
        {
          categoryId: 1,
          month: '2026-11',
          amountCents: 300,
          count: 1,
          groupCents: 1500,
        },
      ]);
      expect(prisma.groupTransactionShare.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            member: expect.objectContaining({ userId: 7 }),
            transaction: { month: { gte: '2026-10', lte: '2027-09' } },
          }),
        }),
      );
    });

    it('rejects a reversed or too long range', async () => {
      await expect(service.entries(7, '2026-10', '2026-09')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.entries(7, '2026-01', '2028-01')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('saveEntries', () => {
    const active = { active: true, group: { active: true } };

    it('creates, updates and deletes the cell’s transaction, last duplicate winning', async () => {
      prisma.category.findMany.mockResolvedValue([active, active]);
      prisma.transaction.findMany.mockResolvedValue([
        { id: 40, categoryId: 2, month: '2026-11' },
        { id: 41, categoryId: 2, month: '2026-12' },
      ]);

      await service.saveEntries(7, [
        { categoryId: 1, month: '2026-10', amountCents: 100 },
        { categoryId: 1, month: '2026-10', amountCents: 250 },
        { categoryId: 2, month: '2026-11', amountCents: 0 },
        { categoryId: 2, month: '2026-12', amountCents: 900 },
        { categoryId: 1, month: '2027-01', amountCents: 0 },
      ]);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7, id: { in: [1, 2] } } }),
      );
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 7 }),
        }),
      );
      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        {
          create: {
            data: {
              userId: 7,
              categoryId: 1,
              month: '2026-10',
              plannedCents: 250,
            },
          },
        },
        { delete: { where: { id: 40 } } },
        { update: { where: { id: 41 }, data: { plannedCents: 900 } } },
      ]);
    });

    it('fails with 409 when a cell holds several transactions', async () => {
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.transaction.findMany.mockResolvedValue([
        { id: 40, categoryId: 1, month: '2026-10' },
        { id: 41, categoryId: 1, month: '2026-10' },
      ]);

      await expect(
        service.saveEntries(7, [
          { categoryId: 1, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails with 404 and writes nothing when a category is not the user’s', async () => {
      prisma.category.findMany.mockResolvedValue([active]);

      await expect(
        service.saveEntries(7, [
          { categoryId: 1, month: '2026-10', amountCents: 100 },
          { categoryId: 99, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['the category', { active: false, group: { active: true } }],
      ['its type', { active: true, group: { active: false } }],
    ])('fails with 400 when %s is inactive', async (_case, category) => {
      prisma.category.findMany.mockResolvedValue([active, category]);

      await expect(
        service.saveEntries(7, [
          { categoryId: 1, month: '2026-10', amountCents: 100 },
          { categoryId: 2, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('combines the initial balance with the effective amounts of previous and current months', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        initialBalanceCents: 1000,
      });
      prisma.category.findMany.mockResolvedValue([
        { id: 1, group: { kind: 'INCOME' } },
        { id: 2, group: { kind: 'EXPENSE' } },
      ]);
      // Realized rows sum `realizedCents`, pending ones `plannedCents`
      prisma.transaction.groupBy.mockImplementation(({ where }) => {
        const previous = 'lt' in where.month;
        if (where.realizedCents === null) {
          return Promise.resolve(
            previous
              ? [{ categoryId: 1, _sum: { plannedCents: 5000 } }]
              : [{ categoryId: 2, _sum: { plannedCents: null } }],
          );
        }
        return Promise.resolve(
          previous
            ? [{ categoryId: 2, _sum: { realizedCents: 2000 } }]
            : [{ categoryId: 1, _sum: { realizedCents: 3000 } }],
        );
      });

      await expect(service.summary(7, '2026-10')).resolves.toEqual({
        month: '2026-10',
        initialBalanceCents: 1000,
        openingBalanceCents: 4000,
        incomeCents: 3000,
        expenseCents: 0,
        monthBalanceCents: 3000,
        closingBalanceCents: 7000,
      });
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 7,
            month: { lt: '2026-10' },
            realizedCents: { not: null },
          },
        }),
      );
    });
  });

  it('summary counts the linked group shares by the category’s kind', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ initialBalanceCents: 0 });
    prisma.category.findMany.mockResolvedValue([
      { id: 1, group: { kind: 'INCOME' } },
      { id: 2, group: { kind: 'EXPENSE' } },
    ]);
    prisma.transaction.groupBy.mockResolvedValue([]);
    const link = { expenseCategoryId: 2, incomeCategoryId: 1 };
    prisma.groupTransactionShare.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        'lt' in where.transaction.month
          ? [
              {
                amountCents: 400,
                member: link,
                transaction: { kind: 'EXPENSE', month: '2026-09' },
              },
            ]
          : [
              {
                amountCents: 1500,
                member: link,
                transaction: { kind: 'EXPENSE', month: '2026-10' },
              },
              {
                amountCents: 200,
                member: link,
                transaction: { kind: 'INCOME', month: '2026-10' },
              },
            ],
      ),
    );

    await expect(service.summary(7, '2026-10')).resolves.toMatchObject({
      openingBalanceCents: -400,
      incomeCents: 200,
      expenseCents: 1500,
      closingBalanceCents: -1700,
    });
  });

  it('setInitialBalance updates only the current user', async () => {
    prisma.user.update.mockResolvedValue({ initialBalanceCents: -500 });

    await expect(service.setInitialBalance(7, -500)).resolves.toEqual({
      amountCents: -500,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { initialBalanceCents: -500 },
      }),
    );
  });
});
