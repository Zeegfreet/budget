import { describe, expect, it } from 'vitest'
import { budgetGroups, budgetLines, makeLine } from '@/test/budget'
import { cellKey } from './draft'
import { monthWindow } from './months'
import {
  applyPlan,
  emptyPlan,
  isPendingItem,
  planChangeCount,
  planReducer,
  planRequest,
  type Plan,
  type PlanAction,
  type PlanBase,
} from './plan'

const months = monthWindow('2026-10', 12)
const base: PlanBase = { groups: budgetGroups, lines: budgetLines }
/** Applies the actions in order, from an empty plan */
const run = (...actions: PlanAction[]): Plan =>
  actions.reduce((plan, action) => planReducer(plan, action, base), emptyPlan())
const project = (plan: Plan) => applyPlan(base, plan, months)
const groupNamed = (plan: Plan, name: string) => project(plan).groups.find((g) => g.name === name)
const lineOf = (plan: Plan, anchorId: number) => project(plan).lines.find((l) => l.anchorId === anchorId)

describe('planReducer: the tree', () => {
  it('hands out a new ref to each created item, the category in a new type included', () => {
    const plan = run(
      { type: 'create-group', kind: 'EXPENSE', name: 'Lazer+', goalPercent: 5 },
      { type: 'create-category', groupId: -1, name: 'Cinema' },
    )
    expect(plan.nextRef).toBe(-3)
    expect(groupNamed(plan, 'Lazer+')).toMatchObject({
      id: -1,
      kind: 'EXPENSE',
      goalPercent: 5,
      active: true,
      categories: [{ id: -2, name: 'Cinema', active: true }],
    })
    expect(planChangeCount(plan)).toBe(2)
  })

  it('merges edits of a created item into its creation', () => {
    const plan = run(
      { type: 'create-group', kind: 'EXPENSE', name: 'Lazer+', goalPercent: null },
      { type: 'update-group', id: -1, patch: { name: 'Viagens', goalPercent: 10 } },
      { type: 'create-category', groupId: 10, name: 'Água' },
      { type: 'update-category', id: -2, patch: { name: 'Luz' } },
    )
    expect(plan.createdGroups).toEqual([{ ref: -1, kind: 'EXPENSE', name: 'Viagens', goalPercent: 10 }])
    expect(plan.createdCategories).toEqual([{ ref: -2, groupId: 10, name: 'Luz' }])
    expect(plan.groupPatches.size + plan.categoryPatches.size).toBe(0)
  })

  it('merges edits of a saved item and drops what went back to the saved value', () => {
    let plan = run(
      { type: 'update-group', id: 10, patch: { name: 'Essenciais' } },
      { type: 'update-group', id: 10, patch: { goalPercent: 50 } },
    )
    expect(plan.groupPatches.get(10)).toEqual({ name: 'Essenciais', goalPercent: 50 })
    plan = planReducer(plan, { type: 'update-group', id: 10, patch: { name: 'Despesas Básicas', goalPercent: null } }, base)
    expect(plan.groupPatches.size).toBe(0)

    plan = run(
      { type: 'update-category', id: 3, patch: { active: false } },
      { type: 'update-category', id: 3, patch: { active: true } },
    )
    expect(planChangeCount(plan)).toBe(0)
  })

  it('keeps the typed values of an inactivated category', () => {
    const plan = run(
      { type: 'set', anchorId: 301, month: '2026-10', amountCents: 5000 },
      { type: 'update-category', id: 3, patch: { active: false } },
    )
    expect(plan.edits.get(cellKey(301, '2026-10'))).toBe(5000)
    expect(groupNamed(plan, 'Custos de Vida')!.categories[0].active).toBe(false)
  })

  it('deleting a saved category forgets every change under it', () => {
    const plan = run(
      { type: 'update-category', id: 1, patch: { name: 'Casa' } },
      { type: 'set', anchorId: 101, month: '2026-10', amountCents: 1 },
      { type: 'set', anchorId: 201, month: '2026-10', amountCents: 2 },
      { type: 'update-line', anchorId: 101, patch: { description: 'Novo' } },
      { type: 'create-line', input: { categoryId: 1, month: '2026-10', plannedCents: 10 }, paymentMethod: null },
      // Moved into Moradia, then Moradia goes
      { type: 'update-line', anchorId: 401, patch: { categoryId: 1 } },
      { type: 'delete-category', id: 1 },
    )
    expect(plan.deletedCategories).toEqual(new Set([1]))
    expect(plan.categoryPatches.size + plan.lineChanges.size + plan.createdLines.length).toBe(0)
    expect([...plan.edits.keys()]).toEqual([cellKey(201, '2026-10')])
    const projected = project(plan)
    expect(projected.groups[0].categories.map((c) => c.id)).toEqual([2])
    expect(projected.lines.map((l) => l.anchorId)).toEqual([201, 301, 401])
  })

  it('deleting a saved type replaces the deletion of its categories', () => {
    const plan = run(
      { type: 'delete-category', id: 3 },
      { type: 'create-category', groupId: 20, name: 'Viagem' },
      { type: 'set', anchorId: 301, month: '2026-12', amountCents: 1 },
      { type: 'delete-group', id: 20 },
    )
    expect(plan.deletedGroups).toEqual(new Set([20]))
    expect(plan.deletedCategories.size + plan.createdCategories.length + plan.edits.size).toBe(0)
    expect(planChangeCount(plan)).toBe(1)
    expect(project(plan).groups.map((g) => g.id)).toEqual([10, 30, 40])
    expect(project(plan).lines.map((l) => l.anchorId)).toEqual([101, 201, 401])
  })

  it('deleting a created item just forgets it', () => {
    const plan = run(
      { type: 'create-group', kind: 'INCOME', name: 'Bicos', goalPercent: null },
      { type: 'create-category', groupId: -1, name: 'Freela' },
      { type: 'create-line', input: { categoryId: -2, month: '2026-10', plannedCents: 10 }, paymentMethod: null },
      { type: 'set', anchorId: -3, month: '2026-11', amountCents: 20 },
      { type: 'delete-group', id: -1 },
    )
    expect(planChangeCount(plan)).toBe(0)
    expect(plan.edits.size).toBe(0)
    expect(planRequest(plan, [])).toEqual({})
  })
})

