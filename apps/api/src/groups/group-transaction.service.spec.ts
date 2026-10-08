import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GroupTransactionService } from './group-transaction.service.js';

describe('GroupTransactionService', () => {
  const tx = {
    groupTransaction: { updateMany: vi.fn() },
    groupTransactionShare: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    groupMember: { findFirst: vi.fn(), findMany: vi.fn() },
    splitMethod: { findFirst: vi.fn() },
    groupTransaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const service = new GroupTransactionService(
    prisma as unknown as PrismaService,
  );
  const row = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'EXPENSE',
    description: 'Aluguel',
    month: '2026-10',
    amountCents: 1000,
    seriesId: null,
    splitMethod: { id: 3, name: 'Igualitário', type: 'EQUAL' },
    paidBy: null,
    shares: [],
    ...extra,
  });
  const body = {
    kind: 'EXPENSE' as const,
    description: 'Aluguel',
    month: '2026-10',
    amountCents: 1001,
    splitMethodId: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.groupMember.findFirst.mockResolvedValue({ id: 1, groupId: 5 });
    prisma.groupMember.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.splitMethod.findFirst.mockResolvedValue({
      type: 'EQUAL',
      active: true,
      shares: [],
    });
    prisma.groupTransaction.create.mockImplementation(() =>
      Promise.resolve(row(1)),
    );
    prisma.groupTransaction.findMany.mockResolvedValue([]);
  });

  it('stores the computed shares with each occurrence', async () => {
    await service.create(7, 5, { ...body, paidByMemberId: 2, repeatMonths: 2 });

    const calls = prisma.groupTransaction.create.mock.calls.map(
      ([args]) => args.data,
    );
    expect(calls).toEqual([
      expect.objectContaining({
        groupId: 5,
        month: '2026-10',
        paidByMemberId: 2,
        createdById: 7,
        seriesId: expect.any(String),
        shares: {
          create: [
            { memberId: 1, amountCents: 501 },
            { memberId: 2, amountCents: 500 },
          ],
        },
      }),
      expect.objectContaining({ month: '2026-11', paidByMemberId: null }),
    ]);
    expect(calls[0].seriesId).toBe(calls[1].seriesId);
  });

  it('rejects unknown or inactive rules and rules that do not fit', async () => {
    prisma.splitMethod.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(7, 5, body)).rejects.toThrow(NotFoundException);

    prisma.splitMethod.findFirst.mockResolvedValueOnce({
      type: 'EQUAL',
      active: false,
      shares: [],
    });
    await expect(service.create(7, 5, body)).rejects.toThrow(
      new BadRequestException('Split method is inactive'),
    );

    prisma.splitMethod.findFirst.mockResolvedValueOnce({
      type: 'FIXED',
      active: true,
      shares: [{ memberId: 1, value: 10 }],
    });
    await expect(service.create(7, 5, body)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.groupTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects a payer who is not an active member', async () => {
    prisma.groupMember.findFirst
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    await expect(
      service.create(7, 5, { ...body, paidByMemberId: 9 }),
    ).rejects.toThrow(new BadRequestException('Unknown member'));
  });

  it('recomputes the shares of the following pending occurrences', async () => {
    prisma.groupTransaction.findFirst.mockResolvedValue(
      row(1, { seriesId: 's' }),
    );
    prisma.groupTransaction.findMany.mockResolvedValueOnce([{ id: 2 }]);

    await service.update(7, 5, 1, { amountCents: 200, scope: 'FOLLOWING' });

    expect(prisma.groupTransaction.findMany).toHaveBeenCalledWith({
      where: {
        groupId: 5,
        seriesId: 's',
        month: { gte: '2026-10' },
        paidByMemberId: null,
        id: { not: 1 },
      },
      select: { id: true },
    });
    expect(tx.groupTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: {
        kind: undefined,
        description: undefined,
        amountCents: 200,
        splitMethodId: undefined,
      },
    });
    expect(tx.groupTransactionShare.createMany).toHaveBeenCalledWith({
      data: [
        { memberId: 1, amountCents: 100, transactionId: 1 },
        { memberId: 2, amountCents: 100, transactionId: 1 },
        { memberId: 1, amountCents: 100, transactionId: 2 },
        { memberId: 2, amountCents: 100, transactionId: 2 },
      ],
    });
  });

  it('keeps the shares when only the description changes', async () => {
    prisma.groupTransaction.findFirst.mockResolvedValue(row(1));

    await service.update(7, 5, 1, { description: 'Luz' });

    expect(prisma.splitMethod.findFirst).not.toHaveBeenCalled();
    expect(tx.groupTransactionShare.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 for transactions of other groups', async () => {
    prisma.groupTransaction.findFirst.mockResolvedValue(null);

    await expect(service.remove(7, 5, 1)).rejects.toThrow(NotFoundException);
    await expect(service.setPayment(7, 5, 1, 1)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.groupTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, groupId: 5 } }),
    );
  });

  it('builds the month balance with member names', async () => {
    prisma.groupTransaction.findMany.mockResolvedValueOnce([
      {
        kind: 'EXPENSE',
        amountCents: 1000,
        paidByMemberId: 1,
        shares: [
          { memberId: 1, amountCents: 500 },
          { memberId: 2, amountCents: 500 },
        ],
      },
    ]);
    prisma.groupMember.findMany
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([
        { id: 1, leftAt: null, user: { name: 'Ana' } },
        { id: 2, leftAt: new Date(), user: { name: 'Bruno' } },
      ]);

    const balance = await service.balance(7, 5, '2026-10');

    expect(balance.members).toEqual([
      expect.objectContaining({ name: 'Ana', active: true, netCents: 500 }),
      expect.objectContaining({ name: 'Bruno', active: false, netCents: -500 }),
    ]);
    expect(balance.transfers).toEqual([
      { fromMemberId: 2, toMemberId: 1, amountCents: 500 },
    ]);
  });

  describe('setSeriesEnd', () => {
    const shares = [
      { memberId: 1, amountCents: 500 },
      { memberId: 2, amountCents: 500 },
    ];

    beforeEach(() => {
      prisma.groupTransaction.findUniqueOrThrow.mockResolvedValue({
        ...row(6),
        splitMethodId: 3,
        shares,
      });
    });

    it('extends the series with unpaid copies of the last occurrence', async () => {
      prisma.groupTransaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.groupTransaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', paidByMemberId: 1 },
        { id: 6, month: '2026-11', paidByMemberId: null },
      ]);

      await service.setSeriesEnd(7, 5, 5, '2026-12');

      expect(prisma.groupTransaction.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { groupId: 5, seriesId: 's1' } }),
      );
      expect(prisma.groupTransaction.create).toHaveBeenCalledWith({
        data: {
          groupId: 5,
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-12',
          amountCents: 1000,
          splitMethodId: 3,
          createdById: 7,
          seriesId: 's1',
          shares: { create: shares },
        },
      });
    });

    it('shortens the series deleting the unpaid occurrences after the end', async () => {
      prisma.groupTransaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.groupTransaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', paidByMemberId: null },
        { id: 6, month: '2026-11', paidByMemberId: null },
      ]);

      await service.setSeriesEnd(7, 5, 5, '2026-10');

      expect(prisma.groupTransaction.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 5, id: { in: [6] } },
      });
      expect(prisma.groupTransaction.create).not.toHaveBeenCalled();
    });

    it('fails with 409 when a paid occurrence falls after the end', async () => {
      prisma.groupTransaction.findFirst.mockResolvedValue(
        row(5, { seriesId: 's1' }),
      );
      prisma.groupTransaction.findMany.mockResolvedValueOnce([
        { id: 5, month: '2026-10', paidByMemberId: null },
        { id: 6, month: '2026-11', paidByMemberId: 2 },
      ]);

      await expect(service.setSeriesEnd(7, 5, 5, '2026-10')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.groupTransaction.deleteMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a non-member', async () => {
      prisma.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.setSeriesEnd(7, 5, 5, '2026-12')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.groupTransaction.findFirst).not.toHaveBeenCalled();
    });
  });
});
