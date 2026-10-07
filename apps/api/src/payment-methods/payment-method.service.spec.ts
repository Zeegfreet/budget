import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { TransactionService } from '../budget/transaction.service.js';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PaymentMethodService } from './payment-method.service.js';

describe('PaymentMethodService', () => {
  const prisma = {
    $transaction: vi.fn(),
    paymentMethod: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    groupTransactionShare: { findMany: vi.fn() },
  };
  const transactions = { listByPaymentMethod: vi.fn() };
  const service = new PaymentMethodService(
    prisma as unknown as PrismaService,
    transactions as unknown as TransactionService,
  );
  const card = {
    id: 2,
    name: 'Cartão Americanas',
    type: 'CREDIT_CARD',
    dueDay: 12,
    active: true,
  };
  const share = (month: string, amountCents: number, paid = false) => ({
    amountCents,
    member: { paymentMethodId: 2 },
    transaction: {
      id: 30,
      month,
      description: 'Aluguel',
      paidByMemberId: paid ? 1 : null,
      group: { id: 5, name: 'República' },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.transaction.update.mockImplementation((args) => ({ update: args }));
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.groupTransactionShare.findMany.mockResolvedValue([]);
    transactions.listByPaymentMethod.mockResolvedValue([]);
  });

  describe('list', () => {
    it('totals each method’s invoice of the month', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([
        card,
        { ...card, id: 3, name: 'Conta' },
      ]);
      prisma.transaction.findMany.mockResolvedValue([
        {
          paymentMethodId: 2,
          month: '2026-10',
          plannedCents: 1000,
          realizedCents: null,
        },
        {
          paymentMethodId: 2,
          month: '2026-10',
          plannedCents: 500,
          realizedCents: 450,
        },
      ]);
      prisma.groupTransactionShare.findMany.mockResolvedValue([
        share('2026-10', 3000, true),
      ]);

      const result = await service.list(7, '2026-10');

      expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 7,
            paymentMethodId: { in: [2, 3] },
            month: { equals: '2026-10' },
          },
        }),
      );
      expect(prisma.groupTransactionShare.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            member: { userId: 7, paymentMethodId: { in: [2, 3] } },
            transaction: { kind: 'EXPENSE', month: { equals: '2026-10' } },
          },
        }),
      );
      expect(result[0].invoice).toEqual({
        plannedCents: 4500,
        realizedCents: 3450,
        pendingCents: 1000,
        effectiveCents: 4450,
        count: 3,
      });
      expect(result[1].invoice.count).toBe(0);
    });

    it('skips the queries without methods', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([]);

      await expect(service.list(7, '2026-10')).resolves.toEqual([]);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create and update', () => {
    it('creates with an optional due day', async () => {
      prisma.paymentMethod.create.mockResolvedValue(card);

      await service.create(7, { name: 'Conta', type: 'ACCOUNT' });

      expect(prisma.paymentMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 7, name: 'Conta', type: 'ACCOUNT', dueDay: null },
        }),
      );
    });

    it('maps a duplicate name to 409', async () => {
      prisma.paymentMethod.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(
        service.create(7, { name: 'Conta', type: 'ACCOUNT' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 for another user’s method', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue(null);

      await expect(service.update(7, 2, { active: false })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove(7, 2)).rejects.toThrow(NotFoundException);
      await expect(service.invoice(7, 2, '2026-10')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.pay(7, 2, '2026-10')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.paymentMethod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2, userId: 7 } }),
      );
      expect(prisma.paymentMethod.update).not.toHaveBeenCalled();
      expect(prisma.paymentMethod.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('invoice', () => {
    it('joins the transactions and the group shares with the due date', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue({ ...card, dueDay: 31 });
      transactions.listByPaymentMethod.mockResolvedValue([
        { id: 1, plannedCents: 1000, realizedCents: null },
      ]);
      prisma.groupTransactionShare.findMany.mockResolvedValue([
        share('2027-02', 3000),
      ]);

      const invoice = await service.invoice(7, 2, '2027-02');

      expect(transactions.listByPaymentMethod).toHaveBeenCalledWith(
        7,
        2,
        '2027-02',
      );
      expect(invoice).toMatchObject({
        month: '2027-02',
        dueDate: '2027-02-28',
        plannedCents: 4000,
        pendingCents: 4000,
        count: 2,
        shares: [
          {
            transactionId: 30,
            group: { id: 5, name: 'República' },
            description: 'Aluguel',
            shareCents: 3000,
            paid: false,
          },
        ],
      });
    });
  });

  describe('history', () => {
    it('totals every month of the range, empty ones too', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue(card);
      prisma.transaction.findMany.mockResolvedValue([
        {
          paymentMethodId: 2,
          month: '2026-11',
          plannedCents: 1000,
          realizedCents: 1000,
        },
      ]);

      const months = await service.history(7, 2, '2026-10', '2026-12');

      expect(months.map((m) => [m.month, m.effectiveCents])).toEqual([
        ['2026-10', 0],
        ['2026-11', 1000],
        ['2026-12', 0],
      ]);
    });

    it('rejects a reversed or too long range', async () => {
      await expect(service.history(7, 2, '2026-12', '2026-10')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.history(7, 2, '2026-01', '2028-01')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('pay and unpay', () => {
    it('realizes the pending transactions with their planned amount', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue(card);
      prisma.transaction.findMany.mockResolvedValueOnce([
        { id: 1, plannedCents: 1000 },
        { id: 2, plannedCents: 500 },
      ]);

      await service.pay(7, 2, '2026-10');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 7,
            paymentMethodId: 2,
            month: '2026-10',
            realizedCents: null,
          },
        }),
      );
      expect(prisma.$transaction.mock.calls[0][0]).toEqual([
        { update: { where: { id: 1 }, data: { realizedCents: 1000 } } },
        { update: { where: { id: 2 }, data: { realizedCents: 500 } } },
      ]);
    });

    it('puts the month’s transactions back to pending', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue(card);

      await service.unpay(7, 2, '2026-10');

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { userId: 7, paymentMethodId: 2, month: '2026-10' },
        data: { realizedCents: null },
      });
    });
  });
});