describe('planReducer: launches', () => {
  const realizedRent = makeLine(
    101,
    1,
    [
      ['2026-10', 180000, 180000],
      ['2026-11', 180000],
      ['2026-12', 180000],
    ],
    { description: 'Aluguel' },
  )
  const withRealized: PlanBase = { groups: budgetGroups, lines: [realizedRent] }
  const runOn = (...actions: PlanAction[]) =>
    actions.reduce((plan, action) => planReducer(plan, action, withRealized), emptyPlan())

  it('projects a created launch over its months in the window', () => {
    const plan = run({
      type: 'create-line',
      input: { categoryId: 3, month: '2026-10', plannedCents: 5590, repeatMonths: 3, description: 'Netflix', dueDay: 5 },
      paymentMethod: { id: 2, name: 'Cartão', dueDay: 12 },
    })
    expect(lineOf(plan, -1)).toEqual({
      anchorId: -1,
      categoryId: 3,
      description: 'Netflix',
      dueDay: 5,
      paymentUrl: null,
      paymentMethod: { id: 2, name: 'Cartão', dueDay: 12 },
      cells: ['2026-10', '2026-11', '2026-12'].map((month) => ({
        month,
        transactionId: -1,
        plannedCents: 5590,
        realizedCents: null,
      })),
    })
    // A repeat past the window stops at its end
    const long = run({
      type: 'create-line',
      input: { categoryId: 3, month: '2026-10', plannedCents: 1, repeatMonths: 60 },
      paymentMethod: null,
    })
    expect(lineOf(long, -1)!.cells).toHaveLength(12)
  })

  it('fills the window with an open-ended launch, raised by its scheduled adjustment', () => {
    const plan = run({
      type: 'create-line',
      input: {
        categoryId: 1,
        month: '2026-11',
        plannedCents: 100000,
        openEnded: true,
        adjustment: { percentBp: 500, everyMonths: 6 },
      },
      paymentMethod: null,
    })
    const cells = lineOf(plan, -1)!.cells
    expect(cells.map((c) => c.month)).toEqual(months.slice(1))
    // The first adjustment comes 6 months after the start (May/27)
    expect(cells.find((c) => c.month === '2027-04')!.plannedCents).toBe(100000)
    expect(cells.find((c) => c.month === '2027-05')!.plannedCents).toBe(105000)
    expect(planRequest(plan, []).createLines).toEqual([
      {
        ref: -1,
        categoryId: 1,
        month: '2026-11',
        plannedCents: 100000,
        openEnded: true,
        adjustment: { percentBp: 500, everyMonths: 6 },
      },
    ])
  })

  it('edits a created launch in place; a new amount replaces its typed values', () => {
    const plan = run(
      { type: 'create-line', input: { categoryId: 3, month: '2026-10', plannedCents: 100, repeatMonths: 2 }, paymentMethod: null },
      { type: 'set', anchorId: -1, month: '2026-11', amountCents: 300 },
      { type: 'update-line', anchorId: -1, patch: { description: 'Cinema', paymentMethodId: 2 }, paymentMethod: { id: 2, name: 'Cartão', dueDay: null } },
    )
    expect(plan.edits.size).toBe(1)
    const next = planReducer(plan, { type: 'update-line', anchorId: -1, patch: { plannedCents: 200 } }, base)
    expect(next.createdLines[0]).toMatchObject({
      input: { description: 'Cinema', paymentMethodId: 2, plannedCents: 200 },
      paymentMethod: { id: 2, name: 'Cartão', dueDay: null },
    })
    expect(next.edits.size).toBe(0)
    expect(next.lineChanges.size).toBe(0)
  })

  it('changes a saved launch from its first pending month on, keeping the realized ones', () => {
    const plan = runOn(
      { type: 'set', anchorId: 101, month: '2026-12', amountCents: 1 },
      { type: 'update-line', anchorId: 101, patch: { plannedCents: 200000, dueDay: 15 } },
    )
    expect(plan.lineChanges.get(101)).toEqual({
      transactionId: 102,
      month: '2026-11',
      patch: { plannedCents: 200000, dueDay: 15 },
    })
    // The new amount replaces the typed values from that month on
    expect(plan.edits.size).toBe(0)
    const line = applyPlan(withRealized, plan, months).lines[0]
    expect(line.dueDay).toBe(15)
    expect(line.cells.map((c) => [c.plannedCents, c.realizedCents])).toEqual([
      [180000, 180000],
      [200000, null],
      [200000, null],
    ])
  })

  it('drops a launch change that went back to the saved values', () => {
    const plan = runOn(
      { type: 'update-line', anchorId: 101, patch: { description: 'Casa', paymentMethodId: 2 }, paymentMethod: { id: 2, name: 'C', dueDay: null } },
      { type: 'update-line', anchorId: 101, patch: { description: 'Aluguel', paymentMethodId: null }, paymentMethod: null },
    )
    expect(plan.lineChanges.size).toBe(0)
  })

  it('shows the pending payment method of a changed launch', () => {
    const plan = runOn({
      type: 'update-line',
      anchorId: 101,
      patch: { paymentMethodId: 2 },
      paymentMethod: { id: 2, name: 'Cartão', dueDay: 12 },
    })
    expect(applyPlan(withRealized, plan, months).lines[0].paymentMethod).toEqual({ id: 2, name: 'Cartão', dueDay: 12 })
    // A later change of another field keeps it
    const next = planReducer(plan, { type: 'update-line', anchorId: 101, patch: { description: 'Casa' } }, withRealized)
    expect(next.lineChanges.get(101)!.paymentMethod).toEqual({ id: 2, name: 'Cartão', dueDay: 12 })
  })

  it('moves a launch to another category', () => {
    const plan = run({ type: 'update-line', anchorId: 201, patch: { categoryId: 1 } })
    expect(lineOf(plan, 201)!.categoryId).toBe(1)
  })

  it('deletes a saved launch from its first pending month on', () => {
    const plan = runOn(
      { type: 'update-line', anchorId: 101, patch: { description: 'Casa' } },
      { type: 'set', anchorId: 101, month: '2027-01', amountCents: 5 },
      { type: 'delete-line', anchorId: 101 },
    )
    expect(plan.lineRemovals.get(101)).toEqual({ transactionId: 102, month: '2026-11' })
    expect(plan.lineChanges.size + plan.edits.size).toBe(0)
    // The realized October stays
    expect(applyPlan(withRealized, plan, months).lines[0].cells.map((c) => c.month)).toEqual(['2026-10'])
    // Without a realized month, the row is gone
    expect(lineOf(run({ type: 'delete-line', anchorId: 201 }), 201)).toBeUndefined()
  })
})

