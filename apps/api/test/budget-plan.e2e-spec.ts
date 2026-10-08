import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  addTransactions,
  type Agent,
  createPaymentMethod,
  createTestApp,
  resetDatabase,
  signUp as signUpUser,
} from './utils.js';

interface Category {
  id: number;
  name: string;
  active: boolean;
}
interface Group {
  id: number;
  kind: 'INCOME' | 'EXPENSE';
  name: string;
  active: boolean;
  goalPercent: number | null;
  categories: Category[];
}
interface Line {
  anchorId: number;
  categoryId: number;
  description: string | null;
  cells: {
    month: string;
    transactionId: number;
    plannedCents: number;
    realizedCents: number | null;
  }[];
}

describe('Budget plan (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;

  const signUp = (name: string, email: string) => signUpUser(app, name, email);

  const tree = async (client: Agent) =>
    (await client.get('/budget/categories').expect(200)).body as Group[];
  const lines = async (client: Agent) =>
    (await client.get('/budget/lines?from=2026-10&to=2027-09').expect(200))
      .body as Line[];
  const save = (client: Agent, plan: object) =>
    client.put('/budget/plan').send(plan);

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

  /** Everything the plan could touch, to prove a failed save changed nothing */
  const snapshot = async (client: Agent) => ({
    tree: await tree(client),
    lines: await lines(client),
  });

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp('Ana Souza', 'ana@example.com');
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a session', async () => {
    await request(app.getHttpServer()).put('/budget/plan').send({}).expect(401);
  });

  it('creates a type, a category, a repeated launch and its values in one save', async () => {
    await tree(ana); // seeds the defaults

    await save(ana, {
      createGroups: [
        { ref: -1, kind: 'EXPENSE', name: 'Lazer', goalPercent: 10 },
      ],
      createCategories: [{ ref: -2, groupId: -1, name: 'Cinema' }],
      createLines: [
        {
          ref: -3,
          categoryId: -2,
          month: '2026-10',
          description: 'Ingressos',
          plannedCents: 5000,
          repeatMonths: 3,
          dueDay: 5,
        },
      ],
      // A value of the new launch, and a month added after its series
      cells: [
        { anchorId: -3, month: '2026-11', amountCents: 8000 },
        { anchorId: -3, month: '2027-01', amountCents: 1000 },
      ],
    }).expect(204);

    const lazer = (await tree(ana)).find((g) => g.name === 'Lazer')!;
    expect(lazer).toMatchObject({ kind: 'EXPENSE', goalPercent: 10 });
    expect(lazer.categories.map((c) => c.name)).toEqual(['Cinema']);
    const [line] = (await lines(ana)).filter(
      (l) => l.categoryId === lazer.categories[0].id,
    );
    expect(line.description).toBe('Ingressos');
    expect(line.cells.map((c) => [c.month, c.plannedCents])).toEqual([
      ['2026-10', 5000],
      ['2026-11', 8000],
      ['2026-12', 5000],
      ['2027-01', 1000],
    ]);
  });

  it('edits and deletes existing launches from an occurrence on', async () => {
    const { housing } = await defaults(ana);
    const rent = await ana
      .post('/budget/transactions')
      .send({
        categoryId: housing,
        month: '2026-10',
        plannedCents: 100000,
        repeatMonths: 3,
        description: 'Aluguel',
      })
      .expect(201);
    const [oct, nov] = (rent.body as { id: number }[]).map((t) => t.id);
    const [power] = await addTransactions(ana, [
      { categoryId: housing, month: '2026-10', amountCents: 20000 },
    ]);
    // October's rent is paid: it stays as it was
    await ana
      .put(`/budget/transactions/${oct}/realization`)
      .send({ amountCents: 100000 })
      .expect(200);

    await save(ana, {
      updateLines: [
        {
          transactionId: nov,
          plannedCents: 120000,
          description: 'Aluguel novo',
        },
      ],
      deleteLines: [power],
    }).expect(204);

    const after = await lines(ana);
    expect(after).toHaveLength(1);
    expect(after[0].cells.map((c) => c.plannedCents)).toEqual([
      100000, 120000, 120000,
    ]);
  });

  it('saves the values of a category before inactivating it', async () => {
    const { housing } = await defaults(ana);
    const [rent] = await addTransactions(ana, [
      { categoryId: housing, month: '2026-10', amountCents: 100000 },
    ]);

    await save(ana, {
      cells: [{ anchorId: rent, month: '2026-11', amountCents: 110000 }],
      updateCategories: [{ id: housing, active: false, name: 'Casa' }],
    }).expect(204);

    const basics = (await tree(ana)).find(
      (g) => g.name === 'Despesas Básicas',
    )!;
    expect(basics.categories.find((c) => c.id === housing)).toMatchObject({
      name: 'Casa',
      active: false,
    });
    expect((await lines(ana))[0].cells.map((c) => c.plannedCents)).toEqual([
      100000, 110000,
    ]);
  });

  it('reactivates a type before adding to it, and deletes first so a name can be reused', async () => {
    const { basics, salaryGroup, housing } = await defaults(ana);
    await ana
      .patch(`/budget/groups/${salaryGroup}`)
      .send({ active: false })
      .expect(200);
    await addTransactions(ana, [
      { categoryId: housing, month: '2026-10', amountCents: 100000 },
    ]);

    await save(ana, {
      updateGroups: [
        { id: salaryGroup, active: true },
        { id: basics, goalPercent: 50 },
      ],
      createCategories: [
        { ref: -1, groupId: salaryGroup, name: 'Bônus' },
        // The deleted category's name, in the same type
        { ref: -2, groupId: basics, name: 'Moradia' },
      ],
      deleteCategories: [housing],
    }).expect(204);

    const groups = await tree(ana);
    const salary = groups.find((g) => g.id === salaryGroup)!;
    expect(salary.active).toBe(true);
    expect(salary.categories.map((c) => c.name)).toContain('Bônus');
    const basicsAfter = groups.find((g) => g.id === basics)!;
    expect(basicsAfter.goalPercent).toBe(50);
    const housingAfter = basicsAfter.categories.find(
      (c) => c.name === 'Moradia',
    )!;
    expect(housingAfter.id).not.toBe(housing);
    // The values went with the deleted category
    expect(await lines(ana)).toEqual([]);

    await save(ana, { deleteGroups: [basics] }).expect(204);
    expect((await tree(ana)).map((g) => g.id)).not.toContain(basics);
  });

  describe('all or nothing', () => {
    it('keeps everything when a name is duplicated (409)', async () => {
      const { basics, housing } = await defaults(ana);
      const before = await snapshot(ana);

      const res = await save(ana, {
        createGroups: [{ ref: -1, kind: 'EXPENSE', name: 'Lazer' }],
        updateGroups: [{ id: basics, goalPercent: 40 }],
        createLines: [
          { ref: -2, categoryId: housing, month: '2026-10', plannedCents: 1 },
        ],
        // Already a category of Despesas Básicas
        createCategories: [{ ref: -3, groupId: basics, name: 'Moradia' }],
      }).expect(409);
      expect(res.body.message).toBe('An item with this name already exists');

      expect(await snapshot(ana)).toEqual(before);
    });

    it('keeps everything when a launch goes to an inactive category (400)', async () => {
      const { housing, salary } = await defaults(ana);
      await ana
        .patch(`/budget/categories/${salary}`)
        .send({ active: false })
        .expect(200);
      const before = await snapshot(ana);

      const res = await save(ana, {
        createGroups: [{ ref: -1, kind: 'EXPENSE', name: 'Lazer' }],
        createLines: [
          { ref: -2, categoryId: housing, month: '2026-10', plannedCents: 1 },
          { ref: -3, categoryId: salary, month: '2026-10', plannedCents: 1 },
        ],
      }).expect(400);
      expect(res.body.message).toBe('Category is inactive');

      expect(await snapshot(ana)).toEqual(before);
    });

    it('rejects a reference to an item the plan does not create', async () => {
      await tree(ana);
      const before = await snapshot(ana);

      const res = await save(ana, {
        createGroups: [{ ref: -1, kind: 'EXPENSE', name: 'Lazer' }],
        createCategories: [{ ref: -2, groupId: -5, name: 'Cinema' }],
      }).expect(400);
      expect(res.body.message).toBe('Unknown type reference');

      expect(await snapshot(ana)).toEqual(before);
    });
  });

  describe('isolation between users', () => {
    it("returns 404 for another user's items and changes nothing", async () => {
      const bia = await signUp('Bia Lima', 'bia@example.com');
      const { basics, housing } = await defaults(bia);
      const [biaRent] = await addTransactions(bia, [
        { categoryId: housing, month: '2026-10', amountCents: 100000 },
      ]);
      const biaCard = await createPaymentMethod(bia);
      const anaIds = await defaults(ana);
      const biaBefore = await snapshot(bia);
      const anaBefore = await snapshot(ana);

      const attempts: object[] = [
        { updateGroups: [{ id: basics, name: 'Meu' }] },
        { deleteGroups: [basics] },
        { createCategories: [{ ref: -1, groupId: basics, name: 'X' }] },
        { updateCategories: [{ id: housing, active: false }] },
        { deleteCategories: [housing] },
        {
          createLines: [
            { ref: -1, categoryId: housing, month: '2026-10', plannedCents: 1 },
          ],
        },
        { updateLines: [{ transactionId: biaRent, plannedCents: 1 }] },
        { deleteLines: [biaRent] },
        { cells: [{ anchorId: biaRent, month: '2026-11', amountCents: 1 }] },
        {
          createLines: [
            {
              ref: -1,
              categoryId: anaIds.housing,
              month: '2026-10',
              plannedCents: 1,
              paymentMethodId: biaCard.id,
            },
          ],
        },
      ];
      for (const plan of attempts) {
        // Ana's own change in the same save is rolled back too
        await save(ana, {
          ...plan,
          updateGroups: [
            ...((plan as { updateGroups?: object[] }).updateGroups ?? []),
            { id: anaIds.basics, goalPercent: 30 },
          ],
        }).expect(404);
      }

      expect(await snapshot(bia)).toEqual(biaBefore);
      expect(await snapshot(ana)).toEqual(anaBefore);
    });
  });

  describe('validation', () => {
    beforeEach(() => tree(ana));

    it.each([
      ['an unknown field', { other: 1 }],
      [
        'an unknown field in an item',
        {
          deleteGroups: [1],
          createGroups: [{ ref: -1, kind: 'EXPENSE', name: 'X', extra: 1 }],
        },
      ],
      [
        'a non-negative ref',
        { createGroups: [{ ref: 0, kind: 'EXPENSE', name: 'X' }] },
      ],
      [
        'a positive ref',
        { createGroups: [{ ref: 3, kind: 'EXPENSE', name: 'X' }] },
      ],
      [
        'a zero reference',
        { createCategories: [{ ref: -1, groupId: 0, name: 'X' }] },
      ],
      [
        'a zero anchor',
        { cells: [{ anchorId: 0, month: '2026-10', amountCents: 1 }] },
      ],
      ['a non-positive id to delete', { deleteCategories: [0] }],
      [
        'an invalid month',
        {
          createLines: [
            { ref: -1, categoryId: 1, month: '2026-13', plannedCents: 1 },
          ],
        },
      ],
      [
        'a negative amount',
        { cells: [{ anchorId: 1, month: '2026-10', amountCents: -1 }] },
      ],
      [
        'a blank name',
        { createGroups: [{ ref: -1, kind: 'EXPENSE', name: ' ' }] },
      ],
      ['a scope', { updateLines: [{ transactionId: 1, scope: 'ONE' }] }],
    ])('rejects %s', async (_case, plan) => {
      await save(ana, plan).expect(400);
    });

    it('rejects a goal on an income type', async () => {
      const { salaryGroup } = await defaults(ana);
      const res = await save(ana, {
        updateGroups: [{ id: salaryGroup, goalPercent: 10 }],
      }).expect(400);
      expect(res.body.message).toBe('Only expense types can have a goal');
    });

    it('accepts an empty plan', async () => {
      await save(ana, {}).expect(204);
    });
  });
});
