import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { addMember, createGroup, splitMethods } from './groups.js';
import {
  type Agent,
  createPaymentMethod,
  createTestApp,
  type PaymentMethodBody,
  resetDatabase,
  signUp,
} from './utils.js';

interface CategoryTree {
  name: string;
  categories: { id: number; name: string }[];
}

interface Transaction {
  id: number;
  month: string;
  plannedCents: number;
  realizedCents: number | null;
  dueDay: number | null;
  paymentMethod: PaymentMethodBody | null;
  category: { id: number; dueDay: number | null };
}

interface Invoice {
  paymentMethod: PaymentMethodBody;
  month: string;
  dueDate: string | null;
  plannedCents: number;
  realizedCents: number;
  pendingCents: number;
  effectiveCents: number;
  count: number;
  transactions: Transaction[];
  shares: {
    transactionId: number;
    group: { id: number; name: string };
    description: string;
    shareCents: number;
    paid: boolean;
  }[];
}

const MONTH = '2026-10';

describe('Payment methods (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let card: PaymentMethodBody;

  async function category(client: Agent, name: string) {
    const res = await client.get('/budget/categories').expect(200);
    const found = (res.body as CategoryTree[])
      .flatMap((g) => g.categories)
      .find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  }

  const createTransaction = (client: Agent, body: Record<string, unknown>) =>
    client.post('/budget/transactions').send({ month: MONTH, ...body });

  async function invoice(client: Agent, id: number, month = MONTH) {
    const res = await client
      .get(`/payment-methods/${id}/invoice?month=${month}`)
      .expect(200);
    return res.body as Invoice;
  }

  async function statement(client: Agent, month = MONTH) {
    const res = await client
      .get(`/budget/transactions?month=${month}`)
      .expect(200);
    return res.body as Transaction[];
  }

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');
    card = await createPaymentMethod(ana);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('CRUD', () => {
    it('creates, lists, edits, inactivates and deletes', async () => {
      expect(card).toEqual({
        id: expect.any(Number),
        name: 'Cartão Americanas',
        type: 'CREDIT_CARD',
        dueDay: 12,
        active: true,
      });
      const account = await createPaymentMethod(ana, {
        name: '  Conta Corrente  ',
        type: 'ACCOUNT',
        dueDay: undefined,
      });
      expect(account).toMatchObject({ name: 'Conta Corrente', dueDay: null });

      const list = await ana.get(`/payment-methods?month=${MONTH}`).expect(200);
      expect((list.body as PaymentMethodBody[]).map((m) => m.name)).toEqual([
        'Cartão Americanas',
        'Conta Corrente',
      ]);
      expect(list.body[0].invoice).toEqual({
        plannedCents: 0,
        realizedCents: 0,
        pendingCents: 0,
        effectiveCents: 0,
        count: 0,
      });

      const edited = await ana
        .patch(`/payment-methods/${card.id}`)
        .send({ name: 'Cartão Azul', dueDay: null, active: false })
        .expect(200);
      expect(edited.body).toMatchObject({
        name: 'Cartão Azul',
        dueDay: null,
        active: false,
      });

      await ana.delete(`/payment-methods/${card.id}`).expect(204);
      await ana.delete(`/payment-methods/${card.id}`).expect(404);
      const after = await ana
        .get(`/payment-methods?month=${MONTH}`)
        .expect(200);
      expect(after.body).toHaveLength(1);
    });

    it('validates the body', async () => {
      const post = (body: Record<string, unknown>) =>
        ana.post('/payment-methods').send(body);
      await post({ type: 'CREDIT_CARD' }).expect(400);
      await post({ name: '  ', type: 'CREDIT_CARD' }).expect(400);
      await post({ name: 'X', type: 'PIX' }).expect(400);
      await post({ name: 'X', type: 'OTHER', dueDay: 0 }).expect(400);
      await post({ name: 'X', type: 'OTHER', dueDay: 32 }).expect(400);
      await post({ name: 'X', type: 'OTHER', userId: 99 }).expect(400);
      await ana
        .patch(`/payment-methods/${card.id}`)
        .send({ name: null })
        .expect(400);
      await ana.get('/payment-methods').expect(400);
      await ana.get('/payment-methods/abc/invoice?month=2026-10').expect(400);
    });

    it('rejects a duplicate name with 409, per user', async () => {
      await ana
        .post('/payment-methods')
        .send({ name: 'Cartão Americanas', type: 'OTHER' })
        .expect(409);
      const other = await createPaymentMethod(ana, { name: 'Outro' });
      await ana
        .patch(`/payment-methods/${other.id}`)
        .send({ name: 'Cartão Americanas' })
        .expect(409);
      // Another user may use the same name
      await createPaymentMethod(bruno);
    });
  });

  describe('transactions', () => {
    it('uses the method’s due day and keeps it in the whole series', async () => {
      const moradia = await category(ana, 'Moradia');
      await ana.patch(`/budget/categories/${moradia}`).send({ dueDay: 5 });

      const res = await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        repeatMonths: 3,
        paymentMethodId: card.id,
      }).expect(201);
      const created = res.body as Transaction[];
      expect(created.every((t) => t.paymentMethod?.id === card.id)).toBe(true);
      expect(created[0]).toMatchObject({
        dueDay: 12,
        category: { dueDay: 5 },
        paymentMethod: { name: 'Cartão Americanas', dueDay: 12 },
      });

      // Removing it from this and the following ones goes back to the category's day
      const [, second] = created;
      const updated = await ana
        .patch(`/budget/transactions/${second.id}`)
        .send({ paymentMethodId: null, scope: 'FOLLOWING' })
        .expect(200);
      expect(updated.body).toMatchObject({ paymentMethod: null, dueDay: 5 });
      expect((await statement(ana, '2026-12'))[0].paymentMethod).toBeNull();
      expect((await statement(ana))[0].paymentMethod?.id).toBe(card.id);

      // Deleting the method keeps the launches, without method
      await ana.delete(`/payment-methods/${card.id}`).expect(204);
      const [first] = await statement(ana);
      expect(first).toMatchObject({ paymentMethod: null, dueDay: 5 });
    });

    it('rejects a method on an income, inactive or unknown', async () => {
      const salario = await category(ana, 'Salário');
      const moradia = await category(ana, 'Moradia');
      await createTransaction(ana, {
        categoryId: salario,
        plannedCents: 10000,
        paymentMethodId: card.id,
      }).expect(400);
      await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        paymentMethodId: 999999,
      }).expect(404);
      await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        paymentMethodId: 'x',
      }).expect(400);

      const res = await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        paymentMethodId: card.id,
      }).expect(201);
      const [rent] = res.body as Transaction[];
      // Moving it to an income needs the method removed
      await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ categoryId: salario })
        .expect(400);

      await ana
        .patch(`/payment-methods/${card.id}`)
        .send({ active: false })
        .expect(200);
      await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        paymentMethodId: card.id,
      }).expect(400);
      // Existing launches keep it and can still be edited
      await ana
        .patch(`/budget/transactions/${rent.id}`)
        .send({ plannedCents: 12000 })
        .expect(200);
    });
  });

  describe('invoice', () => {
    it('consolidates the month, pays and unpays it', async () => {
      const moradia = await category(ana, 'Moradia');
      const lazer = await category(ana, 'Lazer');
      await createTransaction(ana, {
        categoryId: moradia,
        plannedCents: 10000,
        paymentMethodId: card.id,
      }).expect(201);
      const res = await createTransaction(ana, {
        categoryId: lazer,
        plannedCents: 5000,
        paymentMethodId: card.id,
      }).expect(201);
      const [cinema] = res.body as Transaction[];
      // Out of the invoice: no method, or another month
      await createTransaction(ana, { categoryId: lazer, plannedCents: 700 });
      await createTransaction(ana, {
        categoryId: lazer,
        month: '2026-11',
        plannedCents: 900,
        paymentMethodId: card.id,
      });
      await ana
        .put(`/budget/transactions/${cinema.id}/realization`)
        .send({ amountCents: 4500 })
        .expect(200);

      const before = await invoice(ana, card.id);
      expect(before).toMatchObject({
        month: MONTH,
        dueDate: '2026-10-12',
        plannedCents: 15000,
        realizedCents: 4500,
        pendingCents: 10000,
        effectiveCents: 14500,
        count: 2,
      });

      const paid = await ana
        .put(`/payment-methods/${card.id}/invoice/payment?month=${MONTH}`)
        .expect(200);
      expect(paid.body).toMatchObject({
        realizedCents: 14500,
        pendingCents: 0,
      });
      // Already realized ones keep their amount; the next month is untouched
      expect(
        (paid.body as Invoice).transactions.map((t) => t.realizedCents),
      ).toEqual(expect.arrayContaining([10000, 4500]));
      expect((await invoice(ana, card.id, '2026-11')).pendingCents).toBe(900);

      const history = await ana
        .get(`/payment-methods/${card.id}/invoices?from=2026-09&to=2026-11`)
        .expect(200);
      expect(
        (history.body as { month: string; effectiveCents: number }[]).map(
          (m) => [m.month, m.effectiveCents],
        ),
      ).toEqual([
        ['2026-09', 0],
        ['2026-10', 14500],
        ['2026-11', 900],
      ]);
      await ana
        .get(`/payment-methods/${card.id}/invoices?from=2026-11&to=2026-09`)
        .expect(400);

      const unpaid = await ana
        .delete(`/payment-methods/${card.id}/invoice/payment?month=${MONTH}`)
        .expect(200);
      expect(unpaid.body).toMatchObject({
        realizedCents: 0,
        pendingCents: 15000,
      });
      await ana
        .put(`/payment-methods/${card.id}/invoice/payment?month=2026-13`)
        .expect(400);
    });

    it('includes the user’s shares of group expenses assigned to the method', async () => {
      const group = await createGroup(ana);
      await addMember(ana, bruno, group.id, 'bruno@example.com');
      const [equal] = await splitMethods(ana, group.id);
      const tx = await ana
        .post(`/groups/${group.id}/transactions`)
        .send({
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: MONTH,
          amountCents: 300000,
          splitMethodId: equal.id,
        })
        .expect(201);
      const [rent] = tx.body as { id: number }[];

      const linked = await ana
        .put(`/groups/${group.id}/link`)
        .send({
          expenseCategoryId: null,
          incomeCategoryId: null,
          paymentMethodId: card.id,
        })
        .expect(200);
      expect(linked.body.link.paymentMethodId).toBe(card.id);

      const statements = await ana
        .get(`/budget/group-statements?month=${MONTH}`)
        .expect(200);
      expect(statements.body[0].link.paymentMethod).toEqual({
        id: card.id,
        name: 'Cartão Americanas',
        dueDay: 12,
      });

      const result = await invoice(ana, card.id);
      expect(result.shares).toEqual([
        {
          transactionId: rent.id,
          group: { id: group.id, name: 'República' },
          description: 'Aluguel',
          shareCents: 150000,
          paid: false,
        },
      ]);
      expect(result).toMatchObject({ plannedCents: 150000, count: 1 });

      // Paying the invoice doesn't touch the group; the share follows its payer
      await ana
        .put(`/payment-methods/${card.id}/invoice/payment?month=${MONTH}`)
        .expect(200);
      expect((await invoice(ana, card.id)).shares[0].paid).toBe(false);

      // Omitting the method keeps it; null removes it
      await ana
        .put(`/groups/${group.id}/link`)
        .send({ expenseCategoryId: null, incomeCategoryId: null })
        .expect(200);
      expect((await invoice(ana, card.id)).count).toBe(1);
      await ana
        .put(`/groups/${group.id}/link`)
        .send({
          expenseCategoryId: null,
          incomeCategoryId: null,
          paymentMethodId: null,
        })
        .expect(200);
      expect((await invoice(ana, card.id)).count).toBe(0);
    });
  });

  describe('isolation', () => {
    it('never lets another user read, change or use the method', async () => {
      const id = card.id;
      await bruno
        .get(`/payment-methods/${id}/invoice?month=${MONTH}`)
        .expect(404);
      await bruno
        .get(`/payment-methods/${id}/invoices?from=2026-01&to=2026-12`)
        .expect(404);
      await bruno
        .patch(`/payment-methods/${id}`)
        .send({ name: 'X' })
        .expect(404);
      await bruno.delete(`/payment-methods/${id}`).expect(404);
      await bruno
        .put(`/payment-methods/${id}/invoice/payment?month=${MONTH}`)
        .expect(404);
      await bruno
        .delete(`/payment-methods/${id}/invoice/payment?month=${MONTH}`)
        .expect(404);
      const list = await bruno
        .get(`/payment-methods?month=${MONTH}`)
        .expect(200);
      expect(list.body).toEqual([]);

      const moradia = await category(bruno, 'Moradia');
      await createTransaction(bruno, {
        categoryId: moradia,
        plannedCents: 1000,
        paymentMethodId: id,
      }).expect(404);

      const group = await createGroup(bruno);
      await bruno
        .put(`/groups/${group.id}/link`)
        .send({
          expenseCategoryId: null,
          incomeCategoryId: null,
          paymentMethodId: id,
        })
        .expect(404);

      // Ana's method is untouched
      expect((await invoice(ana, id)).paymentMethod.name).toBe(
        'Cartão Americanas',
      );
    });
  });
});
