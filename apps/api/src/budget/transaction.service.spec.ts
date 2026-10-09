import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RecurrenceService } from '../recurrence/recurrence.service.js';
import { TransactionService } from './transaction.service.js';

describe('TransactionService', () => {
  const prisma = {
    $transaction: vi.fn(),
    category: { findMany: vi.fn(), findFirst: vi.fn() },
    paymentMethod: { findFirst: vi.fn() },
    recurrence: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const service = new TransactionService(
    prisma as unknown as PrismaService,
    {
      ensureForUser: vi.fn(),
      ensureForGroup: vi.fn(),
    } as unknown as RecurrenceService,
  );

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
    dueDay: null,
    paymentMethod: null,
    category: {
      id: 1,
      name: 'Moradia',
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
        row(id, { dueDay, category: { ...row(id).category, id, position } });
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
        paymentMethod: null,
        dueDay: 5,
        ownDueDay: 5,
        category: {
          id: 4,
          name: 'Moradia',
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

    it('uses the payment method’s due day over the launch’s own', async () => {
      const card = {
        id: 2,
        name: 'Cartão',
        type: 'CREDIT_CARD',
        dueDay: 12,
        active: true,
      };
      const withDay = (id: number, dueDay: number | null) =>
        row(id, { dueDay });
      prisma.transaction.findMany.mockResolvedValueOnce([
        { ...withDay(1, 5), paymentMethod: card },
        withDay(2, 10),
        { ...withDay(3, 20), paymentMethod: { ...card, dueDay: null } },
      ]);

      const result = await service.list(7, '2026-10');

      expect(result.map((t) => [t.id, t.dueDay])).toEqual([
        [2, 10],
        [1, 12],
        [3, 20],
      ]);
      expect(result[1].paymentMethod).toEqual(card);
    });

    it('tells the position of each occurrence in its series', async () => {
      prisma.transaction.findMany
        .mockResolvedValueOnce([row(12, { seriesId: 's1' })])
        .mockResolvedValueOnce([
          { id: 13, seriesId: 's1', month: '2026-12' },
          { id: 11, seriesId: 's1', month: '2026-10' },
          { id: 12, seriesId: 's1', month: '2026-11' },
        ]);

      const [transaction] = await service.list(7, '2026-11');

      expect(transaction.series).toEqual({
        index: 2,
        count: 3,
        firstMonth: '2026-10',
        lastMonth: '2026-12',
        recurrence: null,
      });
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
        dueDay: 10,
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
        dueDay: 10,
        paymentUrl: null,
        paymentMethodId: null,
      });
    });

    it('takes an active payment method of the user for an expense', async () => {
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.category.findFirst.mockResolvedValue({
        group: { kind: 'EXPENSE' },
      });
      prisma.paymentMethod.findFirst.mockResolvedValue({ active: true });
      prisma.$transaction.mockResolvedValue([row(1)]);

      await service.create(7, {
        categoryId: 1,
        month: '2026-10',
        plannedCents: 1000,
        paymentMethodId: 2,
      });

      expect(prisma.paymentMethod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2, userId: 7 } }),
      );
      expect(
        prisma.$transaction.mock.calls[0][0][0].create.data.paymentMethodId,
      ).toBe(2);
    });

    it('rejects a payment method on an income, of another user or inactive', async () => {
      const input = {
        categoryId: 1,
        month: '2026-10',
        plannedCents: 1,
        paymentMethodId: 2,
      };
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.category.findFirst.mockResolvedValueOnce({
        group: { kind: 'INCOME' },
      });
      await expect(service.create(7, input)).rejects.toThrow(
        BadRequestException,
      );

      prisma.category.findFirst.mockResolvedValue({
        group: { kind: 'EXPENSE' },
      });
      prisma.paymentMethod.findFirst.mockResolvedValueOnce(null);
      await expect(service.create(7, input)).rejects.toThrow(NotFoundException);

      prisma.paymentMethod.findFirst.mockResolvedValueOnce({ active: false });
      await expect(service.create(7, input)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
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

      await service.update(7, 5, {
        plannedCents: 2000,
        dueDay: null,
        paymentUrl: 'https://banco.com.br/boleto',
        scope: 'FOLLOWING',
      });

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
          dueDay: null,
          paymentUrl: 'https://banco.com.br/boleto',
          paymentMethodId: undefined,
        },
      });
    });

    it('sets, keeps or clears the payment method', async () => {
      const card = {
        id: 2,
        name: 'Cartão',
        type: 'CREDIT_CARD',
        dueDay: 12,
        active: false,
      };
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { paymentMethod: card }),
      );
      prisma.$transaction.mockResolvedValue([row(5)]);

      // Keeping a method inactivated afterwards doesn't look it up again
      await service.update(7, 5, { paymentMethodId: 2, plannedCents: 1 });
      await service.update(7, 5, { paymentMethodId: null });
      expect(prisma.paymentMethod.findFirst).not.toHaveBeenCalled();

      prisma.paymentMethod.findFirst.mockResolvedValueOnce({ active: false });
      await expect(
        service.update(7, 5, { paymentMethodId: 3 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects moving a transaction with a payment method to an income', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, {
          paymentMethod: {
            id: 2,
            name: 'Cartão',
            type: 'CREDIT_CARD',
            dueDay: 12,
            active: true,
          },
        }),
      );
      prisma.category.findMany.mockResolvedValue([active]);
      prisma.category.findFirst.mockResolvedValue({
        group: { kind: 'INCOME' },
      });

      await expect(service.update(7, 5, { categoryId: 8 })).rejects.toThrow(
        BadRequestException,
      );
      // Clearing it in the same change is fine
      prisma.$transaction.mockResolvedValue([row(5)]);
      await service.update(7, 5, { categoryId: 8, paymentMethodId: null });
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

  describe('setSeriesEnd', () => {
    const template = {
      id: 6,
      categoryId: 1,
      description: 'Netflix',
      plannedCents: 1000,
      dueDay: 5,
      paymentMethodId: null,
      category: active,
    };

    beforeEach(() => {
      prisma.transaction.findUniqueOrThrow.mockResolvedValue(template);
      prisma.$transaction.mockResolvedValue([]);
    });

    it('extends the series with copies of its last occurrence', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.transaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', realizedCents: 900 },
        { id: 6, month: '2026-11', realizedCents: null },
      ]);

      await service.setSeriesEnd(7, 5, { untilMonth: '2027-01' });

      expect(prisma.transaction.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { userId: 7, seriesId: 's1' } }),
      );
      const [remove, ...creates] = prisma.$transaction.mock.calls[0][0];
      expect(remove.deleteMany.where).toEqual({ userId: 7, id: { in: [] } });
      expect(
        creates.map((c: { create: { data: object } }) => c.create.data),
      ).toEqual(
        ['2026-12', '2027-01'].map((month) => ({
          userId: 7,
          categoryId: 1,
          month,
          description: 'Netflix',
          plannedCents: 1000,
          seriesId: 's1',
          dueDay: 5,
          paymentMethodId: null,
        })),
      );
    });

    it('turns a plain launch into a series', async () => {
      prisma.transaction.findFirst.mockResolvedValue(row(5));

      await service.setSeriesEnd(7, 5, { untilMonth: '2026-11' });

      const [join, , create] = prisma.$transaction.mock.calls[0][0];
      const { seriesId } = join.update.data;
      expect(seriesId).toEqual(expect.any(String));
      expect(join.update.where).toEqual({ id: 5 });
      expect(create.create.data).toMatchObject({ month: '2026-11', seriesId });
    });

    it('shortens the series deleting the pending occurrences after the end', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.transaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', realizedCents: null },
        { id: 6, month: '2026-11', realizedCents: null },
        { id: 7, month: '2026-12', realizedCents: null },
      ]);

      await service.setSeriesEnd(7, 5, { untilMonth: '2026-10' });

      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        { deleteMany: { where: { userId: 7, id: { in: [6, 7] } } } },
      ]);
    });

    it('fails with 409 when a realized occurrence falls after the end', async () => {
      prisma.transaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.transaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', realizedCents: null },
        { id: 6, month: '2026-11', realizedCents: 900 },
      ]);

      await expect(
        service.setSeriesEnd(7, 5, { untilMonth: '2026-10' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails with 400 extending into an inactive category', async () => {
      prisma.transaction.findFirst.mockResolvedValue(row(5));
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...template,
        category: { active: false, group: { active: true } },
      });

      await expect(
        service.setSeriesEnd(7, 5, { untilMonth: '2026-12' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns 404 for another user’s transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.setSeriesEnd(7, 5, { untilMonth: '2026-12' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
