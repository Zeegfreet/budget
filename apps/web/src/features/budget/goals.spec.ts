import { describe, expect, it } from 'vitest'
import { makeCategory, makeGroup, makeLine } from '@/test/budget'
import { buildGoalsOverview, formatPermille, goalUsage, leftoverUsage } from './goals'
import { buildBudgetTable } from './rows'

describe('goalUsage', () => {
  it('computes the share of the income in tenths of a percent', () => {
    expect(goalUsage(242500, 500000, 50)).toMatchObject({ permille: 485, status: 'warning' })
    expect(goalUsage(100000, 500000, 50)).toMatchObject({ permille: 200, status: 'ok' })
    expect(goalUsage(250000, 500000, 50)).toMatchObject({ permille: 500, status: 'warning' })
    expect(goalUsage(250001, 500000, 50)).toMatchObject({ permille: 500, status: 'over' })
    expect(goalUsage(300000, 500000, 50)).toMatchObject({ permille: 600, status: 'over' })
  })

  it('warns from 90% of the goal on', () => {
    expect(goalUsage(44999, 100000, 50).status).toBe('ok')
    expect(goalUsage(45000, 100000, 50).status).toBe('warning')
  })

  it('has no share without income: spending is over, nothing is ok', () => {
    expect(goalUsage(100, 0, 50)).toEqual({ spentCents: 100, incomeCents: 0, permille: null, status: 'over' })
    expect(goalUsage(0, 0, 50)).toMatchObject({ permille: null, status: 'ok' })
  })
})

describe('leftoverUsage', () => {
  it('is ok at or above the minimum and warns below it', () => {
    expect(leftoverUsage(100000, 500000, 20)).toMatchObject({ spentCents: 100000, permille: 200, status: 'ok' })
    expect(leftoverUsage(150000, 500000, 20)).toMatchObject({ permille: 300, status: 'ok' })
    expect(leftoverUsage(99999, 500000, 20)).toMatchObject({ permille: 200, status: 'warning' })
    expect(leftoverUsage(0, 500000, 20)).toMatchObject({ permille: 0, status: 'warning' })
  })

  it('is over when the expenses pass the income', () => {
    expect(leftoverUsage(-50000, 500000, 20)).toMatchObject({ permille: -100, status: 'over' })
    expect(leftoverUsage(-1, 500000, 0)).toMatchObject({ status: 'over' })
  })

  it('with a zero minimum, any leftover is ok', () => {
    expect(leftoverUsage(0, 500000, 0).status).toBe('ok')
  })

  it('has no share without income', () => {
    expect(leftoverUsage(0, 0, 20)).toEqual({ spentCents: 0, incomeCents: 0, permille: null, status: 'ok' })
    expect(leftoverUsage(-100, 0, 20)).toMatchObject({ permille: null, status: 'over' })
  })
})

describe('buildGoalsOverview', () => {
  const groups = [
    makeGroup({
      id: 1,
      kind: 'EXPENSE',
      name: 'Despesas Básicas',
      position: 0,
      goalPercent: 50,
      categories: [makeCategory(1, 'Moradia')],
    }),
    makeGroup({
      id: 2,
      kind: 'EXPENSE',
      name: 'Custos de Vida',
      position: 1,
      goalPercent: 30,
      categories: [makeCategory(2, 'Lazer')],
    }),
    // No goal, and an inactive type with a goal: both left out
    makeGroup({ id: 3, kind: 'EXPENSE', name: 'Outros', position: 2, categories: [makeCategory(3, 'Diversos')] }),
    makeGroup({
      id: 4,
      kind: 'EXPENSE',
      name: 'Antigo',
      position: 3,
      active: false,
      goalPercent: 10,
      categories: [makeCategory(4, 'Velho')],
    }),
    makeGroup({ id: 5, kind: 'INCOME', name: 'Salário', position: 0, categories: [makeCategory(5, 'Salário')] }),
  ]
  const values: Record<string, number> = {
    '1:2026-10': 300000,
    '1:2026-11': 200000,
    '2:2026-10': 50000,
    '5:2026-10': 500000,
    '5:2026-11': 500000,
  }
  // One launch row per category, with the category's id
  const lines = [1, 2, 4, 5].map((id) => makeLine(id, id, []))
  const table = buildBudgetTable(
    groups,
    lines,
    ['2026-10', '2026-11'],
    { line: (id, m) => values[`${id}:${m}`] ?? 0, groupShare: () => 0 },
    0,
  )
  const overview = buildGoalsOverview(table)

  it('lists the active expense types with a goal, for the month and the period', () => {
    expect(overview.goals.map((g) => g.name)).toEqual(['Despesas Básicas', 'Custos de Vida'])
    const [basics, living] = overview.goals
    expect(basics.month).toMatchObject({ spentCents: 300000, incomeCents: 500000, permille: 600, status: 'over' })
    expect(basics.period).toMatchObject({ spentCents: 500000, incomeCents: 1000000, permille: 500, status: 'warning' })
    expect(living.month).toMatchObject({ permille: 100, status: 'ok' })
  })

  it('adds the goals up against what those types spent', () => {
    expect(overview.totalGoalPercent).toBe(80)
    expect(overview.month).toMatchObject({ spentCents: 350000, permille: 700, status: 'ok' })
    expect(overview.period).toMatchObject({ spentCents: 550000, permille: 550, status: 'ok' })
  })

  it('compares what is left after every expense with the share no goal takes', () => {
    // 5.000 − 3.500 in October; 10.000 − 5.500 in the period (the inactive type had nothing)
    expect(overview.leftover.targetPercent).toBe(20)
    expect(overview.leftover.month).toMatchObject({ spentCents: 150000, permille: 300, status: 'ok' })
    expect(overview.leftover.period).toMatchObject({ spentCents: 450000, permille: 450, status: 'ok' })
  })

  it('keeps nothing as the minimum when the goals take the whole income', () => {
    const full = buildGoalsOverview(
      buildBudgetTable(
        groups.map((g) => (g.id === 2 ? { ...g, goalPercent: 60 } : g)),
        lines,
        ['2026-10', '2026-11'],
        { line: (id, m) => values[`${id}:${m}`] ?? 0, groupShare: () => 0 },
        0,
      ),
    )
    expect(full.totalGoalPercent).toBe(110)
    expect(full.leftover.targetPercent).toBe(0)
    expect(full.leftover.month.status).toBe('ok')
  })
})

it('formatPermille shows one decimal in pt-BR', () => {
  expect(formatPermille(485)).toBe('48,5%')
  expect(formatPermille(500)).toBe('50%')
  expect(formatPermille(1234)).toBe('123,4%')
})
