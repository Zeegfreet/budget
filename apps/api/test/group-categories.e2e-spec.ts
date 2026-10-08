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

interface GroupCategory {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  name: string;
  active: boolean;
}

interface GroupTransaction {
  id: number;
  month: string;
  category: { id: number; name: string } | null;
}

const MONTH = '2026-10';

describe('Group categories (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let carla: Agent;
  let group: GroupDetail;
  let equal: SplitMethod;

  const base = (groupId = group.id) => `/groups/${groupId}/categories`;

  const create = (client: Agent, body: Record<string, unknown>) =>
    client.post(base()).send(body);

  const createTransactions = (body: Record<string, unknown>) =>
    ana.post(`/groups/${group.id}/transactions`).send({
      kind: 'EXPENSE',
      description: 'Aluguel',
      month: MONTH,
      amountCents: 3000,
      splitMethodId: equal.id,
      ...body,
    });

  async function monthOf(month: string) {
    const res = await ana
      .get(`/groups/${group.id}/transactions?month=${month}`)
      .expect(200);
    return res.body as GroupTransaction[];
  }

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');
    carla = await signUp(app, 'Carla Dias', 'carla@example.com');
    group = await createGroup(ana);
    await addMember(ana, bruno, group.id, 'bruno@example.com');
    [equal] = await splitMethods(ana, group.id);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('CRUD', () => {
    it('lets any member create, list, edit and delete categories', async () => {
      const aluguel = (
        await create(ana, { kind: 'EXPENSE', name: ' Aluguel ' }).expect(201)
      ).body as GroupCategory;
      expect(aluguel).toEqual({
        id: expect.any(Number),
        kind: 'EXPENSE',
        name: 'Aluguel',
        active: true,
      });
      // A regular member manages them too
      await create(bruno, { kind: 'INCOME', name: 'Sublocação' }).expect(201);
      await create(bruno, { kind: 'EXPENSE', name: 'Mercado' }).expect(201);

      const list = await bruno.get(base()).expect(200);
      expect((list.body as GroupCategory[]).map((c) => c.name)).toEqual([
        'Aluguel',
        'Mercado',
        'Sublocação',
      ]);
      const detail = await ana.get(`/groups/${group.id}`).expect(200);
      expect(detail.body.categories).toHaveLength(3);

      const edited = await bruno
        .patch(`${base()}/${aluguel.id}`)
        .send({ name: 'Moradia', active: false })
        .expect(200);
      expect(edited.body).toMatchObject({ name: 'Moradia', active: false });

      await ana.delete(`${base()}/${aluguel.id}`).expect(204);
      await ana.delete(`${base()}/${aluguel.id}`).expect(404);
      expect((await ana.get(base()).expect(200)).body).toHaveLength(2);
    });

    it('rejects a repeated name in the same kind (409) only', async () => {
      await create(ana, { kind: 'EXPENSE', name: 'Extra' }).expect(201);
      await create(ana, { kind: 'EXPENSE', name: 'Extra' }).expect(409);
      await create(ana, { kind: 'INCOME', name: 'Extra' }).expect(201);
      const other = await create(ana, {
        kind: 'EXPENSE',
        name: 'Outra',
      }).expect(201);
      await ana
        .patch(`${base()}/${other.body.id}`)
        .send({ name: 'Extra' })
        .expect(409);
    });

    it('validates the body', async () => {
      await create(ana, { kind: 'EXPENSE' }).expect(400);
      await create(ana, { kind: 'EXPENSE', name: '  ' }).expect(400);
      await create(ana, { kind: 'X', name: 'Aluguel' }).expect(400);
      await create(ana, {
        kind: 'EXPENSE',
        name: 'Aluguel',
        groupId: 9,
      }).expect(400);
      const res = await create(ana, {
        kind: 'EXPENSE',
        name: 'Aluguel',
      }).expect(201);
      // The kind is fixed; null isn't a value
      await ana
        .patch(`${base()}/${res.body.id}`)
        .send({ kind: 'INCOME' })
        .expect(400);
      await ana
        .patch(`${base()}/${res.body.id}`)
        .send({ name: null })
        .expect(400);
    });

    it('returns 404 to non-members and for another group’s category', async () => {
      const res = await create(ana, {
        kind: 'EXPENSE',
        name: 'Aluguel',
      }).expect(201);
      const id = res.body.id as number;

      await carla.get(base()).expect(404);
      await create(carla, { kind: 'EXPENSE', name: 'X' }).expect(404);
      await carla.patch(`${base()}/${id}`).send({ name: 'X' }).expect(404);
      await carla.delete(`${base()}/${id}`).expect(404);

      const other = await createGroup(carla, 'Outro');
      await carla
        .patch(`${base(other.id)}/${id}`)
        .send({ name: 'X' })
        .expect(404);
      await carla.delete(`${base(other.id)}/${id}`).expect(404);
      expect((await ana.get(base()).expect(200)).body).toHaveLength(1);
    });
  });

  describe('transactions', () => {
    let aluguel: number;
    let mercado: number;
    let sublocacao: number;

    beforeEach(async () => {
      aluguel = (await create(ana, { kind: 'EXPENSE', name: 'Aluguel' })).body
        .id;
      mercado = (await create(ana, { kind: 'EXPENSE', name: 'Mercado' })).body
        .id;
      sublocacao = (await create(ana, { kind: 'INCOME', name: 'Sublocação' }))
        .body.id;
    });

    it('stores the category in every occurrence and follows FOLLOWING edits', async () => {
      const res = await createTransactions({
        categoryId: aluguel,
        repeatMonths: 3,
      }).expect(201);
      const series = res.body as GroupTransaction[];
      expect(series.map((t) => t.category)).toEqual(
        Array(3).fill({ id: aluguel, name: 'Aluguel' }),
      );

      await ana
        .patch(`/groups/${group.id}/transactions/${series[1].id}`)
        .send({ categoryId: mercado, scope: 'FOLLOWING' })
        .expect(200);
      expect((await monthOf('2026-10'))[0].category?.id).toBe(aluguel);
      expect((await monthOf('2026-11'))[0].category?.id).toBe(mercado);
      expect((await monthOf('2026-12'))[0].category?.id).toBe(mercado);

      // Extending the series copies the last occurrence's category
      await ana
        .put(`/groups/${group.id}/transactions/${series[2].id}/series`)
        .send({ untilMonth: '2027-01' })
        .expect(200);
      expect((await monthOf('2027-01'))[0].category?.id).toBe(mercado);

      // null removes it
      const cleared = await ana
        .patch(`/groups/${group.id}/transactions/${series[0].id}`)
        .send({ categoryId: null })
        .expect(200);
      expect(cleared.body.category).toBeNull();
    });

    it('rejects a category of another kind, inactive or of another group', async () => {
      await createTransactions({ categoryId: sublocacao }).expect(400);
      await createTransactions({ categoryId: 'x' }).expect(400);

      const [rent] = (
        await createTransactions({ categoryId: aluguel }).expect(201)
      ).body as GroupTransaction[];
      // Switching the kind alone keeps an expense category: 400
      await ana
        .patch(`/groups/${group.id}/transactions/${rent.id}`)
        .send({ kind: 'INCOME' })
        .expect(400);
      await ana
        .patch(`/groups/${group.id}/transactions/${rent.id}`)
        .send({ kind: 'INCOME', categoryId: sublocacao })
        .expect(200);

      await ana.patch(`${base()}/${mercado}`).send({ active: false });
      await createTransactions({ categoryId: mercado }).expect(400);

      const other = await createGroup(carla, 'Outro');
      const foreign = (
        await carla
          .post(base(other.id))
          .send({ kind: 'EXPENSE', name: 'Aluguel' })
          .expect(201)
      ).body.id as number;
      await createTransactions({ categoryId: foreign }).expect(404);
    });

    it('keeps a now inactive category on edit', async () => {
      const [rent] = (
        await createTransactions({ categoryId: aluguel }).expect(201)
      ).body as GroupTransaction[];
      await ana.patch(`${base()}/${aluguel}`).send({ active: false });

      await ana
        .patch(`/groups/${group.id}/transactions/${rent.id}`)
        .send({ description: 'Aluguel de outubro', categoryId: aluguel })
        .expect(200);
    });

    it('leaves the transactions without a category when it is deleted', async () => {
      await createTransactions({ categoryId: aluguel }).expect(201);

      await ana.delete(`${base()}/${aluguel}`).expect(204);

      const [rent] = await monthOf(MONTH);
      expect(rent.category).toBeNull();
    });
  });
});
