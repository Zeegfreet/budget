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
  name: string;
  categories: { id: number; name: string }[];
}
interface Transaction {
  id: number;
  month: string;
  description: string | null;
  plannedCents: number;
  realizedCents: number | null;
  series: { index: number; count: number } | null;
  category: {
    id: number;
    name: string;
    dueDay: number | null;
    active: boolean;
    group: { id: number; name: string; kind: string; active: boolean };
  };
}

describe('Transactions (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let ids: { salary: number; housing: number; leisure: number; basics: number };

  async function signUp(name: string, email: string) {
    const client = request.agent(app.getHttpServer());
    await client.post('/auth/register').send(userBody(name, email)).expect(201);
    return client;
  }

  async function categoryIds(client: Agent) {
    const res = await client.get('/budget/categories').expect(200);
    const groups = res.body as Group[];
    const group = (name: string) => groups.find((g) => g.name === name)!;
    const find = (g: string, category: string) =>
      group(g).categories.find((c) => c.name === category)!.id;
    return {
      salary: find('Salário', 'Salário'),
      housing: find('Despesas Básicas', 'Moradia'),
      leisure: find('Custos de Vida', 'Lazer'),
      basics: group('Despesas Básicas').id,
    };
  }

  const create = (client: Agent, body: Record<string, unknown>) =>
    client.post('/budget/transactions').send(body);

  async function month(client: Agent, m: string) {
    const res = await client.get(`/budget/transactions?month=${m}`).expect(200);
    return res.body as Transaction[];
  }

  /** Creates a 12-month series of R$ 100 rent starting in October 2026 */
  async function rentSeries(client = ana, categoryId = ids.housing) {
    const res = await create(client, {
      categoryId,
      month: '2026-10',
      description: 'Aluguel',
      plannedCents: 10000,
      repeatMonths: 12,
    }).expect(201);
    return res.body as Transaction[];
  }

  const summary = async (client: Agent, m: string) =>
    (await client.get(`/budget/summary?month=${m}`).expect(200)).body as {
      openingBalanceCents: number;
      incomeCents: number;
      expenseCents: number;
    };

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp('Ana Souza', 'ana@example.com');
    ids = await categoryIds(ana);
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a session on every route', async () => {
    const http = request(app.getHttpServer());
    await http.get('/budget/transactions?month=2026-10').expect(401);
    await http.post('/budget/transactions').send({}).expect(401);
    await http.patch('/budget/transactions/1').send({}).expect(401);
    await http.delete('/budget/transactions/1').expect(401);
    await http
      .put('/budget/transactions/1/realization')
      .send({ amountCents: 1 })
      .expect(401);
    await http.delete('/budget/transactions/1/realization').expect(401);
  });

  describe('POST /budget/transactions', () => {
    it('creates a single transaction', async () => {
      const res = await create(ana, {
        categoryId: ids.leisure,
        month: '2026-10',
        description: '  Cinema  ',
        plannedCents: 4500,
      }).expect(201);

      expect(res.body).toEqual([
        {
          id: expect.any(Number),
          month: '2026-10',
          description: 'Cinema',
          plannedCents: 4500,
          realizedCents: null,
          series: null,
          category: {
            id: ids.leisure,
            name: 'Lazer',
            dueDay: null,
            active: true,
            group: {
              id: expect.any(Number),
              name: 'Custos de Vida',
              kind: 'EXPENSE',
              active: true,
            },
          },
        },
      ]);
    });

    it('repeats a transaction for the next months as a series', async () => {
      const created = await rentSeries();

      expect(created.map((t) => t.month)).toEqual([
        '2026-10',
        '2026-11',
        '2026-12',
        '2027-01',
        '2027-02',
        '2027-03',
        '2027-04',
        '2027-05',
        '2027-06',
        '2027-07',
        '2027-08',
        '2027-09',
      ]);
      expect(created.map((t) => t.series)).toEqual(
        created.map((_, i) => ({ index: i + 1, count: 12 })),
      );

      const [march] = await month(ana, '2027-03');
      expect(march).toMatchObject({
        description: 'Aluguel',
        series: { index: 6, count: 12 },
      });
    });

    it.each([
      ['a missing category', { month: '2026-10', plannedCents: 1 }],
      ['a zero amount', { categoryId: 1, month: '2026-10', plannedCents: 0 }],
      [
        'a fractional amount',
        { categoryId: 1, month: '2026-10', plannedCents: 1.5 },
      ],
      [
        'an amount over the limit',
        { categoryId: 1, month: '2026-10', plannedCents: 100_000_000_001 },
      ],
      [
        'an invalid month',
        { categoryId: 1, month: '2026-13', plannedCents: 1 },
      ],
      [
        'zero repetitions',
        { categoryId: 1, month: '2026-10', plannedCents: 1, repeatMonths: 0 },
      ],
      [
        'more than 60 repetitions',
        { categoryId: 1, month: '2026-10', plannedCents: 1, repeatMonths: 61 },
      ],
      [
        'a too long description',
        {
          categoryId: 1,
          month: '2026-10',
          plannedCents: 1,
          description: 'x'.repeat(121),
        },
      ],
      [
        'an unknown field',
        { categoryId: 1, month: '2026-10', plannedCents: 1, userId: 2 },
      ],
    ])('rejects %s with 400', async (_case, body) => {
      await create(ana, body).expect(400);
    });

    it('returns 404 for a category that does not exist', async () => {
      await create(ana, {
        categoryId: 999999,
        month: '2026-10',
        plannedCents: 1,
      }).expect(404);
    });

    it('rejects an inactive category with 400', async () => {
      await ana
        .patch(`/budget/categories/${ids.leisure}`)
        .send({ active: false })
        .expect(200);
      await create(ana, {
        categoryId: ids.leisure,
        month: '2026-10',
        plannedCents: 1,
      }).expect(400);
    });
  });

  describe('GET /budget/transactions', () => {
    it('lists the month by due day, then the grid order', async () => {
      await ana
        .patch(`/budget/categories/${ids.leisure}`)
        .send({ dueDay: 5 })
        .expect(200);
      await create(ana, {
        categoryId: ids.salary,
        month: '2026-10',
        plannedCents: 500000,
      }).expect(201);
      await create(ana, {
        categoryId: ids.housing,
        month: '2026-10',
        plannedCents: 1000,
      }).expect(201);
      await create(ana, {
        categoryId: ids.leisure,
        month: '2026-10',
        plannedCents: 2000,
      }).expect(201);
      await create(ana, {
        categoryId: ids.housing,
        month: '2026-11',
        plannedCents: 3000,
      }).expect(201);

      const list = await month(ana, '2026-10');
      expect(list.map((t) => t.category.name)).toEqual([
        'Lazer',
        'Moradia',
        'Salário',
      ]);
    });

    it.each([
      ['a missing month', ''],
      ['an invalid month', '?month=2026-1'],
      ['an unknown param', '?month=2026-10&userId=1'],
    ])('rejects %s with 400', async (_case, query) => {
      await ana.get(`/budget/transactions${query}`).expect(400);
    });
  });

  describe('realization', () => {
    it('marks as realized with another amount and back, and the balances follow', async () => {
      const [salary] = (
        await create(ana, {
          categoryId: ids.salary,
          month: '2026-10',
          plannedCents: 500000,
        }).expect(201)
      ).body as Transaction[];
      const [rent] = (await rentSeries()) as Transaction[];

      const realized = await ana
        .put(`/budget/transactions/${rent.id}/realization`)
        .send({ amountCents: 12500 })
        .expect(200);
      expect(realized.body).toMatchObject({
        plannedCents: 10000,
        realizedCents: 12500,
      });
      expect(await summary(ana, '2026-10')).toMatchObject({
        incomeCents: 500000,
        expenseCents: 12500,
      });
      // The grid keeps the planned amount
      const grid = await ana.get('/budget/entries?from=2026-10&to=2026-10');
      expect(grid.body).toContainEqual({
        categoryId: ids.housing,
        month: '2026-10',
        amountCents: 10000,
        count: 1,
      });
      // Later months open with the realized amount
      expect((await summary(ana, '2026-11')).openingBalanceCents).toBe(487500);

      await ana
        .put(`/budget/transactions/${salary.id}/realization`)
        .send({ amountCents: 0 })
        .expect(200);
      expect((await summary(ana, '2026-10')).incomeCents).toBe(0);

      const undone = await ana
        .delete(`/budget/transactions/${rent.id}/realization`)
        .expect(200);
      expect(undone.body.realizedCents).toBeNull();
      expect((await summary(ana, '2026-10')).expenseCents).toBe(10000);
    });

    it.each([
      ['a negative amount', { amountCents: -1 }],
      ['a missing amount', {}],
      ['an unknown field', { amountCents: 1, userId: 2 }],
    ])('rejects %s with 400', async (_case, body) => {
      const [rent] = await rentSeries();
      await ana
        .put(`/budget/transactions/${rent.id}/realization`)
        .send(body)
        .expect(400);
    });
  });

  describe('PATCH /budget/transactions/:id', () => {
    it('changes only this occurrence by default', async () => {
      const series = await rentSeries();

      const res = await ana
        .patch(`/budget/transactions/${series[2].id}`)
        .send({ plannedCents: 15000, description: 'Aluguel + condomínio' })
        .expect(200);
      expect(res.body).toMatchObject({
        plannedCents: 15000,
        description: 'Aluguel + condomínio',
        series: { index: 3, count: 12 },
      });

      expect((await month(ana, '2026-11'))[0].plannedCents).toBe(10000);
      expect((await month(ana, '2027-01'))[0].plannedCents).toBe(10000);
    });

    it('with FOLLOWING changes the later pending occurrences, keeping earlier and realized ones', async () => {
      const series = await rentSeries();
      // Realize the fifth occurrence (2027-02)
      await ana
        .put(`/budget/transactions/${series[4].id}/realization`)
        .send({ amountCents: 10000 })
        .expect(200);

      await ana
        .patch(`/budget/transactions/${series[2].id}`)
        .send({
          plannedCents: 20000,
          categoryId: ids.leisure,
          scope: 'FOLLOWING',
        })
        .expect(200);

      const planned = async (m: string) => (await month(ana, m))[0];
      expect(await planned('2026-11')).toMatchObject({ plannedCents: 10000 });
      expect(await planned('2026-12')).toMatchObject({
        plannedCents: 20000,
        category: { id: ids.leisure },
      });
      expect(await planned('2027-01')).toMatchObject({ plannedCents: 20000 });
      expect(await planned('2027-02')).toMatchObject({
        plannedCents: 10000,
        category: { id: ids.housing },
      });
      expect(await planned('2027-09')).toMatchObject({ plannedCents: 20000 });
    });

    it('clears the description with null', async () => {
      const [rent] = await rentSeries();
      const res = await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ description: null })
        .expect(200);
      expect(res.body.description).toBeNull();
    });

    it.each([
      ['a zero amount', { plannedCents: 0 }],
      ['an invalid scope', { scope: 'ALL' }],
      ['a null category', { categoryId: null }],
      ['a month (not editable)', { month: '2026-11' }],
      ['an unknown field', { userId: 2 }],
    ])('rejects %s with 400', async (_case, body) => {
      const [rent] = await rentSeries();
      await ana.patch(`/budget/transactions/${rent.id}`).send(body).expect(400);
    });

    it('rejects moving to an inactive category, or editing in one', async () => {
      const [rent] = await rentSeries();
      await ana
        .patch(`/budget/categories/${ids.leisure}`)
        .send({ active: false })
        .expect(200);
      await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ categoryId: ids.leisure })
        .expect(400);

      await ana
        .patch(`/budget/groups/${ids.basics}`)
        .send({ active: false })
        .expect(200);
      await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ plannedCents: 1 })
        .expect(400);
    });

    it('returns 404 for a transaction that does not exist', async () => {
      await ana
        .patch('/budget/transactions/999999')
        .send({ plannedCents: 1 })
        .expect(404);
    });
  });

  describe('DELETE /budget/transactions/:id', () => {
    it('deletes only this occurrence by default', async () => {
      const series = await rentSeries();

      await ana.delete(`/budget/transactions/${series[1].id}`).expect(204);

      expect(await month(ana, '2026-11')).toEqual([]);
      const [december] = await month(ana, '2026-12');
      expect(december.series).toEqual({ index: 2, count: 11 });
    });

    it('with FOLLOWING deletes the later pending occurrences, keeping earlier and realized ones', async () => {
      const series = await rentSeries();
      await ana
        .put(`/budget/transactions/${series[6].id}/realization`)
        .send({ amountCents: 10000 })
        .expect(200);

      await ana
        .delete(`/budget/transactions/${series[3].id}?scope=FOLLOWING`)
        .expect(204);

      const remaining = await ana
        .get('/budget/entries?from=2026-10&to=2027-12')
        .expect(200);
      expect(
        (remaining.body as { month: string }[]).map((e) => e.month),
      ).toEqual(['2026-10', '2026-11', '2026-12', '2027-04']);
    });

    it('rejects an invalid scope with 400 and an unknown id with 404', async () => {
      const [rent] = await rentSeries();
      await ana.delete(`/budget/transactions/${rent.id}?scope=ALL`).expect(400);
      await ana.delete('/budget/transactions/999999').expect(404);
    });
  });

  describe('grid cells', () => {
    it('sums several transactions and refuses to edit that cell from the grid', async () => {
      await create(ana, {
        categoryId: ids.leisure,
        month: '2026-10',
        plannedCents: 1000,
      }).expect(201);
      await create(ana, {
        categoryId: ids.leisure,
        month: '2026-10',
        plannedCents: 2500,
      }).expect(201);

      const grid = await ana
        .get('/budget/entries?from=2026-10&to=2026-10')
        .expect(200);
      expect(grid.body).toEqual([
        {
          categoryId: ids.leisure,
          month: '2026-10',
          amountCents: 3500,
          count: 2,
        },
      ]);

      await ana
        .put('/budget/entries')
        .send({
          entries: [
            { categoryId: ids.leisure, month: '2026-10', amountCents: 1 },
          ],
        })
        .expect(409);
    });

    it('editing a single-transaction cell changes that transaction', async () => {
      const [rent] = await rentSeries();
      await ana
        .put('/budget/entries')
        .send({
          entries: [
            { categoryId: ids.housing, month: '2026-10', amountCents: 999 },
          ],
        })
        .expect(204);

      const [october] = await month(ana, '2026-10');
      expect(october).toMatchObject({
        id: rent.id,
        description: 'Aluguel',
        plannedCents: 999,
      });
    });
  });

  describe('isolation between users', () => {
    it('user A cannot read, change, realize or delete user B’s transactions', async () => {
      const [anaRent] = await rentSeries();

      const bruno = await signUp('Bruno Lima', 'bruno@example.com');
      const brunoIds = await categoryIds(bruno);

      expect(await month(bruno, '2026-10')).toEqual([]);
      await bruno
        .patch(`/budget/transactions/${anaRent.id}`)
        .send({ plannedCents: 1 })
        .expect(404);
      await bruno
        .put(`/budget/transactions/${anaRent.id}/realization`)
        .send({ amountCents: 1 })
        .expect(404);
      await bruno
        .delete(`/budget/transactions/${anaRent.id}/realization`)
        .expect(404);
      await bruno
        .delete(`/budget/transactions/${anaRent.id}?scope=FOLLOWING`)
        .expect(404);
      // Nor create in, or move his own transaction into, Ana's category
      await create(bruno, {
        categoryId: ids.housing,
        month: '2026-10',
        plannedCents: 1,
      }).expect(404);
      const [brunoRent] = await rentSeries(bruno, brunoIds.housing);
      await bruno
        .patch(`/budget/transactions/${brunoRent.id}`)
        .send({ categoryId: ids.leisure })
        .expect(404);

      // Ana's data is untouched
      const anaOctober = await month(ana, '2026-10');
      expect(anaOctober).toHaveLength(1);
      expect(anaOctober[0]).toMatchObject({
        id: anaRent.id,
        plannedCents: 10000,
        realizedCents: null,
        series: { index: 1, count: 12 },
      });
    });
  });
});
