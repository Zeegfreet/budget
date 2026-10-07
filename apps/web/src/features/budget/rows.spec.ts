import { describe, expect, it } from 'vitest'
import { makeCategory, makeGroup } from '@/test/budget'
import { buildBudgetTable } from './rows'
import type { CategoryGroup } from './types'

const groups: CategoryGroup[] = [
  makeGroup({ id: 10, kind: 'INCOME', name: 'Salário', position: 0, categories: [makeCategory(1, 'Salário')] }),
  makeGroup({
    id: 20,
    kind: 'EXPENSE',
    name: 'Despesas Básicas',
    position: 0,
    goalPercent: 50,
    categories: [
      makeCategory(2, 'Moradia', 0, { description: 'Apto', dueDay: 10 }),
      makeCategory(3, 'Mercado', 1, { active: false }),
    ],
  }),
  makeGroup({
    id: 30,
    kind: 'EXPENSE',
    name: 'Custos de Vida',
    position: 1,
    active: false,
    categories: [makeCategory(4, 'Lazer')],
  }),
]

const values: Record<string, number> = {
  '1:2026-10': 500000,
  '1:2026-11': 500000,
  '2:2026-10': 180000,
  '2:2026-11': 180000,
  '3:2026-10': 70000,
  '4:2026-11': 400000,
}

describe('buildBudgetTable', () => {
  const table = buildBudgetTable(
    groups,
    ['2026-10', '2026-11'],
    (id, month) => values[`${id}:${month}`] ?? 0,
    10000,
  )

  it('lists Despesas before Receitas, keeping the type order', () => {
    expect(table.sections.map((s) => s.label)).toEqual(['Despesas', 'Receitas'])
    expect(table.sections[0].groups.map((g) => g.name)).toEqual(['Despesas Básicas', 'Custos de Vida'])
  })

  it('sums categories into types and sections, including inactive ones', () => {
    const [expenses, incomes] = table.sections
    expect(expenses.groups[0].categories[1]).toEqual({
      id: 3,
      name: 'Mercado',
      description: null,
      dueDay: null,
      active: false,
      editable: false,
      values: [70000, 0],
      total: 70000,
    })
    expect(expenses.groups[0].totals).toEqual([250000, 180000])
    expect(expenses.groups[0].total).toBe(430000)
    expect(expenses.totals).toEqual([250000, 580000])
    expect(expenses.total).toBe(830000)
    expect(incomes.totals).toEqual([500000, 500000])
  })

  it('carries the category details and the type goal', () => {
    const [basics, living] = table.sections[0].groups
    expect(basics.goalPercent).toBe(50)
    expect(basics.categories[0]).toMatchObject({ description: 'Apto', dueDay: 10, active: true, editable: true })
    // An active category in an inactive type can't take values
    expect(living.active).toBe(false)
    expect(living.categories[0]).toMatchObject({ active: true, editable: false })
  })

  it('computes the month balance and the accumulated balance from the opening', () => {
    expect(table.balances).toEqual([250000, -80000])
    expect(table.accumulated).toEqual([260000, 180000])
  })

  it('totals the window: income, expenses, balance and closing balance', () => {
    expect(table.incomeTotal).toBe(1000000)
    expect(table.expenseTotal).toBe(830000)
    expect(table.balanceTotal).toBe(170000)
    expect(table.accumulatedTotal).toBe(180000)
  })
})
