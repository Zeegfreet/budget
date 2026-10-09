import { api } from '@/lib/api/client'
import type { Month } from '@/features/budget/types'
import type { RecurrenceScope, SeriesChange, Transaction, TransactionInput, TransactionPatch } from './types'

export async function fetchTransactions(month: Month): Promise<Transaction[]> {
  const { data } = await api.get<Transaction[]>('/budget/transactions', { params: { month } })
  return data
}

/** Resolves with every occurrence created */
export async function createTransaction(input: TransactionInput): Promise<Transaction[]> {
  const { data } = await api.post<Transaction[]>('/budget/transactions', input)
  return data
}

export async function updateTransaction(
  id: number,
  patch: TransactionPatch,
  scope: RecurrenceScope = 'ONE',
): Promise<Transaction> {
  const { data } = await api.patch<Transaction>(`/budget/transactions/${id}`, { ...patch, scope })
  return data
}

export async function deleteTransaction(id: number, scope: RecurrenceScope = 'ONE'): Promise<void> {
  await api.delete(`/budget/transactions/${id}`, { params: { scope } })
}

/**
 * Moves the series' last month (extends it with copies of the last occurrence,
 * or drops the pending ones after it); `null` makes it open-ended. A sent
 * `adjustment` replaces the scheduled one (`null` removes it).
 */
export async function setTransactionSeriesEnd(id: number, change: SeriesChange): Promise<Transaction[]> {
  const { data } = await api.put<Transaction[]>(`/budget/transactions/${id}/series`, change)
  return data
}

export async function realizeTransaction(id: number, amountCents: number): Promise<Transaction> {
  const { data } = await api.put<Transaction>(`/budget/transactions/${id}/realization`, { amountCents })
  return data
}

export async function unrealizeTransaction(id: number): Promise<Transaction> {
  const { data } = await api.delete<Transaction>(`/budget/transactions/${id}/realization`)
  return data
}
