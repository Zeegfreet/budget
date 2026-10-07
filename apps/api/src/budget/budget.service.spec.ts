import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BudgetService } from './budget.service.js';
import { DEFAULT_CATEGORIES } from './default-categories.js';

describe('BudgetService', () => {
  const prisma = {
    $transaction: vi.fn(),
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    category: { count: vi.fn(), findMany: vi.fn() },
    categoryGroup: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    monthlyEntry: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
  };
  const service = new BudgetService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    // Builders return descriptions of the operation, so tests can inspect them
    prisma.categoryGroup.create.mockImplementation((args) => ({
      create: args,
    }));
    prisma.monthlyEntry.upsert.mockImplementation((args) => ({ upsert: args }));
    prisma.monthlyEntry.deleteMany.mockImplementation((args) => ({
      deleteMany: args,
    }));
  });

  describe('categories', () => {
    it('creates the default tree for a user without categories', async () => {
      prisma.categoryGroup.count.mockResolvedValue(0);
      prisma.categoryGroup.findMany.mockResolvedValue([]);

      await service.categories(7);

      const ops = prisma.$transaction.mock.calls[0][0];
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

    it('does not recreate defaults once the user has categories', async () => {
      prisma.categoryGroup.count.mockResolvedValue(5);
      prisma.categoryGroup.findMany.mockResolvedValue([{ id: 1 }]);

      await expect(service.categories(7)).resolves.toEqual([{ id: 1 }]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tolerates a concurrent request creating the defaults first', async () => {
      prisma.categoryGroup.count.mockResolvedValue(0);
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
      prisma.categoryGroup.count.mockResolvedValue(0);
      prisma.$transaction.mockRejectedValue(new Error('disk full'));

      await expect(service.categories(7)).rejects.toThrow('disk full');
    });
  });

  describe('entries', () => {
    it('lists the user’s entries in the range', async () => {
      prisma.monthlyEntry.findMany.mockResolvedValue([]);

      await service.entries(7, '2026-10', '2027-09');

      expect(prisma.monthlyEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7, month: { gte: '2026-10', lte: '2027-09' } },
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
      expect(prisma.monthlyEntry.findMany).not.toHaveBeenCalled();
    });
  });

  describe('saveEntries', () => {
    it('upserts amounts and deletes zeros, last duplicate winning', async () => {
      prisma.category.count.mockResolvedValue(2);

      await service.saveEntries(7, [
        { categoryId: 1, month: '2026-10', amountCents: 100 },
        { categoryId: 1, month: '2026-10', amountCents: 250 },
        { categoryId: 2, month: '2026-11', amountCents: 0 },
      ]);

      expect(prisma.category.count).toHaveBeenCalledWith({
        where: { userId: 7, id: { in: [1, 2] } },
      });
      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        {
          upsert: {
            where: { categoryId_month: { categoryId: 1, month: '2026-10' } },
            create: {
              userId: 7,
              categoryId: 1,
              month: '2026-10',
              amountCents: 250,
            },
            update: { amountCents: 250 },
          },
        },
        {
          deleteMany: {
            where: { userId: 7, categoryId: 2, month: '2026-11' },
          },
        },
      ]);
    });

    it('fails with 404 and writes nothing when a category is not the user’s', async () => {
      prisma.category.count.mockResolvedValue(1);

      await expect(
        service.saveEntries(7, [
          { categoryId: 1, month: '2026-10', amountCents: 100 },
          { categoryId: 99, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('combines the initial balance with previous and current months', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        initialBalanceCents: 1000,
      });
      prisma.category.findMany.mockResolvedValue([
        { id: 1, group: { kind: 'INCOME' } },
        { id: 2, group: { kind: 'EXPENSE' } },
      ]);
      prisma.monthlyEntry.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          'lt' in where.month
            ? [
                { categoryId: 1, _sum: { amountCents: 5000 } },
                { categoryId: 2, _sum: { amountCents: 2000 } },
              ]
            : [
                { categoryId: 1, _sum: { amountCents: 3000 } },
                { categoryId: 2, _sum: { amountCents: null } },
              ],
        ),
      );

      await expect(service.summary(7, '2026-10')).resolves.toEqual({
        month: '2026-10',
        initialBalanceCents: 1000,
        openingBalanceCents: 4000,
        incomeCents: 3000,
        expenseCents: 0,
        monthBalanceCents: 3000,
        closingBalanceCents: 7000,
      });
      expect(prisma.monthlyEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7, month: { lt: '2026-10' } },
        }),
      );
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
