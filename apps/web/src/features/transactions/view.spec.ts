import { describe, expect, it } from 'vitest'
import { makeGroupStatement, makeStatementItem } from '@/test/budget'
import { categories, makeTransaction, octoberTransactions } from '@/test/transactions'
import { buildStatement, type StatementItem } from './statement'
import { compareItems, DEFAULT_SORT, describeSort, normalizeSort, viewStatement, type SortLevel } from './view'

const card = { id: 5, name: 'Nubank', type: 'CREDIT_CARD', dueDay: 20, active: true } as const
const account = { id: 6, name: 'Conta Itaú', type: 'ACCOUNT', dueDay: null, active: true } as const

const tx = (...args: Parameters<typeof makeTransaction>): StatementItem => ({
  kind: 'transaction',
  transaction: makeTransaction(...args),
})
const key = (item: StatementItem) =>
  item.kind === 'transaction' ? `t${item.transaction.id}` : `s${item.share.item.transactionId}`

/** Sorts `items` by `levels` (the tree has Moradia, Alimentação, Lazer, Salário) */
const sorted = (items: StatementItem[], levels: SortLevel[]) =>
  [...items].sort(compareItems(levels, [1, 2, 3, 4])).map(key)

// Moradia due on the 10th (planned 500), Alimentação on the card (20th, realized 300),
// Lazer with no due day (pending 800), Moradia on the account (5th, realized 800)
const items = [
  tx(1, { category: categories.housing, ownDueDay: 10, plannedCents: 50000 }),
  tx(2, { category: categories.food, paymentMethod: card, plannedCents: 20000, realizedCents: 30000 }),
  tx(3, { category: categories.leisure, plannedCents: 80000 }),
  tx(4, { category: categories.housing, paymentMethod: account, ownDueDay: 5, plannedCents: 80000, realizedCents: 80000 }),
]

describe('compareItems', () => {
  it('orders by effective due day, the undated last in both directions', () => {
    expect(sorted(items, [{ key: 'dueDay', direction: 'asc' }])).toEqual(['t4', 't1', 't2', 't3'])
    expect(sorted(items, [{ key: 'dueDay', direction: 'desc' }])).toEqual(['t2', 't1', 't4', 't3'])
  })

  it('orders by payment method name, the ones without a method last', () => {
    expect(sorted(items, [{ key: 'paymentMethod', direction: 'asc' }])).toEqual(['t4', 't2', 't1', 't3'])
    expect(sorted(items, [{ key: 'paymentMethod', direction: 'desc' }])).toEqual(['t2', 't4', 't1', 't3'])
  })

  it('orders by category in the tree’s order', () => {
    expect(sorted(items, [{ key: 'category', direction: 'asc' }])).toEqual(['t1', 't4', 't2', 't3'])
    expect(sorted(items, [{ key: 'category', direction: 'desc' }])).toEqual(['t3', 't2', 't1', 't4'])
  })

  it('orders by the effective amount', () => {
    expect(sorted(items, [{ key: 'amount', direction: 'asc' }])).toEqual(['t2', 't1', 't3', 't4'])
    expect(sorted(items, [{ key: 'amount', direction: 'desc' }])).toEqual(['t3', 't4', 't1', 't2'])
  })

  it('orders by status, pending first when ascending', () => {
    expect(sorted(items, [{ key: 'status', direction: 'asc' }])).toEqual(['t1', 't3', 't2', 't4'])
    expect(sorted(items, [{ key: 'status', direction: 'desc' }])).toEqual(['t2', 't4', 't1', 't3'])
  })

  it('breaks ties with the next levels, then keeps the original order', () => {
    expect(
      sorted(items, [
        { key: 'status', direction: 'asc' },
        { key: 'amount', direction: 'desc' },
      ]),
    ).toEqual(['t3', 't1', 't4', 't2'])
    expect(sorted(items, [{ key: 'category', direction: 'asc' }, { key: 'dueDay', direction: 'asc' }])).toEqual([
      't4',
      't1',
      't2',
      't3',
    ])
  })

  it('sorts group shares with the transactions, by their due day, method and settlement', () => {
    const [share] = buildStatement(
      [],
      [],
      [
        makeGroupStatement({
          link: {
            expenseCategory: { id: 1, name: 'Moradia' },
            incomeCategory: null,
            paymentMethod: { id: 6, name: 'Conta Itaú', dueDay: 7 },
          },
          items: [makeStatementItem(10, { dueDay: 7, shareCents: 60000 })],
        }),
      ],
    ).sections[1].groups[0].items
    const all = [...items, share]
    expect(sorted(all, DEFAULT_SORT)).toEqual(['t4', 's10', 't1', 't2', 't3'])
    expect(sorted(all, [{ key: 'paymentMethod', direction: 'asc' }, { key: 'amount', direction: 'asc' }])).toEqual([
      's10',
      't4',
      't2',
      't1',
      't3',
    ])
  })
})

