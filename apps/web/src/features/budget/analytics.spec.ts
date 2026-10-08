import { describe, expect, it } from 'vitest'
import { budgetGroups, makeCategory, makeGroup } from '@/test/budget'
import { buildExpenseBreakdown, buildMonthlyTrend, shareOf } from './analytics'
import type { MonthlyEntry } from './types'

const entry = (categoryId: number, month: string, amountCents: number, groupCents = 0): MonthlyEntry => ({
  categoryId,
  month,
  amountCents,
  count: 1,
  groupCents,
})

const months = ['2026-10', '2026-11', '2026-12']

describe('buildMonthlyTrend', () => {
  it('sums income and expenses per month, group shares included', () => {
    const trend = buildMonthlyTrend(
      budgetGroups,
      [
        entry(4, '2026-10', 500000),
        entry(5, '2026-10', 20000),
        entry(1, '2026-10', 180000, 30000),
        entry(2, '2026-10', 70000),
        entry(1, '2026-11', 180000),
      ],
      months,
      0,
    )
    expect(trend[0]).toEqual({
      month: '2026-10',
      incomeCents: 520000,
      expenseCents: 280000,
      balanceCents: 240000,
      accumulatedCents: 240000,
    })
    expect(trend[1]).toMatchObject({ incomeCents: 0, expenseCents: 180000, balanceCents: -180000 })
  })

  it('accumulates from the opening balance, with zero for empty months', () => {
    const trend = buildMonthlyTrend(
      budgetGroups,
      [entry(4, '2026-10', 500000), entry(1, '2026-11', 180000)],
      months,
      100000,
    )
    expect(trend.map((p) => p.accumulatedCents)).toEqual([600000, 420000, 420000])
    expect(trend[2]).toMatchObject({ incomeCents: 0, expenseCents: 0, balanceCents: 0 })
  })

  it('counts inactive categories and ignores unknown ones and months outside the period', () => {
    const groups = [
      makeGroup({
        id: 10,
        kind: 'EXPENSE',
        name: 'Despesas Básicas',
        position: 0,
        active: false,
        categories: [makeCategory(1, 'Moradia', 0, { active: false })],
      }),
    ]
    const trend = buildMonthlyTrend(
      groups,
      [entry(1, '2026-10', 1000), entry(99, '2026-10', 5000), entry(1, '2027-01', 7000)],
      months,
      0,
    )
    expect(trend[0].expenseCents).toBe(1000)
    expect(trend.map((p) => p.expenseCents)).toEqual([1000, 0, 0])
  })
})

describe('buildExpenseBreakdown', () => {
  it('lists expense categories by the period total, with the first month apart', () => {
    const breakdown = buildExpenseBreakdown(
      budgetGroups,
      [
        entry(4, '2026-10', 500000),
        entry(1, '2026-10', 150000, 30000),
        entry(1, '2026-11', 180000),
        entry(2, '2026-10', 70000),
        entry(3, '2026-12', 300000),
      ],
      months,
    )
    expect(breakdown.rows).toEqual([
      {
        categoryId: 1,
        name: 'Moradia',
        groupName: 'Despesas Básicas',
        monthCents: 180000,
        periodCents: 360000,
        shareBasisPoints: 4931,
      },
      {
        categoryId: 3,
        name: 'Lazer',
        groupName: 'Custos de Vida',
        monthCents: 0,
        periodCents: 300000,
        shareBasisPoints: 4110,
      },
      {
        categoryId: 2,
        name: 'Alimentação',
        groupName: 'Despesas Básicas',
        monthCents: 70000,
        periodCents: 70000,
        shareBasisPoints: 959,
      },
    ])
    expect(breakdown.monthTotalCents).toBe(250000)
    expect(breakdown.periodTotalCents).toBe(730000)
    expect(breakdown.rows.reduce((sum, r) => sum + r.shareBasisPoints, 0)).toBe(10000)
  })

  it('leaves out incomes, empty categories and months outside the period', () => {
    const breakdown = buildExpenseBreakdown(
      budgetGroups,
      [entry(4, '2026-10', 500000), entry(1, '2026-10', 0), entry(2, '2027-01', 9000)],
      months,
    )
    expect(breakdown).toEqual({ rows: [], monthTotalCents: 0, periodTotalCents: 0 })
  })

  it('keeps the tree order on ties', () => {
    const breakdown = buildExpenseBreakdown(
      budgetGroups,
      [entry(3, '2026-10', 1000), entry(2, '2026-10', 1000), entry(1, '2026-10', 1000)],
      months,
    )
    expect(breakdown.rows.map((r) => r.name)).toEqual(['Moradia', 'Alimentação', 'Lazer'])
    expect(breakdown.rows.map((r) => r.shareBasisPoints)).toEqual([3334, 3333, 3333])
  })
})

describe('shareOf', () => {
  it('splits 100% by largest remainder', () => {
    expect(shareOf([1, 1, 1], 3)).toEqual([3334, 3333, 3333])
    expect(shareOf([2, 1, 1], 4)).toEqual([5000, 2500, 2500])
    expect(shareOf([1, 2], 3)).toEqual([3333, 6667])
  })

  it('is all zero without a total', () => {
    expect(shareOf([0, 0], 0)).toEqual([0, 0])
  })
})
