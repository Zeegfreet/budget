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
      deleteMany: vi.fn(),
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
    prisma.transaction.deleteMany.mockImplementation((args) => ({
      deleteMany: args,
    }));
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
      prisma.transaction.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.realizedCents
            ? []
            : [
                {
                  categoryId: 1,
                  month: '2026-10',
                  _sum: { plannedCents: 300 },
                  _count: { _all: 2 },
                },
              ],
        ),
      );

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

    it('uses the realized amount of the realized transactions', async () => {
      prisma.transaction.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.realizedCents
            ? [
                {
                  categoryId: 1,
                  month: '2026-10',
                  _sum: { plannedCents: 200, realizedCents: 250 },
                },
              ]
            : [
                {
                  categoryId: 1,
                  month: '2026-10',
                  _sum: { plannedCents: 300 },
                  _count: { _all: 2 },
                },
                {
                  categoryId: 2,
                  month: '2026-10',
                  _sum: { plannedCents: 500 },
                  _count: { _all: 1 },
                },
              ],
        ),
      );

      await expect(service.entries(7, '2026-10', '2027-09')).resolves.toEqual([
        {
          categoryId: 1,
          month: '2026-10',
          amountCents: 350,
          count: 2,
          groupCents: 0,
        },
        {
          categoryId: 2,
          month: '2026-10',
          amountCents: 500,
          count: 1,
          groupCents: 0,
        },
      ]);
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 7,
            month: { gte: '2026-10', lte: '2027-09' },
            realizedCents: { not: null },
          },
        }),
      );
    });

    it('adds the linked group shares to the cells', async () => {
      prisma.transaction.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.realizedCents
            ? []
            : [
                {
                  categoryId: 1,
                  month: '2026-11',
                  _sum: { plannedCents: 300 },
                  _count: { _all: 1 },
                },
              ],
        ),
      );
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

  describe('lines', () => {
    const row = (id: number, extra: object) => ({
      id,
      categoryId: 1,
      month: '2026-10',
      description: null,
      dueDay: null,
      plannedCents: 100,
      realizedCents: null,
      seriesId: null,
      paymentMethod: null,
      ...extra,
    });

    it('groups a series in one row and keeps plain launches apart, by due day', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        row(10, { seriesId: 's', description: 'Netflix', dueDay: 20 }),
        row(11, { description: 'Avulso' }),
        row(12, {
          description: 'Spotify',
          paymentMethod: { id: 2, name: 'Cartão', dueDay: 5 },
        }),
        row(13, {
          seriesId: 's',
          month: '2026-11',
          plannedCents: 150,
          realizedCents: 140,
        }),
      ]);

      const lines = await service.lines(7, '2026-10', '2027-09');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7, month: { gte: '2026-10', lte: '2027-09' } },
        }),
      );
      expect(lines.map((l) => l.anchorId)).toEqual([12, 10, 11]);
      expect(lines[1]).toEqual({
        anchorId: 10,
        categoryId: 1,
        description: 'Netflix',
        dueDay: 20,
        paymentMethod: null,
        cells: [
          {
            month: '2026-10',
            transactionId: 10,
            plannedCents: 100,
            realizedCents: null,
          },
          {
            month: '2026-11',
            transactionId: 13,
            plannedCents: 150,
            realizedCents: 140,
          },
        ],
      });
    });

    it('rejects a reversed or too long range', async () => {
      await expect(service.lines(7, '2026-10', '2026-09')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('saveLines', () => {
    const active = { active: true, group: { active: true } };
    const anchor = (id: number, seriesId: string | null) => ({
      id,
      categoryId: 1,
      description: 'Netflix',
      dueDay: 5,
      paymentMethodId: null,
      seriesId,
    });

    it('updates, deletes and creates occurrences of a series, last duplicate winning', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([anchor(10, 's')])
        .mockResolvedValueOnce([
          { id: 10, month: '2026-10', seriesId: 's', categoryId: 1 },
          { id: 11, month: '2026-11', seriesId: 's', categoryId: 1 },
        ]);
      prisma.category.findMany.mockResolvedValue([active]);

      await service.saveLines(7, [
        { anchorId: 10, month: '2026-10', amountCents: 100 },
        { anchorId: 10, month: '2026-10', amountCents: 250 },
        { anchorId: 10, month: '2026-11', amountCents: 0 },
        { anchorId: 10, month: '2026-12', amountCents: 900 },
        { anchorId: 10, month: '2027-01', amountCents: 0 },
      ]);

      expect(prisma.transaction.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { userId: 7, id: { in: [10] } } }),
      );
      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        { update: { where: { id: 10 }, data: { plannedCents: 250 } } },
        { deleteMany: { where: { userId: 7, id: { in: [11] } } } },
        {
          create: {
            data: {
              userId: 7,
              categoryId: 1,
              description: 'Netflix',
              dueDay: 5,
              paymentMethodId: null,
              month: '2026-12',
              plannedCents: 900,
              seriesId: 's',
            },
          },
        },
      ]);
    });

    it('turns a plain launch into a series when another month gets a value', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([anchor(10, null)])
        .mockResolvedValueOnce([]);
      prisma.category.findMany.mockResolvedValue([active]);

      await service.saveLines(7, [
        { anchorId: 10, month: '2026-11', amountCents: 100 },
        { anchorId: 10, month: '2026-12', amountCents: 100 },
      ]);

      const [join, first, second] = prisma.$transaction.mock.calls[0][0];
      const seriesId = join.update.data.seriesId;
      expect(join).toEqual({
        update: { where: { id: 10 }, data: { seriesId } },
      });
      expect(seriesId).toEqual(expect.any(String));
      expect(first.create.data).toMatchObject({ month: '2026-11', seriesId });
      expect(second.create.data).toMatchObject({ month: '2026-12', seriesId });
    });

    it('fails with 404 and writes nothing when a launch is not the user’s', async () => {
      prisma.transaction.findMany.mockResolvedValueOnce([anchor(10, null)]);

      await expect(
        service.saveLines(7, [
          { anchorId: 10, month: '2026-10', amountCents: 100 },
          { anchorId: 99, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails with 409 when the row has several transactions in the month', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([anchor(10, 's')])
        .mockResolvedValueOnce([
          { id: 10, month: '2026-10', seriesId: 's', categoryId: 1 },
          { id: 11, month: '2026-10', seriesId: 's', categoryId: 1 },
        ]);
      prisma.category.findMany.mockResolvedValue([active]);

      await expect(
        service.saveLines(7, [
          { anchorId: 10, month: '2026-10', amountCents: 100 },
        ]),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['the category', { active: false, group: { active: true } }],
      ['its type', { active: true, group: { active: false } }],
    ])('fails with 400 when %s is inactive', async (_case, category) => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([anchor(10, null)])
        .mockResolvedValueOnce([]);
      prisma.category.findMany.mockResolvedValue([category]);

      await expect(
        service.saveLines(7, [
          { anchorId: 10, month: '2026-11', amountCents: 100 },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('still deletes in an inactive category', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([anchor(10, null)])
        .mockResolvedValueOnce([
          { id: 10, month: '2026-10', seriesId: null, categoryId: 1 },
        ]);
      prisma.category.findMany.mockResolvedValue([]);

      await service.saveLines(7, [
        { anchorId: 10, month: '2026-10', amountCents: 0 },
      ]);

      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        { deleteMany: { where: { userId: 7, id: { in: [10] } } } },
      ]);
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
