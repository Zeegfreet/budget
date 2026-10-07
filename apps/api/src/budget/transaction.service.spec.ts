import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TransactionService } from './transaction.service.js';

describe('TransactionService', () => {
  const prisma = {
    $transaction: vi.fn(),
    category: { findMany: vi.fn() },
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const service = new TransactionService(prisma as unknown as PrismaService);

  const group = (extra = {}) => ({
    id: 10,
    name: 'Despesas Básicas',
    kind: 'EXPENSE',
    active: true,
    position: 0,
    ...extra,
  });
  const row = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    month: '2026-10',
    description: null,
    plannedCents: 1000,
    realizedCents: null,
    seriesId: null,
    category: {
      id: 1,
      name: 'Moradia',
      dueDay: null,
      active: true,
      position: 0,
      group: group(),
    },
    ...extra,
  });
  const active = { active: true, group: { active: true } };

  beforeEach(() => {
    vi.clearAllMocks();
    // Builders return descriptions of the operation, so tests can inspect them
    for (const op of [
      'create',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
    ] as const) {
      prisma.transaction[op].mockImplementation((args) => ({ [op]: args }));
    }
    prisma.transaction.findMany.mockResolvedValue([]);
  });

  describe('list', () => {
    it('lists the user’s month by due day, then the grid order, without internal fields', async () => {
      const withDay = (id: number, dueDay: number | null, position = 0) =>
        row(id, {
          category: { ...row(id).category, id, dueDay, position },
        });
      prisma.transaction.findMany.mockResolvedValueOnce([
        withDay(1, null),
        withDay(2, 20),
        withDay(3, 5, 1),
        withDay(4, 5, 0),
      ]);

      const result = await service.list(7, '2026-10');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7, month: '2026-10' } }),
      );
      expect(result.map((t) => t.id)).toEqual([4, 3, 2, 1]);
      expect(result[0]).toEqual({
        id: 4,
        month: '2026-10',
        description: null,
        plannedCents: 1000,
        realizedCents: null,
        series: null,
        category: {
          id: 4,
          name: 'Moradia',
          dueDay: 5,
          active: true,
          group: {
            id: 10,
            name: 'Despesas Básicas',
            kind: 'EXPENSE',
            active: true,
          },
        },
      });
    });

    it('tells the position of each occurrence in its series', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([row(12, { seriesId: 's1' })])
        .mockResolvedValueOnce([
          { id: 11, seriesId: 's1' },
          { id: 12, seriesId: 's1' },
          { id: 13, seriesId: 's1' },
        ]);

      const [transaction] = await service.list(7, '2026-11');

      expect(transaction.series).toEqual({ index: 2, count: 3 });
      expect(prisma.transaction.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { userId: 7, seriesId: { in: ['s1'] } },
        }),
      );
    });
  });

  describe('create', () => {
    it('creates one transaction without series', async () => {
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.$transaction.mockResolvedValue([row(1)]);

      await service.create(7, {
        categoryId: 1,
        month: '2026-10',
        plannedCents: 1000,
      });

      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(1);
      expect(ops[0].create.data).toEqual({
        userId: 7,
        categoryId: 1,
        month: '2026-10',
        description: null,
        plannedCents: 1000,
        seriesId: null,
      });
    });

    it('creates one occurrence per month sharing a series', async () => {
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.$transaction.mockResolvedValue([]);

      await service.create(7, {
        categoryId: 1,
        month: '2026-11',
        description: 'Luz',
        plannedCents: 1000,
        repeatMonths: 3,
      });

      const data = prisma.$transaction.mock.calls[0][0].map(
        (op: { create: { data: { month: string; seriesId: string } } }) =>
          op.create.data,
      );
      expect(data.map((d: { month: string }) => d.month)).toEqual([
        '2026-11',
        '2026-12',
        '2027-01',
      ]);
      expect(
        new Set(data.map((d: { seriesId: string }) => d.seriesId)).size,
      ).toBe(1);
      expect(data[0].seriesId).toEqual(expect.any(String));
    });

    it('rejects another user’s category with 404 and an inactive one with 400', async () => {
      const input = { categoryId: 1, month: '2026-10', plannedCents: 1 };
      prisma.category.findMany.mockResolvedValueOnce([]);
      await expect(service.create(7, input)).rejects.toThrow(NotFoundException);

      prisma.category.findMany.mockResolvedValueOnce([
        { active: true, group: { active: false } },
      ]);
      await expect(service.create(7, input)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes only the transaction by default', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.$transaction.mockResolvedValue([row(5)]);

      await service.update(7, 5, { plannedCents: 2000 });

      expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5, userId: 7 } }),
      );
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(1);
      expect(ops[0].update).toMatchObject({
        where: { id: 5 },
        data: { plannedCents: 2000 },
      });
    });

    it('with FOLLOWING also changes the later pending occurrences', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1', month: '2026-11' }),
      );
      prisma.$transaction.mockResolvedValue([row(5)]);

      await service.update(7, 5, { plannedCents: 2000, scope: 'FOLLOWING' });

      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops[1].updateMany).toEqual({
        where: {
          userId: 7,
          seriesId: 's1',
          month: { gte: '2026-11' },
          realizedCents: null,
          id: { not: 5 },
        },
        data: {
          categoryId: undefined,
          description: undefined,
          plannedCents: 2000,
        },
      });
    });

    it('ignores FOLLOWING for a transaction without series', async () => {
      prisma.transaction.findFirst.mockResolvedValue(row(5));
      prisma.$transaction.mockResolvedValue([row(5)]);

      await service.update(7, 5, { description: 'x', scope: 'FOLLOWING' });

      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(1);
    });

    it('validates a new category', async () => {
      prisma.transaction.findFirst.mockResolvedValue(row(5));
      prisma.category.findMany.mockResolvedValue([]);

      await expect(service.update(7, 5, { categoryId: 99 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7, id: { in: [99] } } }),
      );
    });

    it('rejects editing a transaction of an inactive category', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { category: { ...row(5).category, active: false } }),
      );

      await expect(service.update(7, 5, { plannedCents: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns 404 for another user’s transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.update(7, 5, { plannedCents: 1 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes only the transaction, or the later pending ones too', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.$transaction.mockResolvedValue([]);

      await service.remove(7, 5);
      await service.remove(7, 5, 'FOLLOWING');

      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        { delete: { where: { id: 5 } } },
      ]);
      expect(prisma.$transaction.mock.calls[1][0][1]).toEqual({
        deleteMany: {
          where: {
            userId: 7,
            seriesId: 's1',
            month: { gte: '2026-10' },
            realizedCents: null,
            id: { not: 5 },
          },
        },
      });
    });

    it('returns 404 for another user’s transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.remove(7, 5)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setRealized', () => {
    it('stores the realized amount, or clears it', async () => {
      prisma.transaction.findFirst.mockResolvedValue(row(5));
      prisma.transaction.update.mockResolvedValue(
        row(5, { realizedCents: 900 }),
      );

      await expect(service.setRealized(7, 5, 900)).resolves.toMatchObject({
        realizedCents: 900,
      });
      await service.setRealized(7, 5, null);

      expect(prisma.transaction.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 5 },
          data: { realizedCents: 900 },
        }),
      );
      expect(prisma.transaction.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: { realizedCents: null } }),
      );
    });

    it('returns 404 for another user’s transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.setRealized(7, 5, 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });
});
