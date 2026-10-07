import { describe, expect, it } from 'vitest'
import { buildBudgetTable } from './rows'
import type { CategoryGroup } from './types'

const groups: CategoryGroup[] = [
  { id: 10, kind: 'INCOME', name: 'Salário', position: 0, categories: [{ id: 1, name: 'Salário', position: 0 }] },
  {
    id: 20,
    kind: 'EXPENSE',
    name: 'Despesas Básicas',
    position: 0,
    categories: [
      { id: 2, name: 'Moradia', position: 0 },
      { id: 3, name: 'Mercado', position: 1 },
    ],
  },
  { id: 30, kind: 'EXPENSE', name: 'Custos de Vida', position: 1, categories: [{ id: 4, name: 'Lazer', position: 0 }] },
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

  it('sums categories into types and types into sections', () => {
    const [expenses, incomes] = table.sections
    expect(expenses.groups[0].categories[1]).toEqual({ id: 3, name: 'Mercado', values: [70000, 0] })
    expect(expenses.groups[0].totals).toEqual([250000, 180000])
    expect(expenses.totals).toEqual([250000, 580000])
    expect(incomes.totals).toEqual([500000, 500000])
  })

  it('computes the month balance and the accumulated balance from the opening', () => {
    expect(table.balances).toEqual([250000, -80000])
    expect(table.accumulated).toEqual([260000, 180000])
  })
})
