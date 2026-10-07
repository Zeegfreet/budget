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

interface CategoryTree {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  name: string;
  categories: { id: number; name: string }[];
}

interface Entry {
  categoryId: number;
  month: string;
  amountCents: number;
  count: number;
  groupCents: number;
}

interface GroupStatement {
  group: { id: number; name: string };
  active: boolean;
  memberId: number;
  link: {
    expenseCategory: { id: number; name: string } | null;
    incomeCategory: { id: number; name: string } | null;
    paymentMethod: { id: number; name: string; dueDay: number | null } | null;
  };
  expenseCents: number;
  incomeCents: number;
  pendingCents: number;
  expenseShareCents: number;
  incomeShareCents: number;
  paidCents: number;
  receivedCents: number;
  netCents: number;
  transfers: {
    fromMemberId: number;
    fromName: string;
    toMemberId: number;
    toName: string;
    amountCents: number;
  }[];
  items: {
    transactionId: number;
    kind: string;
    shareCents: number;
    totalCents: number;
    paid: boolean;
    paidByName: string | null;
    category: { id: number; name: string } | null;
  }[];
}

const MONTH = '2026-10';

describe('Groups in the personal budget (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let carla: Agent;
  let group: GroupDetail;
  let anaId: number;
  let brunoId: number;
  let equal: SplitMethod;

  /** Category id by name in the user's tree */
  async function category(client: Agent, name: string) {
    const res = await client.get('/budget/categories').expect(200);
    const found = (res.body as CategoryTree[])
      .flatMap((g) => g.categories)
      .find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  }

  const link = (
    client: Agent,
    body: Record<string, unknown>,
    groupId = group.id,
  ) => client.put(`/groups/${groupId}/link`).send(body);

  const createTransaction = (body: Record<string, unknown>) =>
    ana
      .post(`/groups/${group.id}/transactions`)
      .send({ month: MONTH, splitMethodId: equal.id, ...body })
      .expect(201)
      .then((res) => (res.body as { id: number }[])[0]);

  async function entries(client: Agent, from = MONTH, to = '2026-12') {
    const res = await client
      .get(`/budget/entries?from=${from}&to=${to}`)
      .expect(200);
    return res.body as Entry[];
  }

  async function summary(client: Agent, month = MONTH) {
    const res = await client.get(`/budget/summary?month=${month}`).expect(200);
    return res.body as {
      openingBalanceCents: number;
      incomeCents: number;
      expenseCents: number;
    };
  }

  async function statements(client: Agent, month = MONTH) {
    const res = await client
      .get(`/budget/group-statements?month=${month}`)
      .expect(200);
    return res.body as GroupStatement[];
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

  describe('link', () => {
    it('links and unlinks the user’s own categories', async () => {
      const moradia = await category(ana, 'Moradia');
      const extra = await category(ana, 'Renda extra');

      const res = await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: extra,
      }).expect(200);
      expect(res.body.link).toEqual({
        expenseCategoryId: moradia,
        incomeCategoryId: extra,
        paymentMethodId: null,
      });
      // Only Ana's membership changes
      const forBruno = await bruno.get(`/groups/${group.id}`).expect(200);
      expect(forBruno.body.link).toEqual({
        expenseCategoryId: null,
        incomeCategoryId: null,
        paymentMethodId: null,
      });

      const cleared = await link(ana, {
        expenseCategoryId: null,
        incomeCategoryId: null,
      }).expect(200);
      expect(cleared.body.link).toEqual({
        expenseCategoryId: null,
        incomeCategoryId: null,
        paymentMethodId: null,
      });
    });

    it('validates the body and the categories', async () => {
      const moradia = await category(ana, 'Moradia');
      const extra = await category(ana, 'Renda extra');

      // Both fields are required (null to unlink), unknown ones are rejected
      await link(ana, { expenseCategoryId: moradia }).expect(400);
      await link(ana, {
        expenseCategoryId: 'x',
        incomeCategoryId: null,
      }).expect(400);
      await link(ana, {
        expenseCategoryId: null,
        incomeCategoryId: null,
        memberId: brunoId,
      }).expect(400);
      // Wrong kind
      await link(ana, {
        expenseCategoryId: extra,
        incomeCategoryId: null,
      }).expect(400);
      await link(ana, {
        expenseCategoryId: null,
        incomeCategoryId: moradia,
      }).expect(400);
      // Inactive
      await ana
        .patch(`/budget/categories/${moradia}`)
        .send({ active: false })
        .expect(200);
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
      }).expect(400);
    });

    it('keeps a linked category that was inactivated afterwards', async () => {
      const moradia = await category(ana, 'Moradia');
      const body = { expenseCategoryId: moradia, incomeCategoryId: null };
      await link(ana, body).expect(200);
      await ana
        .patch(`/budget/categories/${moradia}`)
        .send({ active: false })
        .expect(200);

      await link(ana, body).expect(200);
    });

    it('returns 404 for another user’s category or group', async () => {
      const brunoMoradia = await category(bruno, 'Moradia');
      await link(ana, {
        expenseCategoryId: brunoMoradia,
        incomeCategoryId: null,
      }).expect(404);

      const carlaMoradia = await category(carla, 'Moradia');
      await link(carla, {
        expenseCategoryId: carlaMoradia,
        incomeCategoryId: null,
      }).expect(404);
      await link(
        carla,
        {
          expenseCategoryId: null,
          incomeCategoryId: null,
        },
        999999,
      ).expect(404);
    });
  });

  describe('budget', () => {
    it('counts each member’s share in their own linked category', async () => {
      const anaMoradia = await category(ana, 'Moradia');
      const brunoMoradia = await category(bruno, 'Moradia');
      const before = await summary(ana);

      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
        repeatMonths: 2,
      });

      // Without a link nothing changes
      expect(await entries(ana)).toEqual([]);
      expect(await summary(ana)).toEqual(before);

      await link(ana, {
        expenseCategoryId: anaMoradia,
        incomeCategoryId: null,
      }).expect(200);
      await link(bruno, {
        expenseCategoryId: brunoMoradia,
        incomeCategoryId: null,
      }).expect(200);

      expect(await entries(ana)).toEqual([
        {
          categoryId: anaMoradia,
          month: MONTH,
          amountCents: 0,
          count: 0,
          groupCents: 150000,
        },
        {
          categoryId: anaMoradia,
          month: '2026-11',
          amountCents: 0,
          count: 0,
          groupCents: 150000,
        },
      ]);
      expect(await entries(bruno, MONTH, MONTH)).toEqual([
        expect.objectContaining({
          categoryId: brunoMoradia,
          groupCents: 150000,
        }),
      ]);
      expect((await summary(ana)).expenseCents).toBe(150000);
      // The previous months feed the opening balance
      expect((await summary(ana, '2026-12')).openingBalanceCents).toBe(-300000);
    });

    it('adds the share to the personal amount of the cell', async () => {
      const moradia = await category(ana, 'Moradia');
      await ana
        .put('/budget/entries')
        .send({
          entries: [{ categoryId: moradia, month: MONTH, amountCents: 5000 }],
        })
        .expect(204);
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Luz',
        amountCents: 10000,
      });

      expect(await entries(ana, MONTH, MONTH)).toEqual([
        {
          categoryId: moradia,
          month: MONTH,
          amountCents: 5000,
          count: 1,
          groupCents: 5000,
        },
      ]);
      expect((await summary(ana)).expenseCents).toBe(10000);
    });

    it('follows edits, payments and deletes of the group transaction', async () => {
      const moradia = await category(ana, 'Moradia');
      const extra = await category(ana, 'Renda extra');
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: extra,
      }).expect(200);
      const rent = await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
      });
      await createTransaction({
        kind: 'INCOME',
        description: 'Sublocação',
        amountCents: 40000,
      });
      expect(await summary(ana)).toMatchObject({
        incomeCents: 20000,
        expenseCents: 150000,
      });

      await ana
        .patch(`/groups/${group.id}/transactions/${rent.id}`)
        .send({ amountCents: 200000 })
        .expect(200);
      await bruno
        .put(`/groups/${group.id}/transactions/${rent.id}/payment`)
        .send({ memberId: brunoId })
        .expect(200);
      expect((await summary(ana)).expenseCents).toBe(100000);

      const [statement] = await statements(ana);
      expect(statement).toMatchObject({
        group: { id: group.id, name: 'República' },
        active: true,
        memberId: anaId,
        link: {
          expenseCategory: { id: moradia, name: 'Moradia' },
          incomeCategory: { id: extra, name: 'Renda extra' },
        },
        expenseCents: 200000,
        incomeCents: 40000,
        pendingCents: 40000,
        expenseShareCents: 100000,
        incomeShareCents: 20000,
        paidCents: 0,
        netCents: -100000,
        transfers: [
          {
            fromMemberId: anaId,
            fromName: 'Ana Souza',
            toMemberId: brunoId,
            toName: 'Bruno Lima',
            amountCents: 100000,
          },
        ],
      });
      expect(statement.items).toEqual([
        expect.objectContaining({
          transactionId: rent.id,
          kind: 'EXPENSE',
          shareCents: 100000,
          totalCents: 200000,
          paid: true,
          paidByName: 'Bruno Lima',
          category: expect.objectContaining({ id: moradia }),
        }),
        expect.objectContaining({
          kind: 'INCOME',
          shareCents: 20000,
          paid: false,
          category: expect.objectContaining({ id: extra }),
        }),
      ]);

      await ana
        .delete(`/groups/${group.id}/transactions/${rent.id}`)
        .expect(204);
      expect((await summary(ana)).expenseCents).toBe(0);
    });

    it('drops the link when the personal category is deleted', async () => {
      const moradia = await category(ana, 'Moradia');
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
      });

      await ana.delete(`/budget/categories/${moradia}`).expect(204);

      const res = await ana.get(`/groups/${group.id}`).expect(200);
      expect(res.body.link.expenseCategoryId).toBeNull();
      expect((await summary(ana)).expenseCents).toBe(0);
      const [statement] = await statements(ana);
      expect(statement.items[0].category).toBeNull();
    });

    it('keeps past shares after leaving the group', async () => {
      const moradia = await category(bruno, 'Moradia');
      await link(bruno, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
      });

      await bruno.post(`/groups/${group.id}/leave`).expect(204);

      expect((await summary(bruno)).expenseCents).toBe(150000);
      const [statement] = await statements(bruno);
      expect(statement).toMatchObject({
        active: false,
        expenseShareCents: 150000,
      });
      // A month without their shares no longer lists the group
      expect(await statements(bruno, '2026-11')).toEqual([]);
    });
  });

  describe('isolation', () => {
    it('never shows another user’s groups or shares', async () => {
      const moradia = await category(ana, 'Moradia');
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
      });

      expect(await statements(carla)).toEqual([]);
      expect(await entries(carla)).toEqual([]);
      expect((await summary(carla)).expenseCents).toBe(0);
      // Bruno sees the group, but only his side (and no link of Ana's)
      const [statement] = await statements(bruno);
      expect(statement.memberId).toBe(brunoId);
      expect(statement.link).toEqual({
        expenseCategory: null,
        incomeCategory: null,
        paymentMethod: null,
      });
      expect(await entries(bruno)).toEqual([]);
    });

    it('validates the month', async () => {
      await ana.get('/budget/group-statements?month=2026-13').expect(400);
      await ana.get('/budget/group-statements').expect(400);
    });
  });
});