describe('planReducer: values', () => {
  it('passes the grid actions to the draft and discards everything', () => {
    let plan = run(
      { type: 'fill', anchorId: 101, months: ['2026-11', '2026-12'], amountCents: 9 },
      { type: 'delete-category', id: 3 },
    )
    expect(plan.edits.size).toBe(2)
    plan = planReducer(plan, { type: 'discard' }, base)
    expect(plan).toEqual(emptyPlan())
  })
})

describe('planRequest', () => {
  it('sends only the non-empty lists, without empty optional fields', () => {
    const plan = run(
      { type: 'create-group', kind: 'INCOME', name: 'Bicos', goalPercent: null },
      { type: 'create-group', kind: 'EXPENSE', name: 'Viagens', goalPercent: 10 },
      { type: 'create-category', groupId: -1, name: 'Freela' },
      {
        type: 'create-line',
        input: { categoryId: -3, month: '2026-10', plannedCents: 10, description: null, dueDay: null },
        paymentMethod: null,
      },
      { type: 'update-group', id: 10, patch: { goalPercent: 50 } },
      { type: 'update-category', id: 3, patch: { active: false } },
      { type: 'update-line', anchorId: 101, patch: { dueDay: null } },
      { type: 'delete-line', anchorId: 301 },
      { type: 'delete-category', id: 2 },
      { type: 'delete-group', id: 40 },
    )
    const cells = [{ anchorId: -4, month: '2026-11', amountCents: 20 }]
    expect(planRequest(plan, cells)).toEqual({
      createGroups: [
        { ref: -1, kind: 'INCOME', name: 'Bicos' },
        { ref: -2, kind: 'EXPENSE', name: 'Viagens', goalPercent: 10 },
      ],
      updateGroups: [{ id: 10, goalPercent: 50 }],
      deleteGroups: [40],
      createCategories: [{ ref: -3, groupId: -1, name: 'Freela' }],
      updateCategories: [{ id: 3, active: false }],
      deleteCategories: [2],
      createLines: [{ ref: -4, categoryId: -3, month: '2026-10', plannedCents: 10 }],
      // `null` clears the due day
      updateLines: [{ transactionId: 101, dueDay: null }],
      deleteLines: [301],
      cells,
    })
    expect(planChangeCount(plan)).toBe(10)
  })
})

describe('isPendingItem', () => {
  it('marks created and changed items only', () => {
    const plan = run(
      { type: 'update-group', id: 10, patch: { name: 'X' } },
      { type: 'update-category', id: 1, patch: { name: 'Y' } },
      { type: 'update-line', anchorId: 101, patch: { description: 'Z' } },
    )
    expect(isPendingItem(plan, 'group', 10)).toBe(true)
    expect(isPendingItem(plan, 'group', 20)).toBe(false)
    expect(isPendingItem(plan, 'category', 1)).toBe(true)
    expect(isPendingItem(plan, 'category', 2)).toBe(false)
    expect(isPendingItem(plan, 'line', 101)).toBe(true)
    expect(isPendingItem(plan, 'line', 201)).toBe(false)
    expect(isPendingItem(plan, 'line', -1)).toBe(true)
  })
})
