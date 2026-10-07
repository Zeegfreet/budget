import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, resetDatabase } from './utils.js';

const userBody = (name: string, email: string) => ({
  name,
  email,
  password: 'segredo123',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
});

type Agent = ReturnType<typeof request.agent>;
interface Group {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  name: string;
  categories: { id: number; name: string }[];
}

describe('Budget (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;

  async function signUp(name: string, email: string) {
    const client = request.agent(app.getHttpServer());
    await client.post('/auth/register').send(userBody(name, email)).expect(201);
    return client;
  }

  async function categoryIds(client: Agent) {
    const res = await client.get('/budget/categories').expect(200);
    const groups = res.body as Group[];
    const find = (group: string, category: string) =>
      groups
        .find((g) => g.name === group)!
        .categories.find((c) => c.name === category)!.id;
    return {
      salary: find('Salário', 'Salário'),
      housing: find('Despesas Básicas', 'Moradia'),
      leisure: find('Custos de Vida', 'Lazer'),
    };
  }

  const save = (client: Agent, entries: unknown) =>
    client.put('/budget/entries').send({ entries });

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp('Ana Souza', 'ana@example.com');
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a session on every route', async () => {
    const http = request(app.getHttpServer());
    await http.get('/budget/categories').expect(401);
    await http.get('/budget/entries?from=2026-10&to=2027-09').expect(401);
    await http.put('/budget/entries').send({ entries: [] }).expect(401);
    await http.get('/budget/summary?month=2026-10').expect(401);
    await http
      .put('/budget/initial-balance')
      .send({ amountCents: 1 })
      .expect(401);
  });

  describe('GET /budget/categories', () => {
    it('creates the default types and categories once', async () => {
      const first = await ana.get('/budget/categories').expect(200);
      const second = await ana.get('/budget/categories').expect(200);

      expect(second.body).toEqual(first.body);
      const groups = first.body as Group[];
      expect(groups.map((g) => [g.kind, g.name])).toEqual([
        ['EXPENSE', 'Despesas Básicas'],
        ['EXPENSE', 'Custos de Vida'],
        ['INCOME', 'Salário'],
        ['INCOME', 'Provento'],
        ['INCOME', 'Renda Extra'],
      ]);
      expect(groups[0].categories.map((c) => c.name)).toEqual([
        'Moradia',
        'Alimentação',
        'Transporte',
        'Saúde',
      ]);
    });
  });

  describe('entries', () => {
    it('creates, updates and clears cells, and lists only the range', async () => {
      const ids = await categoryIds(ana);

      await save(ana, [
        { categoryId: ids.salary, month: '2026-10', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-10', amountCents: 180000 },
        { categoryId: ids.housing, month: '2026-11', amountCents: 180000 },
        { categoryId: ids.housing, month: '2027-10', amountCents: 999 },
      ]).expect(204);

      await save(ana, [
        { categoryId: ids.housing, month: '2026-10', amountCents: 190000 },
        { categoryId: ids.housing, month: '2026-11', amountCents: 0 },
      ]).expect(204);

      const res = await ana
        .get('/budget/entries?from=2026-10&to=2027-09')
        .expect(200);
      // Ordered by month, then category (defaults create expenses first)
      expect(res.body).toEqual([
        {
          categoryId: ids.housing,
          month: '2026-10',
          amountCents: 190000,
          count: 1,
          groupCents: 0,
        },
        {
          categoryId: ids.salary,
          month: '2026-10',
          amountCents: 500000,
          count: 1,
          groupCents: 0,
        },
      ]);
    });

    it('clearing a cell that was never set is a no-op', async () => {
      const ids = await categoryIds(ana);
      await save(ana, [
        { categoryId: ids.leisure, month: '2026-10', amountCents: 0 },
      ]).expect(204);
    });

    it.each([
      ['an invalid month', 'from=2026-13&to=2027-09'],
      ['a missing bound', 'from=2026-10'],
      ['from after to', 'from=2026-10&to=2026-09'],
      ['more than 24 months', 'from=2026-01&to=2028-01'],
      ['unknown params', 'from=2026-10&to=2027-09&userId=2'],
    ])('rejects %s in the range with 400', async (_case, query) => {
      await ana.get(`/budget/entries?${query}`).expect(400);
    });

    it.each([
      ['an empty list', []],
      [
        'a negative amount',
        [{ categoryId: 1, month: '2026-10', amountCents: -1 }],
      ],
      [
        'a fractional amount',
        [{ categoryId: 1, month: '2026-10', amountCents: 10.5 }],
      ],
      [
        'an amount as a string',
        [{ categoryId: 1, month: '2026-10', amountCents: '10' }],
      ],
      [
        'an invalid month',
        [{ categoryId: 1, month: '2026-1', amountCents: 10 }],
      ],
      ['a missing category', [{ month: '2026-10', amountCents: 10 }]],
      [
        'an unknown field',
        [{ categoryId: 1, month: '2026-10', amountCents: 10, userId: 2 }],
      ],
      ['not a list', { categoryId: 1 }],
    ])('rejects %s when saving with 400', async (_case, entries) => {
      await save(ana, entries).expect(400);
    });

    it('rejects too many cells in one save', async () => {
      const ids = await categoryIds(ana);
      const entries = Array.from({ length: 1001 }, () => ({
        categoryId: ids.salary,
        month: '2026-10',
        amountCents: 1,
      }));
      await save(ana, entries).expect(400);
    });

    it('returns 404 for a category that does not exist', async () => {
      await save(ana, [
        { categoryId: 999999, month: '2026-10', amountCents: 10 },
      ]).expect(404);
    });
  });

  describe('summary and initial balance', () => {
    it('opens with the initial balance plus previous months', async () => {
      const ids = await categoryIds(ana);
      await save(ana, [
        { categoryId: ids.salary, month: '2026-08', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-08', amountCents: 200000 },
        { categoryId: ids.salary, month: '2026-09', amountCents: 500000 },
        { categoryId: ids.leisure, month: '2026-09', amountCents: 100000 },
        { categoryId: ids.salary, month: '2026-10', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-10', amountCents: 650000 },
        { categoryId: ids.housing, month: '2026-11', amountCents: 1 },
      ]).expect(204);

      const balance = await ana
        .put('/budget/initial-balance')
        .send({ amountCents: -50000 })
        .expect(200);
      expect(balance.body).toEqual({ amountCents: -50000 });

      const res = await ana.get('/budget/summary?month=2026-10').expect(200);
      expect(res.body).toEqual({
        month: '2026-10',
        initialBalanceCents: -50000,
        openingBalanceCents: 650000,
        incomeCents: 500000,
        expenseCents: 650000,
        monthBalanceCents: -150000,
        closingBalanceCents: 500000,
      });
    });

    it('starts at zero for a new user', async () => {
      const res = await ana.get('/budget/summary?month=2026-10').expect(200);
      expect(res.body).toMatchObject({
        openingBalanceCents: 0,
        closingBalanceCents: 0,
      });
    });

    it.each([
      ['an invalid month', '/budget/summary?month=2026-1'],
      ['a missing month', '/budget/summary'],
    ])('rejects %s with 400', async (_case, url) => {
      await ana.get(url).expect(400);
    });

    it.each([
      ['a fractional amount', { amountCents: 1.5 }],
      ['a missing amount', {}],
      ['an unknown field', { amountCents: 1, userId: 2 }],
    ])('rejects %s in the initial balance with 400', async (_case, body) => {
      await ana.put('/budget/initial-balance').send(body).expect(400);
    });
  });

  describe('isolation between users', () => {
    it('user A cannot read or change user B’s budget', async () => {
      const anaIds = await categoryIds(ana);
      await save(ana, [
        { categoryId: anaIds.salary, month: '2026-10', amountCents: 500000 },
      ]).expect(204);
      await ana
        .put('/budget/initial-balance')
        .send({ amountCents: 1000 })
        .expect(200);

      const bruno = await signUp('Bruno Lima', 'bruno@example.com');
      const brunoIds = await categoryIds(bruno);
      expect(brunoIds.salary).not.toBe(anaIds.salary);

      // Writing into Ana's category is a 404, even mixed with own cells
      await save(bruno, [
        { categoryId: brunoIds.salary, month: '2026-10', amountCents: 1 },
        { categoryId: anaIds.salary, month: '2026-10', amountCents: 0 },
      ]).expect(404);

      const brunoEntries = await bruno
        .get('/budget/entries?from=2026-01&to=2027-12')
        .expect(200);
      expect(brunoEntries.body).toEqual([]);

      const brunoSummary = await bruno
        .get('/budget/summary?month=2026-11')
        .expect(200);
      expect(brunoSummary.body).toMatchObject({
        initialBalanceCents: 0,
        openingBalanceCents: 0,
      });

      // Ana's data is untouched
      const anaEntries = await ana
        .get('/budget/entries?from=2026-10&to=2026-10')
        .expect(200);
      expect(anaEntries.body).toEqual([
        {
          categoryId: anaIds.salary,
          month: '2026-10',
          amountCents: 500000,
          count: 1,
          groupCents: 0,
        },
      ]);
    });
  });
});
