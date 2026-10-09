import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import {
  addMember,
  createGroup,
  type GroupDetail,
  type SplitMethod,
  splitMethods,
} from './groups.js';
import { type Agent, createTestApp, resetDatabase, signUp } from './utils.js';

// The horizon starts at the current month: Oct/2026 + 23 = Sep/2028
vi.mock('../src/budget/month.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/budget/month.js')>()),
  currentMonth: () => '2026-10',
}));

interface GroupTransaction {
  id: number;
  month: string;
  description: string;
  amountCents: number;
  paidBy: { memberId: number } | null;
  series: {
    count: number;
    lastMonth: string;
    recurrence: {
      endMonth: string | null;
      adjustment: { percentBp: number } | null;
    } | null;
  } | null;
  shares: { memberId: number; amountCents: number }[];
}

describe('Open-ended recurring group transactions (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let carla: Agent;
  let group: GroupDetail;
  let anaId: number;
  let brunoId: number;
  let equal: SplitMethod;

  const base = () => `/groups/${group.id}`;

  const create = (body: Record<string, unknown>, client = ana) =>
    client.post(`${base()}/transactions`).send({
      kind: 'EXPENSE',
      description: 'Aluguel',
      month: '2026-10',
      amountCents: 200_000,
      splitMethodId: equal.id,
      ...body,
    });

  async function month(m: string, client = ana) {
    const res = await client
      .get(`${base()}/transactions?month=${m}`)
      .expect(200);
    return res.body as GroupTransaction[];
  }

  const shares = (t: GroupTransaction) =>
    t.shares.map(({ memberId, amountCents }) => ({ memberId, amountCents }));

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');
    carla = await signUp(app, 'Carla Dias', 'carla@example.com');
    group = await createGroup(ana);
    anaId = group.memberId;
    brunoId = (await addMember(ana, bruno, group.id, 'bruno@example.com'))
      .memberId;
    [equal] = await splitMethods(ana, group.id);
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates the months up to the horizon, unpaid after the first', async () => {
    const res = await create({ openEnded: true, paidByMemberId: anaId }).expect(
      201,
    );
    const series = res.body as GroupTransaction[];

    expect(series).toHaveLength(24);
    expect(series[0].paidBy).toEqual(
      expect.objectContaining({ memberId: anaId }),
    );
    expect(series.slice(1).every((t) => t.paidBy === null)).toBe(true);
    expect(series[23].series).toMatchObject({
      count: 24,
      lastMonth: '2028-09',
      recurrence: { endMonth: null, adjustment: null },
    });
    expect(shares(series[23])).toEqual([
      { memberId: anaId, amountCents: 100_000 },
      { memberId: brunoId, amountCents: 100_000 },
    ]);
  });

  it('divides months created later among the current members', async () => {
    await create({ openEnded: true }).expect(201);
    const carlaId = (await addMember(ana, carla, group.id, 'carla@example.com'))
      .memberId;

    const [later] = await month('2029-03');

    expect(shares(later)).toEqual([
      { memberId: anaId, amountCents: 66_667 },
      { memberId: brunoId, amountCents: 66_667 },
      { memberId: carlaId, amountCents: 66_666 },
    ]);
  });

  it('applies the scheduled adjustment and divides the new amount', async () => {
    const res = await create({
      openEnded: true,
      adjustment: { percentBp: 500, everyMonths: 12 },
    }).expect(201);
    const series = res.body as GroupTransaction[];

    const oct27 = series.find((t) => t.month === '2027-10')!;
    expect(oct27.amountCents).toBe(210_000);
    expect(shares(oct27)).toEqual([
      { memberId: anaId, amountCents: 105_000 },
      { memberId: brunoId, amountCents: 105_000 },
    ]);
  });

  it('projects a new amount changed with FOLLOWING', async () => {
    await create({
      openEnded: true,
      adjustment: { percentBp: 500, everyMonths: 12 },
    }).expect(201);
    const [jan] = await month('2027-01');

    await ana
      .patch(`${base()}/transactions/${jan.id}`)
      .send({ amountCents: 300_000, scope: 'FOLLOWING' })
      .expect(200);

    const [sep] = await month('2027-09');
    const [oct] = await month('2027-10');
    expect(sep.amountCents).toBe(300_000);
    expect(oct.amountCents).toBe(315_000);
    expect(shares(oct)).toEqual([
      { memberId: anaId, amountCents: 157_500 },
      { memberId: brunoId, amountCents: 157_500 },
    ]);
  });

  it('ends with FOLLOWING deletion or an end month', async () => {
    const res = await create({ openEnded: true }).expect(201);
    const [first] = res.body as GroupTransaction[];
    const [may] = await month('2027-05');

    await ana
      .delete(`${base()}/transactions/${may.id}?scope=FOLLOWING`)
      .expect(204);
    expect(await month('2030-01')).toEqual([]);
    const [april] = await month('2027-04');
    expect(april.series!.recurrence!.endMonth).toBe('2027-04');

    // Opening it again creates the months up to the horizon
    const open = await ana
      .put(`${base()}/transactions/${first.id}/series`)
      .send({ untilMonth: null })
      .expect(200);
    expect(open.body).toHaveLength(24);

    await ana
      .put(`${base()}/transactions/${first.id}/series`)
      .send({ untilMonth: '2026-12' })
      .expect(200);
    expect(await month('2027-01')).toEqual([]);
  });

  it('refuses a scheduled adjustment with a fixed rule (400)', async () => {
    const fixed = await ana
      .post(`${base()}/split-methods`)
      .send({
        name: 'Fixo',
        type: 'FIXED',
        shares: [
          { memberId: anaId, value: 80_000 },
          { memberId: brunoId, value: 120_000 },
        ],
      })
      .expect(201);

    await create({
      splitMethodId: fixed.body.id,
      openEnded: true,
      adjustment: { percentBp: 500, everyMonths: 12 },
    }).expect(400);
    await create({ openEnded: true, repeatMonths: 2 }).expect(400);
  });

  it('feeds the members’ budget with months read far ahead', async () => {
    await create({ openEnded: true }).expect(201);

    const res = await bruno
      .get('/budget/group-statements?month=2030-02')
      .expect(200);
    const [statement] = res.body as {
      items: { description: string; shareCents: number }[];
    }[];
    expect(statement.items).toEqual([
      expect.objectContaining({ description: 'Aluguel', shareCents: 100_000 }),
    ]);
  });

  it('is a 404 for someone outside the group', async () => {
    const res = await create({ openEnded: true }).expect(201);
    const [first] = res.body as GroupTransaction[];

    await carla.get(`${base()}/transactions?month=2030-01`).expect(404);
    await carla
      .put(`${base()}/transactions/${first.id}/series`)
      .send({ untilMonth: '2026-12' })
      .expect(404);
    await carla
      .delete(`${base()}/transactions/${first.id}?scope=FOLLOWING`)
      .expect(404);
    const statements = await carla
      .get('/budget/group-statements?month=2030-01')
      .expect(200);
    expect(statements.body).toEqual([]);
    expect(await month('2028-09')).toHaveLength(1);
  });
});
