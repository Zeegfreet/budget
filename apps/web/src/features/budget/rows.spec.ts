import { describe, expect, it } from 'vitest'
import { makeCategory, makeGroup, makeLine } from '@/test/budget'
import { buildBudgetTable, lineTarget } from './rows'
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
      makeCategory(2, 'Moradia', 0),
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

// Line values by anchor id; Moradia has two rows (rent and condo fee)
const values: Record<string, number> = {
  '1:2026-10': 500000,
  '1:2026-11': 500000,
  '2:2026-10': 150000,
  '2:2026-11': 150000,
  '22:2026-10': 30000,
  '22:2026-11': 30000,
  '3:2026-10': 70000,
  '4:2026-11': 400000,
}
const lines = [
  makeLine(1, 1, [['2026-10', 1]], { description: 'Salário' }),
  makeLine(2, 2, [['2026-10', 1]], { description: 'Aluguel', dueDay: 10 }),
  makeLine(22, 2, [['2026-10', 1]], { paymentMethod: { id: 7, name: 'Cartão', dueDay: 5 }, dueDay: 20 }),
  makeLine(3, 3, [['2026-10', 1]]),
  makeLine(4, 4, [['2026-11', 1]]),
]
// Ana's share of a group expense linked to Moradia, in November
const shares: Record<string, number> = { '2:2026-11': 1000 }

describe('buildBudgetTable', () => {
  const table = buildBudgetTable(
    groups,
    lines,
    ['2026-10', '2026-11'],
    {
      line: (id, month) => values[`${id}:${month}`] ?? 0,
      groupShare: (id, month) => shares[`${id}:${month}`] ?? 0,
    },
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
      active: false,
      editable: false,
      values: [70000, 0],
      total: 70000,
      lines: [{ line: lines[3], label: 'Sem descrição', dueDay: null, values: [70000, 0], total: 70000 }],
      shares: null,
    })
    expect(expenses.groups[0].totals).toEqual([250000, 181000])
    expect(expenses.groups[0].total).toBe(431000)
    expect(expenses.totals).toEqual([250000, 581000])
    expect(expenses.total).toBe(831000)
    expect(incomes.totals).toEqual([500000, 500000])
  })

  it('sums the launch rows and the group shares into the category', () => {
    const [housing] = table.sections[0].groups[0].categories
    expect(housing.lines.map((l) => [l.label, l.dueDay, l.values])).toEqual([
      ['Aluguel', 10, [150000, 150000]],
      // The payment method's due day wins
      ['Sem descrição', 5, [30000, 30000]],
    ])
    expect(housing.shares).toEqual([0, 1000])
    expect(housing.values).toEqual([180000, 181000])
  })

  it('carries the type goal and which rows take values', () => {
    const [basics, living] = table.sections[0].groups
    expect(basics.goalPercent).toBe(50)
    expect(basics.categories[0]).toMatchObject({ active: true, editable: true })
    // An active category in an inactive type can't take values
    expect(living.active).toBe(false)
    expect(living.categories[0]).toMatchObject({ active: true, editable: false })
  })

  it('computes the month balance and the accumulated balance from the opening', () => {
    expect(table.balances).toEqual([250000, -81000])
    expect(table.accumulated).toEqual([260000, 179000])
  })

  it('totals the window: income, expenses, balance and closing balance', () => {
    expect(table.incomeTotal).toBe(1000000)
    expect(table.expenseTotal).toBe(831000)
    expect(table.balanceTotal).toBe(169000)
    expect(table.accumulatedTotal).toBe(179000)
  })
})

describe('lineTarget', () => {
  it('starts from the first pending month, or else the first one', () => {
    const line = makeLine(5, 1, [
      ['2026-10', 100],
      ['2026-11', 100],
    ])
    expect(lineTarget(line).month).toBe('2026-10')
    const realized = { ...line, cells: [{ ...line.cells[0], realizedCents: 100 }, line.cells[1]] }
    expect(lineTarget(realized).month).toBe('2026-11')
    const allRealized = { ...line, cells: line.cells.map((c) => ({ ...c, realizedCents: 100 })) }
    expect(lineTarget(allRealized).month).toBe('2026-10')
  })
})
