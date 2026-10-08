import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, resetDatabase, signUp as signUpUser } from './utils.js';

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
  series: {
    index: number;
    count: number;
    firstMonth: string;
    lastMonth: string;
  } | null;
  dueDay: number | null;
  ownDueDay: number | null;
  paymentUrl: string | null;
  category: {
    id: number;
    name: string;
    active: boolean;
    group: { id: number; name: string; kind: string; active: boolean };
  };
}

describe('Transactions (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let ids: { salary: number; housing: number; leisure: number; basics: number };

  const signUp = (name: string, email: string) => signUpUser(app, name, email);

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
    await http
      .put('/budget/transactions/1/series')
      .send({ untilMonth: '2027-01' })
      .expect(401);
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
          paymentMethod: null,
          dueDay: null,
          ownDueDay: null,
          paymentUrl: null,
          category: {
            id: ids.leisure,
            name: 'Lazer',
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
        created.map((_, i) => ({
          index: i + 1,
          count: 12,
          firstMonth: '2026-10',
          lastMonth: '2027-09',
        })),
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
        'due day 0',
        { categoryId: 1, month: '2026-10', plannedCents: 1, dueDay: 0 },
      ],
      [
        'due day 32',
        { categoryId: 1, month: '2026-10', plannedCents: 1, dueDay: 32 },
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
        dueDay: 5,
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
      // The grid follows the realized amount too
      const grid = await ana.get('/budget/entries?from=2026-10&to=2026-10');
      expect(grid.body).toContainEqual({
        categoryId: ids.housing,
        month: '2026-10',
        amountCents: 12500,
        count: 1,
        groupCents: 0,
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
      expect(december.series).toMatchObject({ index: 2, count: 11 });
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

  describe('due day', () => {
    it('keeps the launch’s own due day in the whole series and edits it with FOLLOWING', async () => {
      const series = (
        await create(ana, {
          categoryId: ids.housing,
          month: '2026-10',
          plannedCents: 1000,
          dueDay: 10,
          repeatMonths: 3,
        }).expect(201)
      ).body as Transaction[];
      expect(series.map((t) => [t.dueDay, t.ownDueDay])).toEqual([
        [10, 10],
        [10, 10],
        [10, 10],
      ]);

      await ana
        .patch(`/budget/transactions/${series[1].id}`)
        .send({ dueDay: 15, scope: 'FOLLOWING' })
        .expect(200);
      await ana
        .patch(`/budget/transactions/${series[2].id}`)
        .send({ dueDay: null })
        .expect(200);

      expect((await month(ana, '2026-10'))[0].dueDay).toBe(10);
      expect((await month(ana, '2026-11'))[0].dueDay).toBe(15);
      expect((await month(ana, '2026-12'))[0].dueDay).toBeNull();
    });

    it.each([0, 32, 1.5, '10'])(
      'rejects due day %s when editing with 400',
      async (dueDay) => {
        const [rent] = await rentSeries();
        await ana
          .patch(`/budget/transactions/${rent.id}`)
          .send({ dueDay })
          .expect(400);
      },
    );
  });

  describe('payment link', () => {
    const BILL = 'https://www.banco.com.br/boleto/123?via=2';
    const PORTAL = 'https://portal.energia.com.br/pagar';

    it('repeats the link in the series, edits it with FOLLOWING and clears it with null', async () => {
      const series = (
        await create(ana, {
          categoryId: ids.housing,
          month: '2026-10',
          plannedCents: 1000,
          paymentUrl: `  ${BILL} `,
          repeatMonths: 3,
        }).expect(201)
      ).body as Transaction[];
      expect(series.map((t) => t.paymentUrl)).toEqual([BILL, BILL, BILL]);

      const edited = await ana
        .patch(`/budget/transactions/${series[1].id}`)
        .send({ paymentUrl: PORTAL, scope: 'FOLLOWING' })
        .expect(200);
      expect(edited.body).toMatchObject({ paymentUrl: PORTAL });
      await ana
        .patch(`/budget/transactions/${series[2].id}`)
        .send({ paymentUrl: null })
        .expect(200);
      // Other fields leave it alone
      await ana
        .patch(`/budget/transactions/${series[0].id}`)
        .send({ description: 'Luz' })
        .expect(200);

      expect((await month(ana, '2026-10'))[0]).toMatchObject({
        description: 'Luz',
        paymentUrl: BILL,
      });
      expect((await month(ana, '2026-11'))[0].paymentUrl).toBe(PORTAL);
      expect((await month(ana, '2026-12'))[0].paymentUrl).toBeNull();
    });

    it('starts without a link and treats a blank one as none', async () => {
      const [plain] = (
        await create(ana, {
          categoryId: ids.leisure,
          month: '2026-10',
          plannedCents: 4500,
        }).expect(201)
      ).body as Transaction[];
      expect(plain.paymentUrl).toBeNull();

      const [blank] = (
        await create(ana, {
          categoryId: ids.leisure,
          month: '2026-10',
          plannedCents: 4500,
          paymentUrl: '   ',
        }).expect(201)
      ).body as Transaction[];
      expect(blank.paymentUrl).toBeNull();
    });

    it('copies it to the copies made by the series range and the grid', async () => {
      const [single] = (
        await create(ana, {
          categoryId: ids.housing,
          month: '2026-10',
          plannedCents: 1000,
          paymentUrl: BILL,
        }).expect(201)
      ).body as Transaction[];

      const extended = await ana
        .put(`/budget/transactions/${single.id}/series`)
        .send({ untilMonth: '2026-11' })
        .expect(200);
      expect((extended.body as Transaction[]).map((t) => t.paymentUrl)).toEqual(
        [BILL, BILL],
      );

      await ana
        .put('/budget/lines')
        .send({
          cells: [{ anchorId: single.id, month: '2026-12', amountCents: 1500 }],
        })
        .expect(204);
      expect((await month(ana, '2026-12'))[0].paymentUrl).toBe(BILL);
      const lines = await ana
        .get('/budget/lines?from=2026-10&to=2026-12')
        .expect(200);
      expect(lines.body[0]).toMatchObject({ paymentUrl: BILL });
    });

    it.each([
      ['a text that is not a link', 'boleto do mês'],
      ['a link without protocol', 'www.banco.com.br/boleto'],
      ['a javascript: link', 'javascript:alert(1)'],
      ['an ftp link', 'ftp://banco.com.br/boleto'],
      ['a number', 123],
      ['a link too long', `https://banco.com.br/${'a'.repeat(2000)}`],
    ])('rejects %s with 400', async (_case, paymentUrl) => {
      await create(ana, {
        categoryId: ids.housing,
        month: '2026-10',
        plannedCents: 1000,
        paymentUrl,
      }).expect(400);
      const [rent] = await rentSeries();
      await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ paymentUrl })
        .expect(400);
    });
  });

  describe('series range', () => {
    const setEnd = (client: Agent, id: number, untilMonth: unknown) =>
      client.put(`/budget/transactions/${id}/series`).send({ untilMonth });

    it('extends a series with copies of its last occurrence', async () => {
      const series = await rentSeries();
      await ana
        .patch(`/budget/transactions/${series[11].id}`)
        .send({ plannedCents: 12000, dueDay: 5 })
        .expect(200);

      const res = await setEnd(ana, series[3].id, '2027-11').expect(200);

      const all = res.body as Transaction[];
      expect(all).toHaveLength(14);
      expect(all.at(-1)).toMatchObject({
        month: '2027-11',
        plannedCents: 12000,
        realizedCents: null,
        dueDay: 5,
        description: 'Aluguel',
        series: {
          index: 14,
          count: 14,
          firstMonth: '2026-10',
          lastMonth: '2027-11',
        },
      });
      expect((await month(ana, '2026-10'))[0].series).toMatchObject({
        index: 1,
        count: 14,
      });
    });

    it('shortens a series deleting the pending occurrences after the end', async () => {
      const series = await rentSeries();

      const res = await setEnd(ana, series[0].id, '2026-12').expect(200);

      expect((res.body as Transaction[]).map((t) => t.month)).toEqual([
        '2026-10',
        '2026-11',
        '2026-12',
      ]);
      expect(await month(ana, '2027-01')).toEqual([]);
      expect((await month(ana, '2026-12'))[0].series).toEqual({
        index: 3,
        count: 3,
        firstMonth: '2026-10',
        lastMonth: '2026-12',
      });
    });

    it('turns a plain launch into a series', async () => {
      const [single] = (
        await create(ana, {
          categoryId: ids.leisure,
          month: '2026-10',
          plannedCents: 4500,
        }).expect(201)
      ).body as Transaction[];

      const res = await setEnd(ana, single.id, '2026-12').expect(200);

      expect((res.body as Transaction[]).map((t) => t.series?.count)).toEqual([
        3, 3, 3,
      ]);
    });

    it('refuses to drop a realized occurrence with 409', async () => {
      const series = await rentSeries();
      await ana
        .put(`/budget/transactions/${series[5].id}/realization`)
        .send({ amountCents: 10000 })
        .expect(200);

      await setEnd(ana, series[0].id, '2027-01').expect(409);
      expect(await month(ana, '2027-02')).toHaveLength(1);
    });

    it('rejects extending into an inactive category with 400', async () => {
      const series = await rentSeries();
      await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send({ active: false })
        .expect(200);

      await setEnd(ana, series[0].id, '2027-12').expect(400);
      // Shortening still works
      await setEnd(ana, series[0].id, '2026-10').expect(200);
    });

    it.each([
      ['a month before the first one', '2026-09'],
      ['more than 60 months', '2031-10'],
      ['an invalid month', '2027-13'],
      ['a missing month', undefined],
    ])('rejects %s with 400', async (_case, untilMonth) => {
      const [rent] = await rentSeries();
      await setEnd(ana, rent.id, untilMonth).expect(400);
    });

    it('rejects an unknown field with 400 and an unknown id with 404', async () => {
      const [rent] = await rentSeries();
      await ana
        .put(`/budget/transactions/${rent.id}/series`)
        .send({ untilMonth: '2027-12', count: 3 })
        .expect(400);
      await setEnd(ana, 999999, '2027-12').expect(404);
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
      await bruno
        .put(`/budget/transactions/${anaRent.id}/series`)
        .send({ untilMonth: '2026-10' })
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
