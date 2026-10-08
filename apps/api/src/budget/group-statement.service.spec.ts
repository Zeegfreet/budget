import type { PrismaService } from '../prisma/prisma.service.js';
import { GroupStatementController } from './group-statement.controller.js';
import { GroupStatementService } from './group-statement.service.js';

describe('GroupStatementService', () => {
  const prisma = {
    groupMember: { findMany: vi.fn() },
    groupTransaction: { findMany: vi.fn() },
  };
  const service = new GroupStatementService(prisma as unknown as PrismaService);
  const moradia = {
    id: 4,
    name: 'Moradia',
    dueDay: null,
    active: true,
    group: { id: 2, name: 'Despesas Básicas', kind: 'EXPENSE', active: true },
  };
  const me = {
    id: 1,
    groupId: 5,
    leftAt: null,
    group: { id: 5, name: 'República' },
    expenseCategory: moradia,
    incomeCategory: null,
  };
  const members = [
    { id: 1, groupId: 5, leftAt: null, user: { name: 'Ana' } },
    { id: 2, groupId: 5, leftAt: null, user: { name: 'Bruno' } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns nothing without memberships', async () => {
    prisma.groupMember.findMany.mockResolvedValue([]);

    await expect(service.list(7, '2026-10')).resolves.toEqual([]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 7,
          OR: [
            { leftAt: null },
            { shares: { some: { transaction: { month: '2026-10' } } } },
          ],
        },
      }),
    );
    expect(prisma.groupTransaction.findMany).not.toHaveBeenCalled();
  });

  it('summarizes the month from the user’s side', async () => {
    prisma.groupMember.findMany
      .mockResolvedValueOnce([me])
      .mockResolvedValueOnce(members);
    prisma.groupTransaction.findMany
      .mockResolvedValueOnce([
        {
          id: 10,
          groupId: 5,
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 3000,
          paidByMemberId: 2,
          seriesId: 's1',
          shares: [
            { memberId: 1, amountCents: 1500 },
            { memberId: 2, amountCents: 1500 },
          ],
        },
        {
          id: 11,
          groupId: 5,
          kind: 'INCOME',
          description: 'Sublocação',
          month: '2026-10',
          amountCents: 400,
          paidByMemberId: null,
          seriesId: null,
          shares: [
            { memberId: 1, amountCents: 200 },
            { memberId: 2, amountCents: 200 },
          ],
        },
      ])
      // Series occurrences
      .mockResolvedValueOnce([
        { id: 10, seriesId: 's1', month: '2026-10' },
        { id: 12, seriesId: 's1', month: '2026-11' },
      ]);

    const [statement] = await service.list(7, '2026-10');

    expect(statement).toMatchObject({
      group: { id: 5, name: 'República' },
      active: true,
      memberId: 1,
      link: {
        expenseCategory: { id: 4, name: 'Moradia' },
        incomeCategory: null,
      },
      expenseCents: 3000,
      incomeCents: 400,
      pendingCents: 400,
      expenseShareCents: 1500,
      incomeShareCents: 200,
      paidCents: 0,
      receivedCents: 0,
      netCents: -1500,
      transfers: [
        {
          fromMemberId: 1,
          fromName: 'Ana',
          toMemberId: 2,
          toName: 'Bruno',
          amountCents: 1500,
        },
      ],
    });
    expect(statement.items).toEqual([
      {
        transactionId: 10,
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        shareCents: 1500,
        totalCents: 3000,
        paid: true,
        paidByName: 'Bruno',
        series: {
          index: 1,
          count: 2,
          firstMonth: '2026-10',
          lastMonth: '2026-11',
        },
        category: moradia,
      },
      {
        transactionId: 11,
        kind: 'INCOME',
        description: 'Sublocação',
        month: '2026-10',
        shareCents: 200,
        totalCents: 400,
        paid: false,
        paidByName: null,
        series: null,
        category: null,
      },
    ]);
  });

  it('marks a group the user left as inactive', async () => {
    prisma.groupMember.findMany
      .mockResolvedValueOnce([{ ...me, leftAt: new Date() }])
      .mockResolvedValueOnce(members);
    prisma.groupTransaction.findMany.mockResolvedValueOnce([]);

    const [statement] = await service.list(7, '2026-10');

    expect(statement).toMatchObject({
      active: false,
      items: [],
      transfers: [],
    });
  });
});

describe('GroupStatementController', () => {
  it('scopes the list by the authenticated user', async () => {
    const service = { list: vi.fn().mockResolvedValue([]) };
    const controller = new GroupStatementController(
      service as unknown as GroupStatementService,
    );

    await controller.list({ id: 7 }, { month: '2026-10' });

    expect(service.list).toHaveBeenCalledWith(7, '2026-10');
  });
});
