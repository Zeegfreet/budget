import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import {
  type Agent,
  createPaymentMethod,
  createTestApp,
  resetDatabase,
  signUp,
} from './utils.js';

// The horizon starts at the current month: Oct/2026 + 23 = Sep/2028
vi.mock('../src/budget/month.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/budget/month.js')>()),
  currentMonth: () => '2026-10',
}));

interface Transaction {
  id: number;
  month: string;
  plannedCents: number;
  realizedCents: number | null;
  description: string | null;
  series: {
    index: number;
    count: number;
    firstMonth: string;
    lastMonth: string;
    recurrence: {
      endMonth: string | null;
      adjustment: {
        percentBp: number;
        everyMonths: number;
        firstMonth: string;
      } | null;
    } | null;
  } | null;
}

describe('Open-ended recurring transactions (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let housing: number;

  async function housingOf(client: Agent) {
    const res = await client.get('/budget/categories').expect(200);
    const groups = res.body as {
      name: string;
      categories: { id: number; name: string }[];
    }[];
    return groups
      .find((g) => g.name === 'Despesas Básicas')!
      .categories.find((c) => c.name === 'Moradia')!.id;
  }

  const create = (body: Record<string, unknown>, client = ana) =>
    client
      .post('/budget/transactions')
      .send({ categoryId: housing, description: 'Aluguel', ...body });

  /** R$ 1.000 rent every month from Oct/2026, with no end */
  async function rent(body: Record<string, unknown> = {}) {
    const res = await create({
      month: '2026-10',
      plannedCents: 100_000,
      openEnded: true,
      ...body,
    }).expect(201);
    return res.body as Transaction[];
  }

  async function month(m: string, client = ana) {
    const res = await client.get(`/budget/transactions?month=${m}`).expect(200);
    return res.body as Transaction[];
  }

  /** The rent of the month (`undefined` when there is none) */
  const rentOf = async (m: string) =>
    (await month(m)).find((t) => t.description === 'Aluguel');

  const setSeries = (id: number, body: Record<string, unknown>, client = ana) =>
    client.put(`/budget/transactions/${id}/series`).send(body);

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    housing = await housingOf(ana);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('creating', () => {
    it('creates the months up to the horizon, with the rule in the series', async () => {
      const series = await rent();

      expect(series).toHaveLength(24);
      expect(new Set(series.map((t) => t.month)).size).toBe(24);
      expect(series[0].month).toBe('2026-10');
      expect(series[23].month).toBe('2028-09');
      expect(series.every((t) => t.plannedCents === 100_000)).toBe(true);
      expect(series[0].series).toEqual({
        index: 1,
        count: 24,
        firstMonth: '2026-10',
        lastMonth: '2028-09',
        recurrence: { endMonth: null, adjustment: null },
      });
    });

    it('creates later months as they are read, once', async () => {
      await rent();

      expect(await rentOf('2028-10')).toBeDefined();
      const reads = await Promise.all([
        month('2030-01'),
        month('2030-01'),
        month('2030-01'),
      ]);
      expect(reads.map((r) => r.length)).toEqual([1, 1, 1]);
      const [jan] = await month('2030-01');
      expect(jan.series).toMatchObject({ index: 40, count: 40 });
    });

    it('adds a scheduled adjustment on each anniversary, compounding', async () => {
      const series = await rent({
        adjustment: { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' },
      });

      const amount = (m: string) =>
        series.find((t) => t.month === m)!.plannedCents;
      expect(amount('2027-02')).toBe(100_000);
      expect(amount('2027-03')).toBe(105_000);
      expect(amount('2028-02')).toBe(105_000);
      expect(amount('2028-03')).toBe(110_250);
      // A month created later keeps compounding
      expect((await rentOf('2029-03'))!.plannedCents).toBe(115_763);
      expect(series[0].series!.recurrence).toEqual({
        endMonth: null,
        adjustment: { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' },
      });
    });

    it('starts the adjustment a period after the first month by default', async () => {
      const series = await rent({
        adjustment: { percentBp: 1000, everyMonths: 12 },
      });

      expect(series.find((t) => t.month === '2027-09')!.plannedCents).toBe(
        100_000,
      );
      expect(series.find((t) => t.month === '2027-10')!.plannedCents).toBe(
        110_000,
      );
    });

    it('limits a finite series with an adjustment to its months', async () => {
      const res = await create({
        month: '2026-10',
        plannedCents: 100_000,
        repeatMonths: 14,
        adjustment: { percentBp: 500, everyMonths: 12 },
      }).expect(201);
      const series = res.body as Transaction[];

      expect(series).toHaveLength(14);
      expect(series[13]).toMatchObject({
        month: '2027-11',
        plannedCents: 105_000,
      });
      expect(series[0].series!.recurrence!.endMonth).toBe('2027-11');
      expect(await month('2028-01')).toEqual([]);
    });

    it('rejects invalid recurrences (400)', async () => {
      const base = { month: '2026-10', plannedCents: 1000 };
      await create({ ...base, openEnded: true, repeatMonths: 3 }).expect(400);
      await create({ ...base, openEnded: false }).expect(400);
      await create({
        ...base,
        adjustment: { percentBp: 500, everyMonths: 12 },
      }).expect(400);
      for (const adjustment of [
        { percentBp: 0, everyMonths: 12 },
        { percentBp: 10_001, everyMonths: 12 },
        { percentBp: 500, everyMonths: 0 },
        { percentBp: 500, everyMonths: 12, firstMonth: '2027-13' },
        { percentBp: 500, everyMonths: 12, extra: 1 },
      ]) {
        await create({ ...base, openEnded: true, adjustment }).expect(400);
      }
      expect(await month('2026-10')).toEqual([]);
    });

    it('rejects an inactive category (400)', async () => {
      await ana
        .patch(`/budget/categories/${housing}`)
        .send({ active: false })
        .expect(200);
      await create({
        month: '2026-10',
        plannedCents: 1000,
        openEnded: true,
      }).expect(400);
    });
  });

  describe('adjusting by hand', () => {
    it('takes a new amount forward, also into months created later', async () => {
      await rent();
      const jan = (await rentOf('2027-01'))!;

      await ana
        .patch(`/budget/transactions/${jan.id}`)
        .send({ plannedCents: 120_000, scope: 'FOLLOWING' })
        .expect(200);

      expect((await rentOf('2026-12'))!.plannedCents).toBe(100_000);
      expect((await rentOf('2028-09'))!.plannedCents).toBe(120_000);
      expect((await rentOf('2029-06'))!.plannedCents).toBe(120_000);
    });

    it('projects the scheduled adjustment from the new amount', async () => {
      await rent({
        adjustment: { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' },
      });
      const jan = (await rentOf('2027-01'))!;

      await ana
        .patch(`/budget/transactions/${jan.id}`)
        .send({ plannedCents: 120_000, scope: 'FOLLOWING' })
        .expect(200);

      expect((await rentOf('2027-02'))!.plannedCents).toBe(120_000);
      expect((await rentOf('2027-03'))!.plannedCents).toBe(126_000);
      expect((await rentOf('2028-03'))!.plannedCents).toBe(132_300);
      expect((await rentOf('2029-03'))!.plannedCents).toBe(138_915);
    });

    it('types the adjusted amount in the anniversary month without adding the %', async () => {
      await rent({
        adjustment: { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' },
      });
      const march = (await rentOf('2027-03'))!;

      await ana
        .patch(`/budget/transactions/${march.id}`)
        .send({ plannedCents: 108_000, scope: 'FOLLOWING' })
        .expect(200);

      expect((await rentOf('2027-03'))!.plannedCents).toBe(108_000);
      expect((await rentOf('2028-02'))!.plannedCents).toBe(108_000);
      expect((await rentOf('2028-03'))!.plannedCents).toBe(113_400);
    });
  });

  describe('ending', () => {
    it('deleting one month does not bring it back', async () => {
      await rent();
      const may = (await rentOf('2027-05'))!;

      await ana.delete(`/budget/transactions/${may.id}`).expect(204);
      await month('2030-01');

      expect(await rentOf('2027-05')).toBeUndefined();
      expect(await rentOf('2027-06')).toBeDefined();
    });

    it('deleting this and the following ones ends the recurrence', async () => {
      await rent();
      const may = (await rentOf('2027-05'))!;

      await ana
        .delete(`/budget/transactions/${may.id}?scope=FOLLOWING`)
        .expect(204);

      const april = (await rentOf('2027-04'))!;
      expect(april.series).toMatchObject({
        count: 7,
        lastMonth: '2027-04',
        recurrence: { endMonth: '2027-04' },
      });
      expect(await month('2030-01')).toEqual([]);
    });

    it('sets an end month and opens it again', async () => {
      const [first] = await rent();

      const ended = await setSeries(first.id, { untilMonth: '2027-03' }).expect(
        200,
      );
      expect(ended.body).toHaveLength(6);
      expect((ended.body as Transaction[])[0].series!.recurrence).toEqual({
        endMonth: '2027-03',
        adjustment: null,
      });
      expect(await month('2029-01')).toEqual([]);

      const reopened = await setSeries(first.id, { untilMonth: null }).expect(
        200,
      );
      expect(reopened.body).toHaveLength(24);
      expect(await rentOf('2029-01')).toBeDefined();
    });

    it('ends past 60 months, since months are created as they are read', async () => {
      const [first] = await rent();

      await setSeries(first.id, { untilMonth: '2033-12' }).expect(200);

      expect(await rentOf('2033-12')).toBeDefined();
      expect(await month('2034-01')).toEqual([]);
    });

    it('refuses to drop a realized month (409) and keeps everything', async () => {
      const [first] = await rent();
      const june = (await rentOf('2027-06'))!;
      await ana
        .put(`/budget/transactions/${june.id}/realization`)
        .send({ amountCents: 100_000 })
        .expect(200);

      await setSeries(first.id, { untilMonth: '2027-03' }).expect(409);
      expect(await rentOf('2027-05')).toBeDefined();
    });

    it('rejects an end before the first month or a bad body (400)', async () => {
      const [first] = await rent();

      await setSeries(first.id, { untilMonth: '2026-09' }).expect(400);
      await setSeries(first.id, {}).expect(400);
      await setSeries(first.id, { untilMonth: '2026-13' }).expect(400);
      await setSeries(first.id, {
        untilMonth: null,
        adjustment: { percentBp: -1, everyMonths: 12 },
      }).expect(400);
    });
  });

  describe('turning a series into a recurrence', () => {
    it('makes a finite series open-ended', async () => {
      const res = await create({
        month: '2026-10',
        plannedCents: 100_000,
        repeatMonths: 12,
      }).expect(201);
      const [first] = res.body as Transaction[];
      expect(first.series!.recurrence).toBeNull();

      const open = await setSeries(first.id, { untilMonth: null }).expect(200);

      expect(open.body).toHaveLength(24);
      expect((open.body as Transaction[])[0].series!.recurrence).toEqual({
        endMonth: null,
        adjustment: null,
      });
    });

    it('adds, then removes, a scheduled adjustment, recalculating the pending months', async () => {
      const [first] = await rent();

      const adjusted = await setSeries(first.id, {
        untilMonth: null,
        adjustment: { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' },
      }).expect(200);
      const amount = (rows: Transaction[], m: string) =>
        rows.find((t) => t.month === m)!.plannedCents;
      expect(amount(adjusted.body, '2027-02')).toBe(100_000);
      expect(amount(adjusted.body, '2027-03')).toBe(105_000);
      expect(amount(adjusted.body, '2028-03')).toBe(110_250);

      const plain = await setSeries(first.id, {
        untilMonth: null,
        adjustment: null,
      }).expect(200);
      expect(amount(plain.body, '2028-03')).toBe(100_000);
    });
  });

  describe('elsewhere in the budget', () => {
    it('feeds the grid and the summary of far months', async () => {
      await rent();

      const lines = await ana
        .get('/budget/lines?from=2029-01&to=2029-03')
        .expect(200);
      expect(lines.body).toHaveLength(1);
      expect(lines.body[0].cells).toHaveLength(3);

      const summary = await ana
        .get('/budget/summary?month=2030-06')
        .expect(200);
      expect(summary.body.expenseCents).toBe(100_000);
    });

    it("feeds the payment method's invoice of far months", async () => {
      const card = await createPaymentMethod(ana);
      await rent({ paymentMethodId: card.id });

      const res = await ana
        .get(`/payment-methods/${card.id}/invoice?month=2029-05`)
        .expect(200);
      expect(res.body.transactions).toEqual([
        expect.objectContaining({ month: '2029-05', plannedCents: 100_000 }),
      ]);
    });

    it('pauses while the category is inactive', async () => {
      await rent();
      await ana
        .patch(`/budget/categories/${housing}`)
        .send({ active: false })
        .expect(200);

      expect(await month('2029-01')).toEqual([]);

      await ana
        .patch(`/budget/categories/${housing}`)
        .send({ active: true })
        .expect(200);
      expect(await rentOf('2029-01')).toBeDefined();
    });

    it('creates a recurrence from the dashboard plan', async () => {
      await ana
        .put('/budget/plan')
        .send({
          createLines: [
            {
              ref: -1,
              categoryId: housing,
              month: '2026-10',
              description: 'Aluguel',
              plannedCents: 100_000,
              openEnded: true,
            },
          ],
        })
        .expect(204);

      expect((await rentOf('2028-09'))!.series!.recurrence).toEqual({
        endMonth: null,
        adjustment: null,
      });
    });
  });

  describe('isolation', () => {
    it("never reaches another user's recurrence (404)", async () => {
      const [first] = await rent();
      const bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');

      await setSeries(first.id, { untilMonth: null }, bruno).expect(404);
      await bruno
        .patch(`/budget/transactions/${first.id}`)
        .send({ plannedCents: 1, scope: 'FOLLOWING' })
        .expect(404);
      await bruno
        .delete(`/budget/transactions/${first.id}?scope=FOLLOWING`)
        .expect(404);
      expect(await month('2030-01', bruno)).toEqual([]);

      // Ana's series is intact
      expect((await rentOf('2028-09'))!.plannedCents).toBe(100_000);
    });
  });
});
