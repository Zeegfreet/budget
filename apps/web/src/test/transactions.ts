import { vi } from 'vitest'
import * as transactionsApi from '@/features/transactions/api'
import type { Transaction } from '@/features/transactions/types'

// For specs that `vi.mock('@/features/transactions/api')`: October 2026, matching
// the category tree of `src/test/budget.ts`.

type TransactionCategory = Transaction['category']

const category = (id: number, name: string, group: TransactionCategory['group']): TransactionCategory => ({
  id,
  name,
  active: true,
  group,
})

const basics = { id: 10, name: 'Despesas Básicas', kind: 'EXPENSE', active: true } as const
const livingCosts = { id: 20, name: 'Custos de Vida', kind: 'EXPENSE', active: true } as const
const salaryGroup = { id: 30, name: 'Salário', kind: 'INCOME', active: true } as const

export const categories = {
  housing: category(1, 'Moradia', basics),
  food: category(2, 'Alimentação', basics),
  leisure: category(3, 'Lazer', livingCosts),
  salary: category(4, 'Salário', salaryGroup),
}

/**
 * A pending, single transaction of October 2026, due on its method's day or
 * else on its own `ownDueDay`
 */
export const makeTransaction = (
  id: number,
  extra: Partial<Transaction> & Pick<Transaction, 'category'>,
): Transaction => ({
  id,
  month: '2026-10',
  description: null,
  plannedCents: 10000,
  realizedCents: null,
  series: null,
  paymentMethod: null,
  ownDueDay: null,
  dueDay: extra.paymentMethod?.dueDay ?? extra.ownDueDay ?? null,
  paymentUrl: null,
  ...extra,
})

export const salaryTransaction = makeTransaction(1, { category: categories.salary, plannedCents: 500000, ownDueDay: 5 })
/** First of a 12-month series, due on the 10th */
export const rentTransaction = makeTransaction(2, {
  category: categories.housing,
  description: 'Aluguel',
  plannedCents: 180000,
  ownDueDay: 10,
  series: { index: 1, count: 12, firstMonth: '2026-10', lastMonth: '2027-09' },
})
/** Realized above the planned amount */
export const foodTransaction = makeTransaction(3, {
  category: categories.food,
  plannedCents: 70000,
  realizedCents: 75000,
})

export const octoberTransactions = [salaryTransaction, rentTransaction, foodTransaction]

export function stubTransactionsApi(transactions: Transaction[] = octoberTransactions) {
  vi.mocked(transactionsApi.fetchTransactions).mockResolvedValue(transactions)
  vi.mocked(transactionsApi.createTransaction).mockResolvedValue([transactions[0]])
  vi.mocked(transactionsApi.updateTransaction).mockResolvedValue(transactions[0])
  vi.mocked(transactionsApi.deleteTransaction).mockResolvedValue()
  vi.mocked(transactionsApi.realizeTransaction).mockResolvedValue(transactions[0])
  vi.mocked(transactionsApi.unrealizeTransaction).mockResolvedValue(transactions[0])
  vi.mocked(transactionsApi.setTransactionSeriesEnd).mockResolvedValue([transactions[0]])
}
