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
    group: { id: 5, name: 'República', categories: [] },
    categoryLinks: [],
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

  it('puts each item in the category mapped to its group category', async () => {
    const mercado = { ...moradia, id: 6, name: 'Mercado' };
    const aluguel = { id: 20, name: 'Aluguel' };
    const feira = { id: 21, name: 'Feira' };
    prisma.groupMember.findMany
      .mockResolvedValueOnce([
        {
          ...me,
          group: {
            ...me.group,
            categories: [
              { ...aluguel, kind: 'EXPENSE', active: true },
              { ...feira, kind: 'EXPENSE', active: true },
            ],
          },
          categoryLinks: [{ groupCategory: feira, category: mercado }],
        },
      ])
      .mockResolvedValueOnce(members);
    const tx = (id: number, category: typeof aluguel | null) => ({
      id,
      groupId: 5,
      kind: 'EXPENSE',
      description: `#${id}`,
      month: '2026-10',
      amountCents: 200,
      paidByMemberId: null,
      seriesId: null,
      dueDay: null,
      category,
      shares: [{ memberId: 1, amountCents: 200, settledAt: null }],
    });
    prisma.groupTransaction.findMany.mockResolvedValueOnce([
      tx(10, aluguel),
      tx(11, feira),
      tx(12, null),
    ]);

    const [statement] = await service.list(7, '2026-10');

    expect(
      statement.items.map((i) => [i.groupCategory?.name, i.category?.name]),
    ).toEqual([
      ['Aluguel', 'Moradia'],
      ['Feira', 'Mercado'],
      [undefined, 'Moradia'],
    ]);
    expect(statement.link.categoryLinks).toEqual([
      { groupCategory: feira, category: { id: 6, name: 'Mercado' } },
    ]);
    expect(statement.groupCategories).toHaveLength(2);
    expect(statement.group).toEqual({ id: 5, name: 'República' });
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
            { memberId: 1, amountCents: 1500, settledAt: null },
            { memberId: 2, amountCents: 1500, settledAt: null },
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
            { memberId: 1, amountCents: 200, settledAt: null },
            { memberId: 2, amountCents: 200, settledAt: null },
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
        // Bruno paid, but hasn't confirmed the user paid him back yet
        paid: false,
        groupPaid: true,
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
        groupPaid: false,
        paidByName: null,
        series: null,
        category: null,
      },
    ]);
  });

  it('counts a share as paid once the payer confirms it, out of the net', async () => {
    prisma.groupMember.findMany
      .mockResolvedValueOnce([me])
      .mockResolvedValueOnce(members);
    prisma.groupTransaction.findMany.mockResolvedValueOnce([
      {
        id: 10,
        groupId: 5,
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 3000,
        paidByMemberId: 2,
        seriesId: null,
        dueDay: null,
        shares: [
          { memberId: 1, amountCents: 1500, settledAt: new Date() },
          { memberId: 2, amountCents: 1500, settledAt: null },
        ],
      },
    ]);

    const [statement] = await service.list(7, '2026-10');

    expect(statement).toMatchObject({ netCents: 0, transfers: [] });
    expect(statement.items[0]).toMatchObject({ paid: true, groupPaid: true });
  });

  it('uses the linked method’s due day for expenses and orders by day', async () => {
    const tx = (id: number, kind: string, dueDay: number | null) => ({
      id,
      groupId: 5,
      kind,
      description: `T${id}`,
      month: '2026-10',
      amountCents: 200,
      paidByMemberId: null,
      seriesId: null,
      dueDay,
      shares: [{ memberId: 1, amountCents: 100, settledAt: null }],
    });
    prisma.groupMember.findMany
      .mockResolvedValueOnce([
        { ...me, paymentMethod: { id: 3, name: 'Nubank', dueDay: 15 } },
        {
          ...me,
          id: 3,
          groupId: 6,
          group: { id: 6, name: 'Viagem' },
          paymentMethod: null,
        },
      ])
      .mockResolvedValueOnce([
        ...members,
        { id: 3, groupId: 6, leftAt: null, user: { name: 'Ana' } },
      ]);
    prisma.groupTransaction.findMany.mockResolvedValueOnce([
      tx(20, 'EXPENSE', 5),
      tx(21, 'INCOME', 3),
      tx(22, 'EXPENSE', null),
      {
        ...tx(30, 'EXPENSE', 9),
        groupId: 6,
        shares: [{ memberId: 3, amountCents: 100 }],
      },
      {
        ...tx(31, 'EXPENSE', null),
        groupId: 6,
        shares: [{ memberId: 3, amountCents: 100 }],
      },
    ]);

    const [linked, plain] = await service.list(7, '2026-10');

    expect(linked.items.map((i) => [i.transactionId, i.dueDay])).toEqual([
      [21, 3],
      [20, 15],
      [22, 15],
    ]);
    expect(plain.items.map((i) => [i.transactionId, i.dueDay])).toEqual([
      [30, 9],
      [31, null],
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
