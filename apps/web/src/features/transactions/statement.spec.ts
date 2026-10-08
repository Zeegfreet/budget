import { describe, expect, it } from 'vitest'
import {
  categories,
  foodTransaction,
  makeTransaction,
  octoberTransactions,
  rentTransaction,
  salaryTransaction,
} from '@/test/transactions'
import { makeGroupStatement, makeStatementItem } from '@/test/budget'
import {
  buildStatement,
  effectiveCents,
  hasFollowing,
  isItemDone,
  itemCents,
  linkedShares,
  transactionTitle,
  type StatementItem,
} from './statement'

const itemKey = (item: StatementItem) =>
  item.kind === 'transaction' ? `t${item.transaction.id}` : `s${item.share.item.transactionId}`

describe('buildStatement', () => {
  it('adds the linked group shares to their category’s type and to the totals', () => {
    // Paid rent share (1000,00) linked to Moradia; the unlinked income stays out
    const pendingWater = makeStatementItem(11, { description: 'Água', shareCents: 5000 })
    const republica = makeGroupStatement()
    const statement = buildStatement(octoberTransactions, [10, 20, 30], [
      { ...republica, items: [...republica.items, pendingWater] },
    ])

    const [income, expense] = statement.sections
    expect(income).toMatchObject({ shares: [], effectiveCents: 500000 })
    expect(expense.shares.map((s) => s.item.transactionId)).toEqual([10, 11])
    expect(expense).toMatchObject({
      plannedCents: 355000,
      realizedCents: 175000,
      pendingCents: 185000,
      effectiveCents: 360000,
    })
    const [basics] = expense.groups
    expect(basics).toMatchObject({ name: 'Despesas Básicas', effectiveCents: 360000 })
    expect(basics.items.map(itemKey)).toEqual(['t2', 't3', 's10', 's11'])
    expect(expense.shares.map((s) => [s.group.name, s.item.description])).toEqual([
      ['República', 'Aluguel'],
      ['República', 'Água'],
    ])
    expect(statement.balanceCents).toBe(140000)
  })

  it('keeps only the linked shares', () => {
    expect(linkedShares([makeGroupStatement()]).map((s) => s.item.transactionId)).toEqual([10])
    expect(linkedShares([])).toEqual([])
  })

  it('carries the payment method of the expense shares only', () => {
    const card = { id: 5, name: 'Nubank', dueDay: 15 }
    const statement = makeGroupStatement({
      link: { expenseCategory: { id: 1, name: 'Moradia' }, incomeCategory: { id: 4, name: 'Salário' }, paymentMethod: card },
      items: [
        makeStatementItem(10),
        makeStatementItem(12, { kind: 'INCOME', category: categories.salary }),
      ],
    })
    expect(linkedShares([statement]).map((s) => [s.item.transactionId, s.paymentMethod])).toEqual([
      [10, { id: 5, name: 'Nubank' }],
      [12, null],
    ])
  })

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
      statement.sections[i].groups.map((g) => [g.name, g.items.map(itemKey), g.effectiveCents])
    expect(groups(0)).toEqual([['Salário', ['t1'], 500000]])
    expect(groups(1)).toEqual([
      ['Despesas Básicas', ['t2', 't3'], 255000],
      ['Custos de Vida', ['t4'], 25000],
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

  it('tells whether an item is done and what it counts', () => {
    const [paidShare] = linkedShares([makeGroupStatement()])
    const unsettled = { ...paidShare, item: { ...paidShare.item, paid: false, groupPaid: true } }
    expect(isItemDone({ kind: 'transaction', transaction: foodTransaction })).toBe(true)
    expect(isItemDone({ kind: 'transaction', transaction: rentTransaction })).toBe(false)
    expect(isItemDone({ kind: 'share', share: paidShare })).toBe(true)
    // Someone else paid, but the user still owes their share
    expect(isItemDone({ kind: 'share', share: unsettled })).toBe(false)
    expect(itemCents({ kind: 'transaction', transaction: foodTransaction })).toBe(75000)
    expect(itemCents({ kind: 'share', share: paidShare })).toBe(100000)
  })

  it('tells whether later occurrences exist', () => {
    expect(hasFollowing(rentTransaction)).toBe(true)
    expect(hasFollowing({ ...rentTransaction, series: { ...rentTransaction.series!, index: 12 } })).toBe(false)
    expect(hasFollowing(salaryTransaction)).toBe(false)
  })

  it('titles by description, or the category name', () => {
    expect(transactionTitle(rentTransaction)).toBe('Aluguel')
    expect(transactionTitle(salaryTransaction)).toBe('Salário')
  })
})
