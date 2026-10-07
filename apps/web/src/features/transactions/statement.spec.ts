import { describe, expect, it } from 'vitest'
import {
  categories,
  foodTransaction,
  makeTransaction,
  octoberTransactions,
  rentTransaction,
  salaryTransaction,
} from '@/test/transactions'
import { buildStatement, effectiveCents, hasFollowing, transactionTitle } from './statement'

describe('buildStatement', () => {
  it('splits by kind, keeping the order, and totals planned, realized and pending', () => {
    const statement = buildStatement(octoberTransactions)

    expect(statement.sections.map((s) => [s.label, s.transactions.map((t) => t.id)])).toEqual([
      ['Receitas', [1]],
      ['Despesas', [2, 3]],
    ])
    expect(statement.sections[1]).toMatchObject({
      plannedCents: 250000,
      realizedCents: 75000,
      pendingCents: 180000,
      effectiveCents: 255000,
    })
    expect(statement.sections[0]).toMatchObject({ realizedCents: 0, effectiveCents: 500000 })
    expect(statement.balanceCents).toBe(245000)
  })

  it('splits each section by type, in the tree’s order, with effective subtotals', () => {
    // Due on day 1, so the server lists it before the basics
    const cinema = makeTransaction(4, { category: categories.leisure, plannedCents: 30000, realizedCents: 25000 })
    const statement = buildStatement([cinema, ...octoberTransactions], [10, 20, 30])

    const groups = (i: number) =>
      statement.sections[i].groups.map((g) => [g.name, g.transactions.map((t) => t.id), g.effectiveCents])
    expect(groups(0)).toEqual([['Salário', [1], 500000]])
    expect(groups(1)).toEqual([
      ['Despesas Básicas', [2, 3], 255000],
      ['Custos de Vida', [4], 25000],
    ])
    // The flat list keeps the server order
    expect(statement.sections[1].transactions.map((t) => t.id)).toEqual([4, 2, 3])
  })

  it('puts types missing from the order last, as they appear', () => {
    const cinema = makeTransaction(4, { category: categories.leisure })
    const statement = buildStatement([cinema, rentTransaction, foodTransaction], [10])
    expect(statement.sections[1].groups.map((g) => g.id)).toEqual([10, 20])

    const unordered = buildStatement([cinema, rentTransaction])
    expect(unordered.sections[1].groups.map((g) => g.id)).toEqual([20, 10])
  })

  it('counts a realized zero as zero, not as the planned amount', () => {
    const statement = buildStatement([{ ...salaryTransaction, realizedCents: 0 }])
    expect(statement.sections[0].effectiveCents).toBe(0)
    expect(statement.balanceCents).toBe(0)
  })

  it('is all zeros for an empty month', () => {
    const statement = buildStatement([])
    expect(
      statement.sections.every((s) => s.transactions.length === 0 && s.groups.length === 0 && s.effectiveCents === 0),
    ).toBe(true)
    expect(statement.balanceCents).toBe(0)
  })
})

describe('transaction helpers', () => {
  it('uses the realized amount when there is one', () => {
    expect(effectiveCents(foodTransaction)).toBe(75000)
    expect(effectiveCents(rentTransaction)).toBe(180000)
  })

  it('tells whether later occurrences exist', () => {
    expect(hasFollowing(rentTransaction)).toBe(true)
    expect(hasFollowing({ ...rentTransaction, series: { index: 12, count: 12 } })).toBe(false)
    expect(hasFollowing(salaryTransaction)).toBe(false)
  })

  it('titles by description, or the category name', () => {
    expect(transactionTitle(rentTransaction)).toBe('Aluguel')
    expect(transactionTitle(salaryTransaction)).toBe('Salário')
  })
})
