import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { addTransactions, createTestApp, resetDatabase } from './utils.js';

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

  const save = (client: Agent, cells: unknown) =>
    client.put('/budget/lines').send({ cells });

  interface Line {
    anchorId: number;
    categoryId: number;
    description: string | null;
    dueDay: number | null;
    cells: { month: string; transactionId: number; plannedCents: number }[];
  }

  const lines = async (client: Agent, from: string, to: string) =>
    (await client.get(`/budget/lines?from=${from}&to=${to}`).expect(200))
      .body as Line[];

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
    await http.get('/budget/lines?from=2026-10&to=2027-09').expect(401);
    await http.put('/budget/lines').send({ cells: [] }).expect(401);
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
    it('sums the planned amounts per cell and lists only the range', async () => {
      const ids = await categoryIds(ana);
      await addTransactions(ana, [
        { categoryId: ids.salary, month: '2026-10', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-10', amountCents: 180000 },
        { categoryId: ids.housing, month: '2026-10', amountCents: 10000 },
        { categoryId: ids.housing, month: '2027-10', amountCents: 999 },
      ]);

      const res = await ana
        .get('/budget/entries?from=2026-10&to=2027-09')
        .expect(200);
      // Ordered by month, then category (defaults create expenses first)
      expect(res.body).toEqual([
        {
          categoryId: ids.housing,
          month: '2026-10',
          amountCents: 190000,
          count: 2,
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

    it.each([
      ['an invalid month', 'from=2026-13&to=2027-09'],
      ['a missing bound', 'from=2026-10'],
      ['from after to', 'from=2026-10&to=2026-09'],
      ['more than 24 months', 'from=2026-01&to=2028-01'],
      ['unknown params', 'from=2026-10&to=2027-09&userId=2'],
    ])('rejects %s in the range with 400', async (_case, query) => {
      await ana.get(`/budget/entries?${query}`).expect(400);
      await ana.get(`/budget/lines?${query}`).expect(400);
    });
  });

  describe('lines', () => {
    it('lists one row per series or plain launch, by due day', async () => {
      const ids = await categoryIds(ana);
      const series = await ana
        .post('/budget/transactions')
        .send({
          categoryId: ids.leisure,
          month: '2026-09',
          description: 'Netflix',
          plannedCents: 5590,
          dueDay: 20,
          repeatMonths: 3,
        })
        .expect(201);
      const [plain] = await addTransactions(ana, [
        { categoryId: ids.leisure, month: '2026-10', amountCents: 3000 },
      ]);
      await ana
        .post('/budget/transactions')
        .send({
          categoryId: ids.leisure,
          month: '2026-11',
          description: 'Spotify',
          plannedCents: 2190,
          dueDay: 5,
        })
        .expect(201);

      const rows = await lines(ana, '2026-10', '2026-12');

      const [, oct, nov] = (series.body as { id: number }[]).map((t) => t.id);
      expect(rows.map((l) => [l.description, l.dueDay])).toEqual([
        ['Spotify', 5],
        ['Netflix', 20],
        [null, null],
      ]);
      expect(rows[1]).toEqual({
        anchorId: oct,
        categoryId: ids.leisure,
        description: 'Netflix',
        dueDay: 20,
        paymentMethod: null,
        cells: [
          {
            month: '2026-10',
            transactionId: oct,
            plannedCents: 5590,
            realizedCents: null,
          },
          {
            month: '2026-11',
            transactionId: nov,
            plannedCents: 5590,
            realizedCents: null,
          },
        ],
      });
      expect(rows[2].anchorId).toBe(plain);
    });

    it('updates, clears and adds months to a row, which shows in the statement', async () => {
      const ids = await categoryIds(ana);
      const created = await ana
        .post('/budget/transactions')
        .send({
          categoryId: ids.leisure,
          month: '2026-10',
          description: 'Netflix',
          plannedCents: 5590,
          dueDay: 20,
          repeatMonths: 2,
        })
        .expect(201);
      const [oct] = (created.body as { id: number }[]).map((t) => t.id);

      await save(ana, [
        { anchorId: oct, month: '2026-10', amountCents: 100 },
        { anchorId: oct, month: '2026-10', amountCents: 6000 },
        { anchorId: oct, month: '2026-11', amountCents: 0 },
        { anchorId: oct, month: '2026-12', amountCents: 6500 },
        { anchorId: oct, month: '2027-01', amountCents: 0 },
      ]).expect(204);

      const [row] = await lines(ana, '2026-10', '2027-01');
      expect(row.cells.map((c) => [c.month, c.plannedCents])).toEqual([
        ['2026-10', 6000],
        ['2026-12', 6500],
      ]);
      const statement = await ana
        .get('/budget/transactions?month=2026-12')
        .expect(200);
      expect(statement.body).toEqual([
        expect.objectContaining({
          description: 'Netflix',
          plannedCents: 6500,
          dueDay: 20,
          ownDueDay: 20,
          series: {
            index: 2,
            count: 2,
            firstMonth: '2026-10',
            lastMonth: '2026-12',
          },
        }),
      ]);
    });

    it('turns a plain launch into a series when another month gets a value', async () => {
      const ids = await categoryIds(ana);
      const [id] = await addTransactions(ana, [
        { categoryId: ids.housing, month: '2026-10', amountCents: 180000 },
      ]);

      await save(ana, [
        { anchorId: id, month: '2026-11', amountCents: 180000 },
      ]).expect(204);

      const rows = await lines(ana, '2026-10', '2026-11');
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.map((c) => c.month)).toEqual(['2026-10', '2026-11']);
    });

    it('rejects writing to an inactive category but still clears it', async () => {
      const ids = await categoryIds(ana);
      const [id] = await addTransactions(ana, [
        { categoryId: ids.leisure, month: '2026-10', amountCents: 100 },
      ]);
      await ana
        .patch(`/budget/categories/${ids.leisure}`)
        .send({ active: false })
        .expect(200);

      await save(ana, [
        { anchorId: id, month: '2026-11', amountCents: 100 },
      ]).expect(400);
      await save(ana, [
        { anchorId: id, month: '2026-10', amountCents: 200 },
      ]).expect(400);
      await save(ana, [
        { anchorId: id, month: '2026-10', amountCents: 0 },
      ]).expect(204);
      expect(await lines(ana, '2026-10', '2026-12')).toEqual([]);
    });

    it.each([
      ['an empty list', []],
      [
        'a negative amount',
        [{ anchorId: 1, month: '2026-10', amountCents: -1 }],
      ],
      [
        'a fractional amount',
        [{ anchorId: 1, month: '2026-10', amountCents: 10.5 }],
      ],
      [
        'an amount as a string',
        [{ anchorId: 1, month: '2026-10', amountCents: '10' }],
      ],
      ['an invalid month', [{ anchorId: 1, month: '2026-1', amountCents: 10 }]],
      ['a missing launch', [{ month: '2026-10', amountCents: 10 }]],
      [
        'an unknown field',
        [{ anchorId: 1, month: '2026-10', amountCents: 10, userId: 2 }],
      ],
      ['not a list', { anchorId: 1 }],
    ])('rejects %s when saving with 400', async (_case, cells) => {
      await save(ana, cells).expect(400);
    });

    it('rejects too many cells in one save', async () => {
      const cells = Array.from({ length: 1001 }, () => ({
        anchorId: 1,
        month: '2026-10',
        amountCents: 1,
      }));
      await save(ana, cells).expect(400);
    });

    it('returns 404 for a launch that does not exist', async () => {
      await save(ana, [
        { anchorId: 999999, month: '2026-10', amountCents: 10 },
      ]).expect(404);
    });
  });

  describe('summary and initial balance', () => {
    it('opens with the initial balance plus previous months', async () => {
      const ids = await categoryIds(ana);
      await addTransactions(ana, [
        { categoryId: ids.salary, month: '2026-08', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-08', amountCents: 200000 },
        { categoryId: ids.salary, month: '2026-09', amountCents: 500000 },
        { categoryId: ids.leisure, month: '2026-09', amountCents: 100000 },
        { categoryId: ids.salary, month: '2026-10', amountCents: 500000 },
        { categoryId: ids.housing, month: '2026-10', amountCents: 650000 },
        { categoryId: ids.housing, month: '2026-11', amountCents: 1 },
      ]);

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
      const [anaLaunch] = await addTransactions(ana, [
        { categoryId: anaIds.salary, month: '2026-10', amountCents: 500000 },
      ]);
      await ana
        .put('/budget/initial-balance')
        .send({ amountCents: 1000 })
        .expect(200);

      const bruno = await signUp('Bruno Lima', 'bruno@example.com');
      const brunoIds = await categoryIds(bruno);
      expect(brunoIds.salary).not.toBe(anaIds.salary);

      // Writing into Ana's launch is a 404, even mixed with own cells
      const [brunoLaunch] = await addTransactions(bruno, [
        { categoryId: brunoIds.salary, month: '2026-10', amountCents: 1 },
      ]);
      await save(bruno, [
        { anchorId: brunoLaunch, month: '2026-10', amountCents: 2 },
        { anchorId: anaLaunch, month: '2026-10', amountCents: 0 },
      ]).expect(404);
      await save(bruno, [
        { anchorId: anaLaunch, month: '2026-11', amountCents: 5 },
      ]).expect(404);

      const brunoLines = await lines(bruno, '2026-01', '2027-12');
      expect(brunoLines.map((l) => l.anchorId)).toEqual([brunoLaunch]);
      expect(brunoLines[0].cells[0].plannedCents).toBe(1);

      const brunoSummary = await bruno
        .get('/budget/summary?month=2026-11')
        .expect(200);
      // Only his own launch (the failed save changed nothing)
      expect(brunoSummary.body).toMatchObject({
        initialBalanceCents: 0,
        openingBalanceCents: 1,
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
