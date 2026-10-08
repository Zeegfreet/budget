import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import {
  addMember,
  createGroup,
  type GroupDetail,
  type SplitMethod,
  splitMethods,
} from './groups.js';
import {
  addTransactions,
  type Agent,
  createPaymentMethod,
  createTestApp,
  resetDatabase,
  signUp,
} from './utils.js';

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
    categoryLinks: {
      groupCategory: { id: number; name: string };
      category: { id: number; name: string };
    }[];
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
    description: string;
    paymentUrl: string | null;
    dueDay: number | null;
    shareCents: number;
    totalCents: number;
    paid: boolean;
    groupPaid: boolean;
    paidByName: string | null;
    category: { id: number; name: string } | null;
  }[];
  groupCategories: { id: number; name: string }[];
}

const MONTH = '2026-10';

// Leaving reaches the pending shares from the "current" month on: fix it
// after MONTH, so MONTH is in the past
vi.mock('../src/budget/month.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/budget/month.js')>()),
  currentMonth: () => '2026-11',
}));

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
        categoryLinks: [],
      });
      // Only Ana's membership changes
      const forBruno = await bruno.get(`/groups/${group.id}`).expect(200);
      expect(forBruno.body.link).toEqual({
        expenseCategoryId: null,
        incomeCategoryId: null,
        paymentMethodId: null,
        categoryLinks: [],
      });

      const cleared = await link(ana, {
        expenseCategoryId: null,
        incomeCategoryId: null,
      }).expect(200);
      expect(cleared.body.link).toEqual({
        expenseCategoryId: null,
        incomeCategoryId: null,
        paymentMethodId: null,
        categoryLinks: [],
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
      await addTransactions(ana, [
        { categoryId: moradia, month: MONTH, amountCents: 5000 },
      ]);
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
          // Bruno paid, but hasn't confirmed Ana paid him back yet
          paid: false,
          groupPaid: true,
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

      // Only Bruno, who received the money, confirms Ana's share
      const settle = { items: [{ transactionId: rent.id, memberId: anaId }] };
      await ana
        .post(`/groups/${group.id}/settlements`)
        .send({ ...settle, settled: true })
        .expect(403);
      await bruno
        .post(`/groups/${group.id}/settlements`)
        .send({ ...settle, settled: true })
        .expect(204);
      const [settled] = await statements(ana);
      expect(settled).toMatchObject({ netCents: 0, transfers: [] });
      expect(settled.items[0]).toMatchObject({ paid: true, groupPaid: true });
      // The amount counted in the budget doesn't change
      expect((await summary(ana)).expenseCents).toBe(100000);

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
      // Pending in the current month: goes to whoever stays
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-11',
        amountCents: 300000,
      });

      await bruno.post(`/groups/${group.id}/leave`).expect(204);

      expect((await summary(bruno)).expenseCents).toBe(150000);
      expect((await summary(bruno, '2026-11')).expenseCents).toBe(0);
      const [next] = await statements(ana, '2026-11');
      expect(next.expenseShareCents).toBe(300000);
      const [statement] = await statements(bruno);
      expect(statement).toMatchObject({
        active: false,
        expenseShareCents: 150000,
      });
      // A month without their shares no longer lists the group
      expect(await statements(bruno, '2026-11')).toEqual([]);
    });
  });

  describe('category × category', () => {
    /** Creates a category in the group, as Ana */
    const groupCategory = (name: string, kind = 'EXPENSE') =>
      ana
        .post(`/groups/${group.id}/categories`)
        .send({ kind, name })
        .expect(201)
        .then((res) => (res.body as { id: number }).id);

    it('puts each group category’s shares in the mapped personal category', async () => {
      const aluguel = await groupCategory('Aluguel');
      const mercado = await groupCategory('Mercado');
      const internet = await groupCategory('Internet');
      const moradia = await category(ana, 'Moradia');
      const alimentacao = await category(ana, 'Alimentação');

      const res = await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: alimentacao }],
      }).expect(200);
      expect(res.body.link.categoryLinks).toEqual([
        { groupCategoryId: mercado, categoryId: alimentacao },
      ]);

      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 3000,
        categoryId: aluguel,
      });
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Feira',
        amountCents: 800,
        categoryId: mercado,
      });
      // Unmapped group category and no category: the default one
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Fibra',
        amountCents: 200,
        categoryId: internet,
      });
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Gás',
        amountCents: 100,
      });

      const cells = (await entries(ana)).filter((e) => e.groupCents > 0);
      expect(cells).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ categoryId: moradia, groupCents: 1650 }),
          expect.objectContaining({ categoryId: alimentacao, groupCents: 400 }),
        ]),
      );
      expect(cells).toHaveLength(2);
      expect((await summary(ana)).expenseCents).toBe(2050);

      const [statement] = await statements(ana);
      expect(
        statement.items.map((i) => [i.description, i.category?.name]),
      ).toEqual([
        ['Aluguel', 'Moradia'],
        ['Feira', 'Alimentação'],
        ['Fibra', 'Moradia'],
        ['Gás', 'Moradia'],
      ]);
      expect(statement.link.categoryLinks).toEqual([
        {
          groupCategory: { id: mercado, name: 'Mercado' },
          category: { id: alimentacao, name: 'Alimentação' },
        },
      ]);
      expect(statement.groupCategories).toHaveLength(3);

      // Back to a single category: everything joins again
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
        categoryLinks: [],
      }).expect(200);
      expect((await entries(ana)).filter((e) => e.groupCents > 0)).toEqual([
        expect.objectContaining({ categoryId: moradia, groupCents: 2050 }),
      ]);
    });

    it('counts mapped shares even without a default category', async () => {
      const mercado = await groupCategory('Mercado');
      const alimentacao = await category(ana, 'Alimentação');
      await link(ana, {
        expenseCategoryId: null,
        incomeCategoryId: null,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: alimentacao }],
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Feira',
        amountCents: 800,
        categoryId: mercado,
      });
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Gás',
        amountCents: 100,
      });

      expect((await entries(ana)).filter((e) => e.groupCents > 0)).toEqual([
        expect.objectContaining({ categoryId: alimentacao, groupCents: 400 }),
      ]);
      const [statement] = await statements(ana);
      expect(statement.items.map((i) => i.category?.name ?? null)).toEqual([
        'Alimentação',
        null,
      ]);
    });

    it('validates the overrides', async () => {
      const mercado = await groupCategory('Mercado');
      const aluguelIncome = await groupCategory('Sublocação', 'INCOME');
      const alimentacao = await category(ana, 'Alimentação');
      const extra = await category(ana, 'Renda extra');
      const base = { expenseCategoryId: null, incomeCategoryId: null };

      // Wrong kind for the group category
      await link(ana, {
        ...base,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: extra }],
      }).expect(400);
      await link(ana, {
        ...base,
        categoryLinks: [
          { groupCategoryId: aluguelIncome, categoryId: alimentacao },
        ],
      }).expect(400);
      // Repeated, invalid shape, unknown field
      await link(ana, {
        ...base,
        categoryLinks: [
          { groupCategoryId: mercado, categoryId: alimentacao },
          { groupCategoryId: mercado, categoryId: alimentacao },
        ],
      }).expect(400);
      await link(ana, {
        ...base,
        categoryLinks: [{ groupCategoryId: mercado }],
      }).expect(400);
      await link(ana, {
        ...base,
        categoryLinks: [
          { groupCategoryId: mercado, categoryId: alimentacao, memberId: 1 },
        ],
      }).expect(400);
      // Inactive personal category
      await ana
        .patch(`/budget/categories/${alimentacao}`)
        .send({ active: false })
        .expect(200);
      await link(ana, {
        ...base,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: alimentacao }],
      }).expect(400);
    });

    it('returns 404 for another group’s category or another user’s category', async () => {
      const mercado = await groupCategory('Mercado');
      const other = await createGroup(carla, 'Outro');
      const foreign = (
        await carla
          .post(`/groups/${other.id}/categories`)
          .send({ kind: 'EXPENSE', name: 'Mercado' })
          .expect(201)
      ).body.id as number;
      const alimentacao = await category(ana, 'Alimentação');
      const brunoAlimentacao = await category(bruno, 'Alimentação');
      const base = { expenseCategoryId: null, incomeCategoryId: null };

      await link(ana, {
        ...base,
        categoryLinks: [{ groupCategoryId: foreign, categoryId: alimentacao }],
      }).expect(404);
      await link(ana, {
        ...base,
        categoryLinks: [
          { groupCategoryId: mercado, categoryId: brunoAlimentacao },
        ],
      }).expect(404);
      // Bruno's own link is untouched by Ana's
      await link(ana, {
        ...base,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: alimentacao }],
      }).expect(200);
      const forBruno = await bruno.get(`/groups/${group.id}`).expect(200);
      expect(forBruno.body.link.categoryLinks).toEqual([]);
    });

    it('falls back to the default when a mapped category is deleted', async () => {
      const mercado = await groupCategory('Mercado');
      const moradia = await category(ana, 'Moradia');
      const alimentacao = await category(ana, 'Alimentação');
      await link(ana, {
        expenseCategoryId: moradia,
        incomeCategoryId: null,
        categoryLinks: [{ groupCategoryId: mercado, categoryId: alimentacao }],
      }).expect(200);
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Feira',
        amountCents: 800,
        categoryId: mercado,
      });

      await ana.delete(`/budget/categories/${alimentacao}`).expect(204);
      const res = await ana.get(`/groups/${group.id}`).expect(200);
      expect(res.body.link.categoryLinks).toEqual([]);
      expect((await entries(ana)).filter((e) => e.groupCents > 0)).toEqual([
        expect.objectContaining({ categoryId: moradia, groupCents: 400 }),
      ]);
    });
  });

  describe('payment link', () => {
    it('shows the group transaction’s link on each member’s item', async () => {
      const bill = 'https://imobiliaria.com.br/boleto/42';
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
        paymentUrl: bill,
      });
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Água',
        amountCents: 10000,
      });
      const links = async (client: Agent) =>
        (await statements(client))[0].items.map((i) => [
          i.description,
          i.paymentUrl,
        ]);

      expect(await links(ana)).toEqual([
        ['Aluguel', bill],
        ['Água', null],
      ]);
      expect(await links(bruno)).toEqual(await links(ana));
    });
  });

  describe('due day', () => {
    it('shows each share’s due day, the linked method’s winning for expenses', async () => {
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Aluguel',
        amountCents: 300000,
        dueDay: 5,
      });
      await createTransaction({
        kind: 'INCOME',
        description: 'Sublocação',
        amountCents: 40000,
        dueDay: 3,
      });
      await createTransaction({
        kind: 'EXPENSE',
        description: 'Água',
        amountCents: 10000,
      });
      const days = async (client: Agent) =>
        (await statements(client))[0].items.map((i) => [
          i.description,
          i.dueDay,
        ]);

      expect(await days(bruno)).toEqual([
        ['Sublocação', 3],
        ['Aluguel', 5],
        ['Água', null],
      ]);

      const card = await createPaymentMethod(bruno, { dueDay: 12 });
      await link(bruno, {
        expenseCategoryId: null,
        incomeCategoryId: null,
        paymentMethodId: card.id,
      }).expect(200);

      expect(await days(bruno)).toEqual([
        ['Sublocação', 3],
        ['Aluguel', 12],
        ['Água', 12],
      ]);
      // Ana's link is her own
      expect(await days(ana)).toEqual([
        ['Sublocação', 3],
        ['Aluguel', 5],
        ['Água', null],
      ]);
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
        categoryLinks: [],
      });
      expect(await entries(bruno)).toEqual([]);
    });

    it('validates the month', async () => {
      await ana.get('/budget/group-statements?month=2026-13').expect(400);
      await ana.get('/budget/group-statements').expect(400);
    });
  });
});
