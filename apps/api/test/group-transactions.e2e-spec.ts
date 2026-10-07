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

interface GroupTransaction {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  description: string;
  month: string;
  amountCents: number;
  splitMethod: { id: number; name: string; type: string } | null;
  paidBy: { memberId: number; name: string } | null;
  series: { index: number; count: number } | null;
  shares: { memberId: number; name: string; amountCents: number }[];
}

interface Balance {
  month: string;
  incomeCents: number;
  expenseCents: number;
  pendingCents: number;
  members: {
    memberId: number;
    name: string;
    active: boolean;
    shareCents: number;
    paidCents: number;
    receivedCents: number;
    netCents: number;
  }[];
  transfers: {
    fromMemberId: number;
    toMemberId: number;
    amountCents: number;
  }[];
}

describe('Group split methods, transactions and balance (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let carla: Agent;
  let group: GroupDetail;
  /** Membership ids */
  let anaId: number;
  let brunoId: number;
  let equal: SplitMethod;

  const base = () => `/groups/${group.id}`;

  const createMethod = (client: Agent, body: Record<string, unknown>) =>
    client.post(`${base()}/split-methods`).send(body);

  const create = (client: Agent, body: Record<string, unknown>) =>
    client.post(`${base()}/transactions`).send(body);

  async function month(m: string, client = ana) {
    const res = await client
      .get(`${base()}/transactions?month=${m}`)
      .expect(200);
    return res.body as GroupTransaction[];
  }

  async function balance(m: string, client = ana) {
    const res = await client.get(`${base()}/balance?month=${m}`).expect(200);
    return res.body as Balance;
  }

  /** "Aluguel 30/70": Ana 30%, Bruno 70% */
  async function percentRule() {
    const res = await createMethod(ana, {
      name: 'Aluguel 30/70',
      type: 'PERCENT',
      shares: [
        { memberId: anaId, value: 3000 },
        { memberId: brunoId, value: 7000 },
      ],
    }).expect(201);
    return res.body as SplitMethod;
  }

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

  describe('split methods', () => {
    it('creates, edits and deletes rules of every type', async () => {
      const percent = await percentRule();
      expect(percent).toMatchObject({
        type: 'PERCENT',
        active: true,
        shares: [
          { memberId: anaId, value: 3000 },
          { memberId: brunoId, value: 7000 },
        ],
      });

      const weight = await createMethod(bruno, {
        name: 'Por quarto',
        type: 'WEIGHT',
        shares: [
          { memberId: anaId, value: 2 },
          { memberId: brunoId, value: 1 },
        ],
      }).expect(201);
      const fixed = await createMethod(ana, {
        name: 'Fixo',
        type: 'FIXED',
        shares: [
          { memberId: anaId, value: 40000 },
          { memberId: brunoId, value: 60000 },
        ],
      }).expect(201);
      const onlyAna = await createMethod(ana, {
        name: 'Só Ana',
        type: 'EQUAL',
        shares: [{ memberId: anaId }],
      }).expect(201);
      expect(onlyAna.body.shares).toEqual([{ memberId: anaId, value: 1 }]);

      const renamed = await ana
        .patch(`${base()}/split-methods/${weight.body.id}`)
        .send({ name: 'Por quarto (2:1)' })
        .expect(200);
      expect(renamed.body).toMatchObject({
        name: 'Por quarto (2:1)',
        type: 'WEIGHT',
      });

      const changed = await ana
        .patch(`${base()}/split-methods/${fixed.body.id}`)
        .send({
          type: 'PERCENT',
          shares: [
            { memberId: anaId, value: 5000 },
            { memberId: brunoId, value: 5000 },
          ],
        })
        .expect(200);
      expect(changed.body).toMatchObject({ name: 'Fixo', type: 'PERCENT' });

      await ana
        .delete(`${base()}/split-methods/${onlyAna.body.id}`)
        .expect(204);
      await ana
        .delete(`${base()}/split-methods/${onlyAna.body.id}`)
        .expect(404);
      expect(await splitMethods(ana, group.id)).toHaveLength(4);
    });

    it('rejects rules that do not divide an amount', async () => {
      const notHundred = await createMethod(ana, {
        name: 'Errado',
        type: 'PERCENT',
        shares: [
          { memberId: anaId, value: 1500 },
          { memberId: brunoId, value: 3000 },
        ],
      }).expect(400);
      expect(notHundred.body.message).toBe('Percentages must add up to 100%');

      await createMethod(ana, {
        name: 'Sem valor',
        type: 'WEIGHT',
        shares: [{ memberId: anaId }],
      }).expect(400);
      await createMethod(ana, {
        name: 'Vazio',
        type: 'FIXED',
        shares: [],
      }).expect(400);
      await createMethod(ana, {
        name: 'Repetido',
        type: 'EQUAL',
        shares: [{ memberId: anaId }, { memberId: anaId }],
      }).expect(400);
    });

    it('only names active members of the group', async () => {
      const other = await createGroup(carla, 'Outro');
      const res = await createMethod(ana, {
        name: 'Estranho',
        type: 'EQUAL',
        shares: [{ memberId: other.memberId }],
      }).expect(400);
      expect(res.body.message).toBe(
        'Every participant must be an active member',
      );
    });

    it('validates the body and names', async () => {
      await createMethod(ana, { name: 'X', type: 'HALF', shares: [] }).expect(
        400,
      );
      await createMethod(ana, { name: 'X', type: 'EQUAL' }).expect(400);
      await createMethod(ana, {
        name: 'X',
        type: 'EQUAL',
        shares: [{ memberId: anaId, extra: 1 }],
      }).expect(400);
      await createMethod(ana, {
        name: 'Igualitário',
        type: 'EQUAL',
        shares: [],
      }).expect(409);
    });

    it('turns off a percent rule when a member it names leaves, until edited', async () => {
      const percent = await percentRule();
      const carlaId = (
        await addMember(ana, carla, group.id, 'carla@example.com')
      ).memberId;
      const onlyBrunoAndCarla = await createMethod(ana, {
        name: 'B e C',
        type: 'EQUAL',
        shares: [{ memberId: brunoId }, { memberId: carlaId }],
      }).expect(201);

      await bruno.post(`${base()}/leave`).expect(204);

      const methods = await splitMethods(ana, group.id);
      const byId = (id: number) => methods.find((m) => m.id === id)!;
      expect(byId(percent.id).active).toBe(false);
      expect(byId(onlyBrunoAndCarla.body.id)).toMatchObject({
        active: true,
        shares: [{ memberId: carlaId, value: 1 }],
      });
      const blocked = await create(ana, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 100000,
        splitMethodId: percent.id,
      }).expect(400);
      expect(blocked.body.message).toBe('Split method is inactive');

      const fixed = await ana
        .patch(`${base()}/split-methods/${percent.id}`)
        .send({
          shares: [
            { memberId: anaId, value: 3000 },
            { memberId: carlaId, value: 7000 },
          ],
        })
        .expect(200);
      expect(fixed.body.active).toBe(true);
    });
  });

  describe('transactions', () => {
    it('creates an expense split by a rule and lists it in its month', async () => {
      const percent = await percentRule();
      const res = await create(ana, {
        kind: 'EXPENSE',
        description: ' Aluguel ',
        month: '2026-10',
        amountCents: 200000,
        splitMethodId: percent.id,
        paidByMemberId: anaId,
      }).expect(201);

      expect(res.body).toEqual([
        {
          id: expect.any(Number),
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 200000,
          splitMethod: {
            id: percent.id,
            name: 'Aluguel 30/70',
            type: 'PERCENT',
          },
          paidBy: { memberId: anaId, name: 'Ana Souza' },
          series: null,
          shares: [
            { memberId: anaId, name: 'Ana Souza', amountCents: 60000 },
            { memberId: brunoId, name: 'Bruno Lima', amountCents: 140000 },
          ],
        },
      ]);
      expect(await month('2026-10', bruno)).toEqual(res.body);
      expect(await month('2026-11')).toEqual([]);
    });

    it('splits equally among all members, cents included', async () => {
      const res = await create(ana, {
        kind: 'EXPENSE',
        description: 'Água',
        month: '2026-10',
        amountCents: 10001,
        splitMethodId: equal.id,
      }).expect(201);
      const shares = (res.body as GroupTransaction[])[0].shares;
      expect(shares.map((s) => s.amountCents)).toEqual([5001, 5000]);
    });

    it('rejects a fixed rule whose total differs from the amount', async () => {
      const fixed = await createMethod(ana, {
        name: 'Fixo',
        type: 'FIXED',
        shares: [
          { memberId: anaId, value: 40000 },
          { memberId: brunoId, value: 60000 },
        ],
      }).expect(201);
      const res = await create(ana, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 90000,
        splitMethodId: fixed.body.id,
      }).expect(400);
      expect(res.body.message).toBe(
        'The amount must equal the fixed values total',
      );
    });

    it('validates the body and references', async () => {
      const valid = {
        kind: 'EXPENSE',
        description: 'Luz',
        month: '2026-10',
        amountCents: 100,
        splitMethodId: equal.id,
      };
      await create(ana, { ...valid, amountCents: 0 }).expect(400);
      await create(ana, { ...valid, amountCents: 1.5 }).expect(400);
      await create(ana, { ...valid, month: '2026-13' }).expect(400);
      await create(ana, { ...valid, description: ' ' }).expect(400);
      await create(ana, { ...valid, kind: 'TRANSFER' }).expect(400);
      await create(ana, { ...valid, repeatMonths: 61 }).expect(400);
      await create(ana, { ...valid, userId: 1 }).expect(400);
      await create(ana, { ...valid, splitMethodId: 999999 }).expect(404);
      await create(ana, { ...valid, paidByMemberId: 999999 }).expect(400);
      await ana.get(`${base()}/transactions?month=10-2026`).expect(400);
    });

    it('repeats monthly, only the first occurrence already paid', async () => {
      const res = await create(ana, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-11',
        amountCents: 100000,
        splitMethodId: equal.id,
        paidByMemberId: brunoId,
        repeatMonths: 12,
      }).expect(201);
      const series = res.body as GroupTransaction[];

      expect(series).toHaveLength(12);
      expect(series[11]).toMatchObject({
        month: '2027-10',
        paidBy: null,
        series: { index: 12, count: 12 },
      });
      expect(series[0].paidBy).toEqual({
        memberId: brunoId,
        name: 'Bruno Lima',
      });
      expect((await month('2027-02'))[0].series).toEqual({
        index: 4,
        count: 12,
      });
    });

    it('updates one occurrence or the following pending ones, recomputing shares', async () => {
      const percent = await percentRule();
      const series = (
        await create(ana, {
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 100000,
          splitMethodId: equal.id,
          repeatMonths: 4,
        }).expect(201)
      ).body as GroupTransaction[];
      // Paid occurrences are kept by FOLLOWING changes
      await bruno
        .put(`${base()}/transactions/${series[3].id}/payment`)
        .send({ memberId: brunoId })
        .expect(200);

      const one = await ana
        .patch(`${base()}/transactions/${series[0].id}`)
        .send({ description: 'Aluguel de outubro' })
        .expect(200);
      expect(one.body.description).toBe('Aluguel de outubro');

      const res = await ana
        .patch(`${base()}/transactions/${series[1].id}`)
        .send({
          amountCents: 200000,
          splitMethodId: percent.id,
          scope: 'FOLLOWING',
        })
        .expect(200);
      expect(
        res.body.shares.map((s: { amountCents: number }) => s.amountCents),
      ).toEqual([60000, 140000]);

      const [oct] = await month('2026-10');
      const [dec] = await month('2026-12');
      const [jan] = await month('2027-01');
      expect(oct).toMatchObject({
        amountCents: 100000,
        splitMethod: { id: equal.id },
      });
      expect(dec).toMatchObject({
        amountCents: 200000,
        splitMethod: { id: percent.id },
        shares: [{ amountCents: 60000 }, { amountCents: 140000 }],
      });
      expect(jan).toMatchObject({
        amountCents: 100000,
        splitMethod: { id: equal.id },
      });

      await ana
        .patch(`${base()}/transactions/${oct.id}`)
        .send({ amountCents: null })
        .expect(400);
    });

    it('deletes one occurrence or the following pending ones', async () => {
      const series = (
        await create(ana, {
          kind: 'INCOME',
          description: 'Sublocação',
          month: '2026-10',
          amountCents: 5000,
          splitMethodId: equal.id,
          repeatMonths: 3,
        }).expect(201)
      ).body as GroupTransaction[];

      await ana.delete(`${base()}/transactions/${series[0].id}`).expect(204);
      expect(await month('2026-10')).toEqual([]);
      await ana
        .delete(`${base()}/transactions/${series[1].id}?scope=FOLLOWING`)
        .expect(204);
      expect(await month('2026-12')).toEqual([]);
      await ana.delete(`${base()}/transactions/${series[1].id}`).expect(404);
      await ana
        .delete(`${base()}/transactions/${series[2].id}?scope=ALL`)
        .expect(400);
    });

    it('keeps transactions when their rule is deleted', async () => {
      const percent = await percentRule();
      await create(ana, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 1000,
        splitMethodId: percent.id,
      }).expect(201);

      await ana.delete(`${base()}/split-methods/${percent.id}`).expect(204);
      const [t] = await month('2026-10');
      expect(t).toMatchObject({ splitMethod: null, amountCents: 1000 });
      expect(t.shares).toHaveLength(2);
      const res = await ana
        .patch(`${base()}/transactions/${t.id}`)
        .send({ amountCents: 2000 })
        .expect(400);
      expect(res.body.message).toBe('Choose a split method');
    });
  });

  describe('balance', () => {
    it('shows who owes whom in the month', async () => {
      const percent = await percentRule();
      await create(ana, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 200000,
        splitMethodId: percent.id,
        paidByMemberId: anaId,
      }).expect(201);
      const water = (
        await create(bruno, {
          kind: 'EXPENSE',
          description: 'Água',
          month: '2026-10',
          amountCents: 10000,
          splitMethodId: equal.id,
        }).expect(201)
      ).body as GroupTransaction[];

      let result = await balance('2026-10', bruno);
      expect(result).toMatchObject({
        month: '2026-10',
        expenseCents: 210000,
        incomeCents: 0,
        pendingCents: 10000,
        members: [
          {
            memberId: anaId,
            name: 'Ana Souza',
            active: true,
            shareCents: 65000,
            paidCents: 200000,
            netCents: 140000,
          },
          {
            memberId: brunoId,
            name: 'Bruno Lima',
            shareCents: 145000,
            paidCents: 0,
            netCents: -140000,
          },
        ],
        transfers: [
          { fromMemberId: brunoId, toMemberId: anaId, amountCents: 140000 },
        ],
      });

      await bruno
        .put(`${base()}/transactions/${water[0].id}/payment`)
        .send({ memberId: brunoId })
        .expect(200);
      result = await balance('2026-10');
      expect(result.pendingCents).toBe(0);
      expect(result.transfers).toEqual([
        { fromMemberId: brunoId, toMemberId: anaId, amountCents: 135000 },
      ]);

      const unpaid = await ana
        .delete(`${base()}/transactions/${water[0].id}/payment`)
        .expect(200);
      expect(unpaid.body.paidBy).toBeNull();
      expect(
        (await balance('2026-11')).members.every((m) => m.netCents === 0),
      ).toBe(true);
    });

    it('keeps former members in the balance of months they took part in', async () => {
      await create(ana, {
        kind: 'EXPENSE',
        description: 'Luz',
        month: '2026-10',
        amountCents: 1000,
        splitMethodId: equal.id,
        paidByMemberId: brunoId,
      }).expect(201);
      await bruno.post(`${base()}/leave`).expect(204);

      const result = await balance('2026-10');
      expect(result.members).toEqual([
        expect.objectContaining({ memberId: anaId, netCents: -500 }),
        expect.objectContaining({
          memberId: brunoId,
          name: 'Bruno Lima',
          active: false,
          netCents: 500,
        }),
      ]);
      // A former member can't be set as payer
      const [t] = await month('2026-10');
      await ana
        .put(`${base()}/transactions/${t.id}/payment`)
        .send({ memberId: brunoId })
        .expect(400);
    });
  });

  describe('isolation between users', () => {
    it("hides a group's rules, transactions and balance from non-members", async () => {
      const percent = await percentRule();
      const [t] = (
        await create(ana, {
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 1000,
          splitMethodId: equal.id,
        }).expect(201)
      ).body as GroupTransaction[];

      await carla.get(`${base()}/split-methods`).expect(404);
      await createMethod(carla, {
        name: 'X',
        type: 'EQUAL',
        shares: [],
      }).expect(404);
      await carla
        .patch(`${base()}/split-methods/${percent.id}`)
        .send({ name: 'Y' })
        .expect(404);
      await carla.delete(`${base()}/split-methods/${percent.id}`).expect(404);
      await carla.get(`${base()}/transactions?month=2026-10`).expect(404);
      await create(carla, {
        kind: 'EXPENSE',
        description: 'X',
        month: '2026-10',
        amountCents: 1,
        splitMethodId: equal.id,
      }).expect(404);
      await carla
        .patch(`${base()}/transactions/${t.id}`)
        .send({ description: 'X' })
        .expect(404);
      await carla.delete(`${base()}/transactions/${t.id}`).expect(404);
      await carla
        .put(`${base()}/transactions/${t.id}/payment`)
        .send({ memberId: anaId })
        .expect(404);
      await carla.delete(`${base()}/transactions/${t.id}/payment`).expect(404);
      await carla.get(`${base()}/balance?month=2026-10`).expect(404);

      expect(await month('2026-10')).toEqual([
        expect.objectContaining({
          id: t.id,
          description: 'Aluguel',
          paidBy: null,
        }),
      ]);
    });

    it("can't reach another group's items through one's own group", async () => {
      const own = await createGroup(carla, 'Da Carla');
      const [t] = (
        await create(ana, {
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 1000,
          splitMethodId: equal.id,
        }).expect(201)
      ).body as GroupTransaction[];
      const other = `/groups/${own.id}`;

      await carla
        .patch(`${other}/transactions/${t.id}`)
        .send({ description: 'X' })
        .expect(404);
      await carla.delete(`${other}/transactions/${t.id}`).expect(404);
      await carla.delete(`${other}/split-methods/${equal.id}`).expect(404);
      await carla
        .post(`${other}/transactions`)
        .send({
          kind: 'EXPENSE',
          description: 'X',
          month: '2026-10',
          amountCents: 1,
          splitMethodId: equal.id,
        })
        .expect(404);
    });

    it('cuts a former member off', async () => {
      await bruno.post(`${base()}/leave`).expect(204);
      await bruno.get(`${base()}/transactions?month=2026-10`).expect(404);
      await bruno.get(`${base()}/balance?month=2026-10`).expect(404);
      await bruno.get(`${base()}/split-methods`).expect(404);
    });
  });
});
