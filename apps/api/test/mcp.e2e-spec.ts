import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  callTool,
  connectAgent,
  MCP_RESOURCE,
  mcpRequest,
  toolNames,
} from './mcp.js';
import {
  createPaymentMethod,
  createTestApp,
  createTestMcpApp,
  resetDatabase,
  signUp,
  type Agent,
} from './utils.js';

const READ_TOOLS = [
  'get_budget_lines',
  'get_budget_summary',
  'get_categories',
  'get_goals',
  'list_payment_methods',
  'list_transactions',
];
const WRITE_TOOLS = [
  'create_category',
  'create_category_type',
  'create_transaction',
  'delete_category',
  'delete_category_type',
  'delete_transaction',
  'set_budget_cells',
  'set_goals',
  'set_initial_balance',
  'set_series_end',
  'set_transaction_realization',
  'update_category',
  'update_category_type',
  'update_transaction',
];

interface TypeBody {
  id: number;
  name: string;
  kind: string;
  active: boolean;
  goalPercent: number | null;
}
interface TransactionBody {
  id: number;
  month: string;
  plannedCents: number;
  realizedCents: number | null;
  description: string | null;
  category: { id: number; name: string };
  series: { index: number; count: number } | null;
}

describe('MCP server over HTTP (e2e)', () => {
  let api: INestApplication<App>;
  let mcp: INestApplication<App>;
  let prisma: PrismaService;
  let ana: Agent;
  let token: string;

  const http = () => request(mcp.getHttpServer());
  const call = (name: string, args: Record<string, unknown> = {}) =>
    callTool(mcp, token, name, args);

  /** A type with one category, created through the tools; returns the ids. */
  async function createCategory(typeName = 'Assinaturas', name = 'Streaming') {
    const type = await call('create_category_type', {
      kind: 'EXPENSE',
      name: typeName,
    });
    const typeId = (type.data.type as TypeBody).id;
    const category = await call('create_category', { typeId, name });
    return {
      typeId,
      categoryId: (category.data.category as { id: number }).id,
    };
  }

  beforeEach(async () => {
    api = await createTestApp();
    mcp = await createTestMcpApp();
    prisma = api.get(PrismaService);
    await resetDatabase(api);
    ana = await signUp(api, 'Ana Souza', 'ana@example.com');
    token = (await connectAgent(api, ana)).access_token;
  });

  afterEach(async () => {
    await mcp.close();
    await api.close();
  });

  describe('discovery and authentication', () => {
    it('serves the protected resource metadata', async () => {
      for (const path of [
        '/.well-known/oauth-protected-resource/mcp',
        '/.well-known/oauth-protected-resource',
      ]) {
        const res = await http().get(path).expect(200);
        expect(res.body).toMatchObject({
          resource: MCP_RESOURCE,
          authorization_servers: ['http://web.test/api'],
          scopes_supported: ['budget:read', 'budget:write'],
          bearer_methods_supported: ['header'],
        });
      }
    });

    it('challenges a request without a token', async () => {
      const res = await mcpRequest(mcp, undefined, 'tools/list').expect(401);
      expect(res.get('WWW-Authenticate')).toBe(
        'Bearer resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp", scope="budget:read budget:write"',
      );
    });

    it('rejects an unknown, expired, revoked or foreign-resource token', async () => {
      const unknown = await mcpRequest(
        mcp,
        'x'.repeat(43),
        'tools/list',
      ).expect(401);
      expect(unknown.get('WWW-Authenticate')).toContain(
        'error="invalid_token"',
      );

      await prisma.mcpGrant.updateMany({
        data: { resource: 'https://other.example.com/mcp' },
      });
      await mcpRequest(mcp, token, 'tools/list').expect(401);

      await prisma.mcpGrant.updateMany({
        data: {
          resource: MCP_RESOURCE,
          accessExpiresAt: new Date(Date.now() - 1000),
        },
      });
      await mcpRequest(mcp, token, 'tools/list').expect(401);

      const fresh = (await connectAgent(api, ana)).access_token;
      await mcpRequest(mcp, fresh, 'tools/list').expect(200);
      const grants = await ana.get('/oauth/grants').expect(200);
      for (const { id } of grants.body as { id: number }[]) {
        await ana.delete(`/oauth/grants/${id}`).expect(204);
      }
      await mcpRequest(mcp, fresh, 'tools/list').expect(401);
    });

    it('serves only /mcp and its discovery', async () => {
      await http().get('/budget/categories').expect(404);
      await http().get('/oauth/info').expect(404);
      await http().get('/').expect(404);
    });

    it('is stateless: GET and DELETE are not allowed', async () => {
      await http()
        .get('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .expect(405);
      await http()
        .delete('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .expect(405);
    });
  });

  describe('protocol', () => {
    it('initializes with the server info and instructions', async () => {
      const res = await mcpRequest(mcp, token, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1' },
      }).expect(200);
      expect(res.body.result).toMatchObject({
        serverInfo: { name: 'budget' },
        capabilities: { tools: {} },
        instructions: expect.stringContaining('integer cents'),
      });
    });

    it('lists every tool with read and write access', async () => {
      expect(await toolNames(mcp, token)).toEqual(
        [...READ_TOOLS, ...WRITE_TOOLS].sort(),
      );
      const res = await mcpRequest(mcp, token, 'tools/list').expect(200);
      const tools = (
        res.body as {
          result: {
            tools: { name: string; annotations: Record<string, boolean> }[];
          };
        }
      ).result.tools;
      expect(
        tools.find((t) => t.name === 'delete_category')?.annotations,
      ).toMatchObject({
        destructiveHint: true,
      });
      expect(
        tools.find((t) => t.name === 'get_categories')?.annotations,
      ).toMatchObject({
        readOnlyHint: true,
      });
    });

    it('a read-only token sees and runs only the read tools', async () => {
      const readOnly = (await connectAgent(api, ana, { scope: 'budget:read' }))
        .access_token;
      expect(await toolNames(mcp, readOnly)).toEqual(READ_TOOLS);

      const res = await mcpRequest(mcp, readOnly, 'tools/call', {
        name: 'create_category_type',
        arguments: { kind: 'EXPENSE', name: 'X' },
      }).expect(200);
      const body = res.body as {
        error?: unknown;
        result?: { isError?: boolean };
      };
      expect(body.error ?? body.result?.isError).toBeTruthy();
      expect(await prisma.categoryGroup.count({ where: { name: 'X' } })).toBe(
        0,
      );
    });
  });

  describe('tools', () => {
    it('reads the category tree, seeding the defaults once', async () => {
      const res = await call('get_categories');
      expect(res.isError).toBeFalsy();
      const types = res.data.types as TypeBody[];
      expect(types.length).toBeGreaterThan(0);
      expect(JSON.parse(res.text)).toEqual(res.data);
    });

    it('manages types and categories', async () => {
      const { typeId, categoryId } = await createCategory();

      const renamed = await call('update_category_type', {
        typeId,
        name: '  Serviços  ',
        goalPercent: 10,
      });
      expect(renamed.data.type).toMatchObject({
        name: 'Serviços',
        goalPercent: 10,
      });
      const cleared = await call('update_category_type', {
        typeId,
        goalPercent: null,
      });
      expect(cleared.data.type).toMatchObject({ goalPercent: null });

      const category = await call('update_category', {
        categoryId,
        active: false,
      });
      expect(category.data.category).toMatchObject({
        name: 'Streaming',
        active: false,
      });

      const duplicate = await call('create_category_type', {
        kind: 'EXPENSE',
        name: 'Serviços',
      });
      expect(duplicate.isError).toBe(true);
      expect(duplicate.text).toMatch(/^409 /);

      expect((await call('delete_category', { categoryId })).data).toEqual({
        deleted: true,
      });
      expect((await call('delete_category_type', { typeId })).data).toEqual({
        deleted: true,
      });
      const gone = await call('update_category_type', { typeId, name: 'X' });
      expect(gone.text).toMatch(/^404 /);
    });

    it('plans, realizes, edits and ends launches', async () => {
      const { categoryId } = await createCategory();

      const created = await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 3990,
        description: 'Netflix',
        repeatMonths: 3,
        dueDay: 5,
      });
      const occurrences = created.data.transactions as TransactionBody[];
      expect(occurrences.map((t) => t.month)).toEqual([
        '2026-10',
        '2026-11',
        '2026-12',
      ]);

      const listed = await call('list_transactions', { month: '2026-10' });
      expect(listed.data.transactions).toEqual([
        expect.objectContaining({
          description: 'Netflix',
          plannedCents: 3990,
          realizedCents: null,
          series: expect.objectContaining({ index: 1, count: 3 }),
        }),
      ]);

      const realized = await call('set_transaction_realization', {
        transactionId: occurrences[0].id,
        realizedCents: 4190,
      });
      expect(realized.data.transaction).toMatchObject({ realizedCents: 4190 });
      const summary = await call('get_budget_summary', { month: '2026-10' });
      expect(summary.data.summary).toMatchObject({ expenseCents: 4190 });

      const pending = await call('set_transaction_realization', {
        transactionId: occurrences[0].id,
        realizedCents: null,
      });
      expect(pending.data.transaction).toMatchObject({ realizedCents: null });

      const edited = await call('update_transaction', {
        transactionId: occurrences[1].id,
        plannedCents: 4490,
        scope: 'FOLLOWING',
      });
      expect(edited.data.transaction).toMatchObject({ plannedCents: 4490 });
      const december = await call('list_transactions', { month: '2026-12' });
      expect(december.data.transactions).toEqual([
        expect.objectContaining({ plannedCents: 4490 }),
      ]);

      const extended = await call('set_series_end', {
        transactionId: occurrences[0].id,
        untilMonth: '2027-02',
      });
      expect(
        (extended.data.transactions as TransactionBody[]).map((t) => t.month),
      ).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);

      await call('delete_transaction', {
        transactionId: occurrences[1].id,
        scope: 'FOLLOWING',
      });
      expect(
        (await call('list_transactions', { month: '2027-01' })).data
          .transactions,
      ).toEqual([]);
      expect(
        (await call('list_transactions', { month: '2026-10' })).data
          .transactions,
      ).toHaveLength(1);
    });

    it('creates an open-ended launch with an adjustment', async () => {
      const { categoryId } = await createCategory('Moradia', 'Aluguel');
      const created = await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 200000,
        openEnded: true,
        adjustment: { percentBp: 500, everyMonths: 12 },
      });
      expect(created.isError).toBeFalsy();
      const later = await call('list_transactions', { month: '2027-10' });
      expect(later.data.transactions).toEqual([
        expect.objectContaining({ plannedCents: 210000 }),
      ]);
    });

    it('reads and edits the budget grid', async () => {
      const { categoryId } = await createCategory();
      await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 1000,
      });

      const grid = await call('get_budget_lines', {
        from: '2026-10',
        to: '2026-12',
      });
      const [line] = grid.data.lines as {
        anchorId: number;
        categoryId: number;
      }[];
      expect(line.categoryId).toBe(categoryId);
      expect(grid.data.entries).toEqual([
        expect.objectContaining({
          categoryId,
          month: '2026-10',
          amountCents: 1000,
        }),
      ]);

      const saved = await call('set_budget_cells', {
        cells: [
          { anchorId: line.anchorId, month: '2026-10', amountCents: 0 },
          { anchorId: line.anchorId, month: '2026-11', amountCents: 2500 },
        ],
      });
      expect(saved.data).toEqual({ saved: 2 });
      const after = await call('get_budget_lines', {
        from: '2026-10',
        to: '2026-12',
      });
      expect(after.data.entries).toEqual([
        expect.objectContaining({ month: '2026-11', amountCents: 2500 }),
      ]);

      const tooLong = await call('get_budget_lines', {
        from: '2026-01',
        to: '2028-12',
      });
      expect(tooLong.text).toMatch(/^400 /);
    });

    it('sets and follows goals', async () => {
      const housing = await createCategory('Moradia própria', 'Aluguel');
      const leisure = await createCategory('Diversão', 'Cinema');
      const income = await call('create_category_type', {
        kind: 'INCOME',
        name: 'Trabalho',
      });
      const incomeTypeId = (income.data.type as TypeBody).id;
      const salary = await call('create_category', {
        typeId: incomeTypeId,
        name: 'Salário fixo',
      });
      const salaryId = (salary.data.category as { id: number }).id;

      const set = await call('set_goals', {
        goals: [
          { typeId: housing.typeId, goalPercent: 50 },
          { typeId: leisure.typeId, goalPercent: 20 },
        ],
      });
      expect(set.isError).toBeFalsy();
      expect(set.data).toEqual({
        goals: [
          expect.objectContaining({ typeId: housing.typeId, goalPercent: 50 }),
          expect.objectContaining({ typeId: leisure.typeId, goalPercent: 20 }),
        ],
        totalGoalPercent: 70,
      });

      for (const [categoryId, month, plannedCents] of [
        [salaryId, '2026-10', 100000],
        [salaryId, '2026-11', 100000],
        [housing.categoryId, '2026-10', 45000],
        [leisure.categoryId, '2026-10', 30000],
      ] as const) {
        await call('create_transaction', { categoryId, month, plannedCents });
      }

      const read = await call('get_goals', { from: '2026-10', to: '2026-11' });
      expect(read.isError).toBeFalsy();
      expect(read.data.goals).toMatchObject({
        from: '2026-10',
        to: '2026-11',
        totalGoalPercent: 70,
        goals: [
          {
            typeId: housing.typeId,
            goalPercent: 50,
            month: {
              spentCents: 45000,
              incomeCents: 100000,
              targetCents: 50000,
              permille: 450,
              status: 'warning',
            },
            period: { spentCents: 45000, incomeCents: 200000, status: 'ok' },
          },
          {
            typeId: leisure.typeId,
            month: { spentCents: 30000, status: 'over' },
          },
        ],
        leftover: {
          targetPercent: 30,
          month: { spentCents: 25000, targetCents: 30000, status: 'warning' },
          period: { spentCents: 125000, status: 'ok' },
        },
      });

      const removed = await call('set_goals', {
        goals: [{ typeId: leisure.typeId, goalPercent: null }],
      });
      expect(removed.data.goals).toEqual([
        expect.objectContaining({ typeId: housing.typeId, goalPercent: 50 }),
      ]);

      const over = await call('set_goals', {
        goals: [{ typeId: leisure.typeId, goalPercent: 60 }],
      });
      expect(over.data).toMatchObject({
        totalGoalPercent: 110,
        warning: expect.stringContaining('110%'),
      });

      // All or nothing: the income type fails, so the housing goal stays at 50
      const mixed = await call('set_goals', {
        goals: [
          { typeId: housing.typeId, goalPercent: 80 },
          { typeId: incomeTypeId, goalPercent: 10 },
        ],
      });
      expect(mixed.text).toBe('400 Only expense types can have a goal');
      const types = (await call('get_categories')).data.types as TypeBody[];
      expect(types.find((t) => t.id === housing.typeId)?.goalPercent).toBe(50);

      const tooLong = await call('get_goals', {
        from: '2026-01',
        to: '2028-12',
      });
      expect(tooLong.text).toMatch(/^400 /);
    });

    it('sets the initial balance and lists payment methods', async () => {
      const balance = await call('set_initial_balance', { amountCents: -5000 });
      expect(balance.data.initialBalance).toEqual({ amountCents: -5000 });
      const summary = await call('get_budget_summary', { month: '2026-10' });
      expect(summary.data.summary).toMatchObject({
        openingBalanceCents: -5000,
      });

      await createPaymentMethod(ana);
      const methods = await call('list_payment_methods', { month: '2026-10' });
      expect(methods.data.paymentMethods).toEqual([
        expect.objectContaining({ name: 'Cartão Americanas', dueDay: 12 }),
      ]);
    });
  });

  describe('validation', () => {
    it('applies the REST rules to the arguments', async () => {
      const { categoryId } = await createCategory();

      const zero = await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 0,
      });
      expect(zero.isError).toBe(true);
      expect(zero.text).toBe('400 plannedCents must not be less than 1');

      const month = await call('list_transactions', { month: '2026-13' });
      expect(month.text).toBe('400 month must be a month as YYYY-MM');

      const nested = await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 100,
        repeatMonths: 2,
        adjustment: { percentBp: 0, everyMonths: 12 },
      });
      expect(nested.text).toBe(
        '400 adjustment.percentBp must not be less than 1',
      );

      const blank = await call('create_category', { typeId: 1, name: '   ' });
      expect(blank.isError).toBe(true);

      const negative = await call('set_transaction_realization', {
        transactionId: 1,
        realizedCents: -1,
      });
      expect(negative.text).toBe('400 amountCents must not be less than 0');
    });

    it('validates the goals before saving any', async () => {
      const { typeId } = await createCategory();
      for (const [goals, message] of [
        [[], '400 goals must contain at least 1 elements'],
        [
          [{ typeId, goalPercent: 0 }],
          /^400 .*goalPercent must not be less than 1/,
        ],
        [
          [{ typeId, goalPercent: 101 }],
          /^400 .*goalPercent must not be greater than 100/,
        ],
        // The tool's schema already requires it (null removes the goal)
        [[{ typeId }], /goalPercent/],
        [
          [
            { typeId, goalPercent: 10 },
            { typeId, goalPercent: 20 },
          ],
          '400 goals must not repeat a type',
        ],
      ] as const) {
        const res = await call('set_goals', { goals });
        expect(res.isError).toBe(true);
        expect(res.text).toMatch(message);
      }
      const type = await prisma.categoryGroup.findUniqueOrThrow({
        where: { id: typeId },
      });
      expect(type.goalPercent).toBeNull();
    });

    it('rejects arguments of the wrong type before running', async () => {
      const res = await call('list_transactions', { month: 202610 });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/validation/i);
    });
  });

  describe('isolation between users', () => {
    it("one user's agent can't read or change another user's data", async () => {
      const { typeId, categoryId } = await createCategory();
      const created = await call('create_transaction', {
        categoryId,
        month: '2026-10',
        plannedCents: 3990,
      });
      const [transaction] = created.data.transactions as TransactionBody[];
      const grid = await call('get_budget_lines', {
        from: '2026-10',
        to: '2026-10',
      });
      const [line] = grid.data.lines as { anchorId: number }[];

      const bruno = await signUp(api, 'Bruno Lima', 'bruno@example.com');
      const brunoToken = (await connectAgent(api, bruno)).access_token;
      const asBruno = (name: string, args: Record<string, unknown> = {}) =>
        callTool(mcp, brunoToken, name, args);

      expect(
        (await asBruno('list_transactions', { month: '2026-10' })).data,
      ).toEqual({
        transactions: [],
      });
      const brunoTypes = (await asBruno('get_categories')).data
        .types as TypeBody[];
      expect(brunoTypes.map((t) => t.id)).not.toContain(typeId);
      await call('set_goals', { goals: [{ typeId, goalPercent: 30 }] });
      const brunoGoals = await asBruno('get_goals', {
        from: '2026-10',
        to: '2026-10',
      });
      expect(brunoGoals.data.goals).toMatchObject({ goals: [] });

      for (const [name, args] of [
        ['update_category_type', { typeId, name: 'Hack' }],
        ['set_goals', { goals: [{ typeId, goalPercent: 10 }] }],
        ['delete_category_type', { typeId }],
        ['create_category', { typeId, name: 'Hack' }],
        ['update_category', { categoryId, name: 'Hack' }],
        ['delete_category', { categoryId }],
        [
          'create_transaction',
          { categoryId, month: '2026-10', plannedCents: 1 },
        ],
        [
          'update_transaction',
          { transactionId: transaction.id, plannedCents: 1 },
        ],
        ['delete_transaction', { transactionId: transaction.id }],
        [
          'set_transaction_realization',
          { transactionId: transaction.id, realizedCents: 1 },
        ],
        [
          'set_series_end',
          { transactionId: transaction.id, untilMonth: '2027-01' },
        ],
        [
          'set_budget_cells',
          {
            cells: [
              { anchorId: line.anchorId, month: '2026-10', amountCents: 1 },
            ],
          },
        ],
      ] as const) {
        const res = await asBruno(name, args);
        expect({ name, text: res.text }).toEqual({
          name,
          text: expect.stringMatching(/^404 /),
        });
      }

      // Ana's data is intact
      const anaTypes = (await call('get_categories')).data.types as TypeBody[];
      expect(anaTypes.find((t) => t.id === typeId)?.goalPercent).toBe(30);
      const anas = await call('list_transactions', { month: '2026-10' });
      expect(anas.data.transactions).toEqual([
        expect.objectContaining({
          id: transaction.id,
          plannedCents: 3990,
          realizedCents: null,
        }),
      ]);
    });
  });
});
