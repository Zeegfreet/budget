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
interface Category {
  id: number;
  name: string;
  position: number;
  active: boolean;
}
interface Group {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  name: string;
  position: number;
  active: boolean;
  goalPercent: number | null;
  categories: Category[];
}

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;

  async function signUp(name: string, email: string) {
    const client = request.agent(app.getHttpServer());
    await client.post('/auth/register').send(userBody(name, email)).expect(201);
    return client;
  }

  async function tree(client: Agent) {
    const res = await client.get('/budget/categories').expect(200);
    return res.body as Group[];
  }

  /** Ids of a few default items */
  async function defaults(client: Agent) {
    const groups = await tree(client);
    const group = (name: string) => groups.find((g) => g.name === name)!;
    const basics = group('Despesas Básicas');
    return {
      basics: basics.id,
      salaryGroup: group('Salário').id,
      housing: basics.categories.find((c) => c.name === 'Moradia')!.id,
      salary: group('Salário').categories[0].id,
    };
  }

  const summary = async (client: Agent) =>
    (await client.get('/budget/summary?month=2026-11').expect(200)).body as {
      openingBalanceCents: number;
      expenseCents: number;
    };

  /** Plans one launch of `amountCents` in the category and month. */
  const plan = (
    client: Agent,
    categoryId: number,
    month: string,
    amountCents: number,
  ) =>
    client
      .post('/budget/transactions')
      .send({ categoryId, month, plannedCents: amountCents });

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
    await http.post('/budget/groups').send({}).expect(401);
    await http.patch('/budget/groups/1').send({}).expect(401);
    await http.delete('/budget/groups/1').expect(401);
    await http.post('/budget/groups/1/categories').send({}).expect(401);
    await http.patch('/budget/categories/1').send({}).expect(401);
    await http.delete('/budget/categories/1').expect(401);
  });

  it('lists defaults with the new fields', async () => {
    const [basics] = await tree(ana);
    expect(basics).toMatchObject({ active: true, goalPercent: null });
    expect(basics.categories[0]).toEqual({
      id: expect.any(Number),
      name: 'Moradia',
      position: 0,
      active: true,
    });
  });

  describe('types', () => {
    it('creates a type at the end of its kind, trimmed', async () => {
      await tree(ana);
      const res = await ana
        .post('/budget/groups')
        .send({ kind: 'EXPENSE', name: '  Investimentos ', goalPercent: 20 })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        kind: 'EXPENSE',
        name: 'Investimentos',
        position: 2,
        active: true,
        goalPercent: 20,
        categories: [],
      });

      const expenses = (await tree(ana)).filter((g) => g.kind === 'EXPENSE');
      expect(expenses.map((g) => g.name)).toEqual([
        'Despesas Básicas',
        'Custos de Vida',
        'Investimentos',
      ]);
    });

    it('renames, sets and clears the goal, inactivates and reactivates', async () => {
      const ids = await defaults(ana);
      const patch = (body: object) =>
        ana.patch(`/budget/groups/${ids.basics}`).send(body);

      const renamed = await patch({ name: 'Essenciais', goalPercent: 50 });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({
        name: 'Essenciais',
        goalPercent: 50,
        active: true,
      });
      expect(renamed.body.categories).toHaveLength(4);

      const cleared = await patch({ goalPercent: null }).expect(200);
      expect(cleared.body).toMatchObject({
        name: 'Essenciais',
        goalPercent: null,
      });

      await patch({ active: false }).expect(200);
      expect((await tree(ana))[0].active).toBe(false);
      await patch({ active: true }).expect(200);
      expect((await tree(ana))[0].active).toBe(true);
    });

    it('deletes a type with its categories and values', async () => {
      const ids = await defaults(ana);
      await plan(ana, ids.housing, '2026-10', 1000).expect(201);
      expect((await summary(ana)).openingBalanceCents).toBe(-1000);

      await ana.delete(`/budget/groups/${ids.basics}`).expect(204);

      expect((await tree(ana)).map((g) => g.name)).not.toContain(
        'Despesas Básicas',
      );
      expect((await summary(ana)).openingBalanceCents).toBe(0);
      await plan(ana, ids.housing, '2026-10', 1).expect(404);
    });

    it('does not bring the defaults back after deleting every type', async () => {
      for (const group of await tree(ana)) {
        await ana.delete(`/budget/groups/${group.id}`).expect(204);
      }
      expect(await tree(ana)).toEqual([]);
    });

    it('returns 409 for a name already used in the same kind', async () => {
      await tree(ana);
      await ana
        .post('/budget/groups')
        .send({ kind: 'EXPENSE', name: 'Custos de Vida' })
        .expect(409);
      // Same name in the other kind is fine
      await ana
        .post('/budget/groups')
        .send({ kind: 'INCOME', name: 'Custos de Vida' })
        .expect(201);

      const ids = await defaults(ana);
      await ana
        .patch(`/budget/groups/${ids.basics}`)
        .send({ name: 'Custos de Vida' })
        .expect(409);
    });

    it.each([
      ['a missing kind', { name: 'X' }],
      ['an unknown kind', { kind: 'SAVING', name: 'X' }],
      ['a blank name', { kind: 'EXPENSE', name: '   ' }],
      ['a long name', { kind: 'EXPENSE', name: 'x'.repeat(61) }],
      ['a zero goal', { kind: 'EXPENSE', name: 'X', goalPercent: 0 }],
      ['a goal over 100', { kind: 'EXPENSE', name: 'X', goalPercent: 101 }],
      ['a fractional goal', { kind: 'EXPENSE', name: 'X', goalPercent: 1.5 }],
      ['a goal on income', { kind: 'INCOME', name: 'X', goalPercent: 10 }],
      ['an unknown field', { kind: 'EXPENSE', name: 'X', userId: 2 }],
    ])('rejects %s when creating with 400', async (_case, body) => {
      await ana.post('/budget/groups').send(body).expect(400);
    });

    it.each([
      ['a kind change', { kind: 'INCOME' }],
      ['a null name', { name: null }],
      ['a null active', { active: null }],
      ['a non-boolean active', { active: 'no' }],
      ['an unknown field', { position: 3 }],
    ])('rejects %s when updating with 400', async (_case, body) => {
      const ids = await defaults(ana);
      await ana.patch(`/budget/groups/${ids.basics}`).send(body).expect(400);
    });

    it('rejects a goal on an income type when updating', async () => {
      const ids = await defaults(ana);
      await ana
        .patch(`/budget/groups/${ids.salaryGroup}`)
        .send({ goalPercent: 10 })
        .expect(400);
    });

    it('returns 400 for a non-numeric id and 404 for an unknown one', async () => {
      await ana.patch('/budget/groups/abc').send({ name: 'X' }).expect(400);
      await ana.patch('/budget/groups/999999').send({ name: 'X' }).expect(404);
      await ana.delete('/budget/groups/999999').expect(404);
    });
  });

  describe('categories', () => {
    it('creates a category at the end, trimmed', async () => {
      const ids = await defaults(ana);
      const res = await ana
        .post(`/budget/groups/${ids.basics}/categories`)
        .send({ name: ' Condomínio ' })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        name: 'Condomínio',
        position: 4,
        active: true,
      });

      const [basics] = await tree(ana);
      expect(basics.categories.at(-1)!.name).toBe('Condomínio');
    });

    it('renames a category', async () => {
      const ids = await defaults(ana);
      const res = await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send({ name: ' Aluguel ' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Aluguel', active: true });
    });

    it('keeps the values of an inactive category but rejects editing them', async () => {
      const ids = await defaults(ana);
      await plan(ana, ids.housing, '2026-10', 1000).expect(201);

      await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send({ active: false })
        .expect(200);
      expect((await summary(ana)).openingBalanceCents).toBe(-1000);
      await plan(ana, ids.housing, '2026-11', 1).expect(400);

      await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send({ active: true })
        .expect(200);
      await plan(ana, ids.housing, '2026-11', 1).expect(201);
    });

    it('rejects values and new categories in an inactive type', async () => {
      const ids = await defaults(ana);
      await ana
        .patch(`/budget/groups/${ids.basics}`)
        .send({ active: false })
        .expect(200);

      await plan(ana, ids.housing, '2026-11', 1).expect(400);
      await ana
        .post(`/budget/groups/${ids.basics}/categories`)
        .send({ name: 'Nova' })
        .expect(400);
    });

    it('deletes a category with its values', async () => {
      const ids = await defaults(ana);
      await plan(ana, ids.housing, '2026-11', 1000).expect(201);

      await ana.delete(`/budget/categories/${ids.housing}`).expect(204);

      expect((await summary(ana)).expenseCents).toBe(0);
      const [basics] = await tree(ana);
      expect(basics.categories.map((c) => c.name)).not.toContain('Moradia');
      await ana.delete(`/budget/categories/${ids.housing}`).expect(404);
    });

    it('returns 409 for a name already used in the same type', async () => {
      const ids = await defaults(ana);
      await ana
        .post(`/budget/groups/${ids.basics}/categories`)
        .send({ name: 'Saúde' })
        .expect(409);
      await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send({ name: 'Saúde' })
        .expect(409);
    });

    it.each([
      ['a missing name', {}],
      ['a long name', { name: 'x'.repeat(61) }],
      [
        'a description (it belongs to the launch)',
        { name: 'X', description: 'x' },
      ],
      ['a due day (it belongs to the launch)', { name: 'X', dueDay: 10 }],
      ['an unknown field', { name: 'X', groupId: 1 }],
    ])('rejects %s when creating with 400', async (_case, body) => {
      const ids = await defaults(ana);
      await ana
        .post(`/budget/groups/${ids.basics}/categories`)
        .send(body)
        .expect(400);
    });

    it.each([
      ['a null name', { name: null }],
      ['a due day', { dueDay: 10 }],
      ['a move to another type', { groupId: 1 }],
    ])('rejects %s when updating with 400', async (_case, body) => {
      const ids = await defaults(ana);
      await ana
        .patch(`/budget/categories/${ids.housing}`)
        .send(body)
        .expect(400);
    });

    it('returns 404 for unknown ids', async () => {
      await ana
        .post('/budget/groups/999999/categories')
        .send({ name: 'X' })
        .expect(404);
      await ana
        .patch('/budget/categories/999999')
        .send({ name: 'X' })
        .expect(404);
      await ana.delete('/budget/categories/abc').expect(400);
    });
  });

  describe('isolation between users', () => {
    it('user A cannot change or delete user B’s types and categories', async () => {
      const anaIds = await defaults(ana);
      await plan(ana, anaIds.housing, '2026-10', 1000).expect(201);
      const before = await tree(ana);

      const bruno = await signUp('Bruno Lima', 'bruno@example.com');
      await tree(bruno);

      await bruno
        .patch(`/budget/groups/${anaIds.basics}`)
        .send({ name: 'Hack' })
        .expect(404);
      await bruno
        .patch(`/budget/groups/${anaIds.basics}`)
        .send({ active: false })
        .expect(404);
      await bruno.delete(`/budget/groups/${anaIds.basics}`).expect(404);
      await bruno
        .post(`/budget/groups/${anaIds.basics}/categories`)
        .send({ name: 'Hack' })
        .expect(404);
      await bruno
        .patch(`/budget/categories/${anaIds.housing}`)
        .send({ name: 'Hack' })
        .expect(404);
      await bruno.delete(`/budget/categories/${anaIds.housing}`).expect(404);

      // Bruno's own tree never shows Ana's items
      const brunoIds = (await tree(bruno)).map((g) => g.id);
      expect(brunoIds).not.toContain(anaIds.basics);

      // Ana's data is untouched
      expect(await tree(ana)).toEqual(before);
      expect((await summary(ana)).openingBalanceCents).toBe(-1000);
    });
  });
});