describe('normalizeSort', () => {
  it('keeps a valid ordering', () => {
    const levels: SortLevel[] = [
      { key: 'status', direction: 'asc' },
      { key: 'amount', direction: 'desc' },
    ]
    expect(normalizeSort(levels)).toEqual(levels)
  })

  it('falls back to the default for anything else', () => {
    expect(normalizeSort(undefined)).toBe(DEFAULT_SORT)
    expect(normalizeSort([])).toBe(DEFAULT_SORT)
    expect(normalizeSort('dueDay')).toBe(DEFAULT_SORT)
    expect(normalizeSort([{ key: 'name', direction: 'asc' }])).toBe(DEFAULT_SORT)
    expect(normalizeSort([{ key: 'amount', direction: 'up' }])).toBe(DEFAULT_SORT)
    expect(
      normalizeSort([
        { key: 'amount', direction: 'asc' },
        { key: 'amount', direction: 'desc' },
      ]),
    ).toBe(DEFAULT_SORT)
  })

  it('drops unknown fields', () => {
    expect(normalizeSort([{ key: 'amount', direction: 'desc', extra: 1 }])).toEqual([
      { key: 'amount', direction: 'desc' },
    ])
  })
})

describe('describeSort', () => {
  it('lists the criteria with arrows', () => {
    expect(describeSort([{ key: 'dueDay', direction: 'asc' }, { key: 'amount', direction: 'desc' }])).toBe(
      'Vencimento ↑, Valor ↓',
    )
  })
})

describe('viewStatement', () => {
  // Pending rent (Moradia) and its unsettled share, realized food, pending cinema (Lazer)
  const cinema = makeTransaction(4, { category: categories.leisure, plannedCents: 30000 })
  const republica = makeGroupStatement({
    items: [makeStatementItem(10, { paid: false, groupPaid: true, paidByName: 'Bruno' })],
  })
  const statement = buildStatement([...octoberTransactions, cinema], [10, 20, 30], [republica])
  const options = { pendingOnly: false, sort: DEFAULT_SORT, categoryOrder: [1, 2, 3, 4] }
  const groups = (view: typeof statement, i = 1) =>
    view.sections[i].groups.map((g) => [g.name, g.items.map(key), g.effectiveCents])

  it('keeps everything with the default ordering', () => {
    expect(groups(viewStatement(statement, options))).toEqual([
      ['Despesas Básicas', ['t2', 't3', 's10'], 355000],
      ['Custos de Vida', ['t4'], 30000],
    ])
  })

  it('shows only what is pending, with subtotals over the shown items', () => {
    const view = viewStatement(statement, { ...options, pendingOnly: true })
    expect(groups(view)).toEqual([
      ['Despesas Básicas', ['t2', 's10'], 280000],
      ['Custos de Vida', ['t4'], 30000],
    ])
    // The sections keep the month's totals
    expect(view.sections[1]).toMatchObject({ effectiveCents: 385000, pendingCents: 310000 })
  })

  it('drops types with nothing pending', () => {
    const paidSalary = buildStatement([{ ...octoberTransactions[0], realizedCents: 500000 }], [30])
    expect(viewStatement(paidSalary, { ...options, pendingOnly: true }).sections[0].groups).toEqual([])
  })

  it('orders the items inside each type', () => {
    const view = viewStatement(statement, { ...options, sort: [{ key: 'amount', direction: 'asc' }] })
    expect(groups(view)[0][1]).toEqual(['t3', 's10', 't2'])
    // The built statement is untouched
    expect(statement.sections[1].groups[0].items.map(key)).toEqual(['t2', 't3', 's10'])
  })
})
