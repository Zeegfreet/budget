import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BudgetService } from '../budget/budget.service.js';
import type { CategoryService } from '../budget/category.service.js';
import type { PlanService } from '../budget/plan.service.js';
import type { TransactionService } from '../budget/transaction.service.js';
import type { PaymentMethodService } from '../payment-methods/payment-method.service.js';
import { McpServerFactory, serverInstructions } from './mcp-server.factory.js';
import type { McpPrincipal } from './principal.js';

const writer: McpPrincipal = {
  userId: 7,
  scopes: ['budget:read', 'budget:write'],
  via: 'local',
};

describe('McpServerFactory', () => {
  const budget = {
    categories: vi.fn(),
    summary: vi.fn(),
    lines: vi.fn(),
    entries: vi.fn(),
    saveLines: vi.fn(),
    setInitialBalance: vi.fn(),
    goals: vi.fn(),
  };
  const categories = {
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  const transactions = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setRealized: vi.fn(),
    setSeriesEnd: vi.fn(),
  };
  const paymentMethods = { list: vi.fn() };
  const plan = { save: vi.fn() };
  const factory = new McpServerFactory(
    budget as unknown as BudgetService,
    categories as unknown as CategoryService,
    transactions as unknown as TransactionService,
    paymentMethods as unknown as PaymentMethodService,
    plan as unknown as PlanService,
  );
  let client: Client;

  async function connect(principal: McpPrincipal) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await factory.create(principal).connect(serverSide);
    client = new Client({ name: 'spec', version: '1' });
    await client.connect(clientSide);
  }

  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const service of [
      budget,
      categories,
      transactions,
      paymentMethods,
      plan,
    ]) {
      for (const fn of Object.values(service)) fn.mockResolvedValue([]);
    }
    await connect(writer);
  });

  afterEach(async () => {
    await client.close();
  });

  it('states the units and the current month', () => {
    expect(serverInstructions(new Date(2026, 9, 12))).toContain(
      'The current month is 2026-10.',
    );
  });

  it('registers 20 tools with write access and 6 without', async () => {
    expect((await client.listTools()).tools).toHaveLength(20);
    await client.close();
    await connect({ ...writer, scopes: ['budget:read'] });
    expect((await client.listTools()).tools).toHaveLength(6);
  });

  it.each([
    ['get_categories', {}, budget.categories, [7]],
    [
      'get_budget_summary',
      { month: '2026-10' },
      budget.summary,
      [7, '2026-10'],
    ],
    [
      'get_goals',
      { from: '2026-10', to: '2026-12' },
      budget.goals,
      [7, '2026-10', '2026-12'],
    ],
    [
      'list_transactions',
      { month: '2026-10' },
      transactions.list,
      [7, '2026-10'],
    ],
    [
      'list_payment_methods',
      { month: '2026-10' },
      paymentMethods.list,
      [7, '2026-10'],
    ],
    ['delete_category_type', { typeId: 3 }, categories.deleteGroup, [7, 3]],
    ['delete_category', { categoryId: 4 }, categories.deleteCategory, [7, 4]],
    [
      'delete_transaction',
      { transactionId: 5, scope: 'FOLLOWING' },
      transactions.remove,
      [7, 5, 'FOLLOWING'],
    ],
    [
      'set_transaction_realization',
      { transactionId: 5, realizedCents: null },
      transactions.setRealized,
      [7, 5, null],
    ],
    [
      'set_transaction_realization',
      { transactionId: 5, realizedCents: 990 },
      transactions.setRealized,
      [7, 5, 990],
    ],
    [
      'set_initial_balance',
      { amountCents: -100 },
      budget.setInitialBalance,
      [7, -100],
    ],
  ])(
    '%s calls the service for the principal',
    async (name, args, fn, expected) => {
      const result = await call(name, args);
      expect(result.isError).toBeFalsy();
      expect(fn).toHaveBeenCalledWith(...expected);
    },
  );

  it('passes validated DTOs to the write services', async () => {
    await call('create_category_type', {
      kind: 'EXPENSE',
      name: ' Lazer ',
      goalPercent: 20,
    });
    expect(categories.createGroup).toHaveBeenCalledWith(7, {
      kind: 'EXPENSE',
      name: 'Lazer',
      goalPercent: 20,
    });

    await call('update_category', { categoryId: 4, active: false });
    expect(categories.updateCategory).toHaveBeenCalledWith(7, 4, {
      active: false,
    });

    await call('create_category', { typeId: 3, name: 'Cinema' });
    expect(categories.createCategory).toHaveBeenCalledWith(7, 3, {
      name: 'Cinema',
    });

    await call('update_category_type', { typeId: 3, goalPercent: null });
    expect(categories.updateGroup).toHaveBeenCalledWith(7, 3, {
      goalPercent: null,
    });

    await call('update_transaction', {
      transactionId: 5,
      scope: 'FOLLOWING',
      plannedCents: 100,
      dueDay: null,
    });
    expect(transactions.update).toHaveBeenCalledWith(7, 5, {
      scope: 'FOLLOWING',
      plannedCents: 100,
      dueDay: null,
    });

    await call('set_series_end', { transactionId: 5, untilMonth: null });
    expect(transactions.setSeriesEnd).toHaveBeenCalledWith(7, 5, {
      untilMonth: null,
    });

    await call('set_budget_cells', {
      cells: [{ anchorId: 1, month: '2026-10', amountCents: 0 }],
    });
    expect(budget.saveLines).toHaveBeenCalledWith(7, [
      expect.objectContaining({
        anchorId: 1,
        month: '2026-10',
        amountCents: 0,
      }),
    ]);

    await call('create_transaction', {
      categoryId: 2,
      month: '2026-10',
      plannedCents: 100,
      openEnded: true,
    });
    expect(transactions.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ categoryId: 2, openEnded: true }),
    );
  });

  it('reads the grid and the entries of one period', async () => {
    budget.lines.mockResolvedValue([{ anchorId: 1 }]);
    budget.entries.mockResolvedValue([{ categoryId: 2 }]);
    const result = await call('get_budget_lines', {
      from: '2026-10',
      to: '2026-12',
    });
    expect(result.structuredContent).toEqual({
      lines: [{ anchorId: 1 }],
      entries: [{ categoryId: 2 }],
    });
    expect(budget.lines).toHaveBeenCalledWith(7, '2026-10', '2026-12');
  });

  it('sets several goals in one plan and returns the expense goals', async () => {
    budget.categories.mockResolvedValue([
      {
        id: 1,
        kind: 'EXPENSE',
        name: 'Moradia',
        active: true,
        goalPercent: 60,
      },
      { id: 2, kind: 'EXPENSE', name: 'Lazer', active: true, goalPercent: 50 },
      {
        id: 3,
        kind: 'EXPENSE',
        name: 'Antigo',
        active: false,
        goalPercent: 30,
      },
      {
        id: 4,
        kind: 'EXPENSE',
        name: 'Outros',
        active: true,
        goalPercent: null,
      },
      {
        id: 5,
        kind: 'INCOME',
        name: 'Receitas',
        active: true,
        goalPercent: null,
      },
    ]);
    const result = await call('set_goals', {
      goals: [
        { typeId: 1, goalPercent: 60 },
        { typeId: 4, goalPercent: null },
      ],
    });
    expect(plan.save).toHaveBeenCalledWith(7, {
      updateGroups: [
        { id: 1, goalPercent: 60 },
        { id: 4, goalPercent: null },
      ],
    });
    expect(result.structuredContent).toEqual({
      goals: [
        { typeId: 1, name: 'Moradia', active: true, goalPercent: 60 },
        { typeId: 2, name: 'Lazer', active: true, goalPercent: 50 },
        { typeId: 3, name: 'Antigo', active: false, goalPercent: 30 },
      ],
      totalGoalPercent: 110,
      warning: 'The active goals add up to 110%, more than the whole income',
    });
  });

  it.each([
    [{ goals: [] }],
    [{ goals: [{ typeId: 1, goalPercent: 0 }] }],
    [{ goals: [{ typeId: 1 }] }],
    [
      {
        goals: [
          { typeId: 1, goalPercent: 10 },
          { typeId: 1, goalPercent: 20 },
        ],
      },
    ],
  ])('rejects invalid goals %j without saving', async (args) => {
    const result = await call('set_goals', args);
    expect(result.isError).toBe(true);
    expect(plan.save).not.toHaveBeenCalled();
  });

  it('does not call the service when the DTO rejects the arguments', async () => {
    const result = await call('get_budget_summary', { month: 'outubro' });
    expect(result.isError).toBe(true);
    expect(budget.summary).not.toHaveBeenCalled();
  });
});
