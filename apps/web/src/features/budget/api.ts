import { api } from '@/lib/api/client'
import type { BudgetSummary, CategoryGroup, MonthlyEntry, Month } from './types'

export async function fetchCategories(): Promise<CategoryGroup[]> {
  const { data } = await api.get<CategoryGroup[]>('/budget/categories')
  return data
}

export async function fetchEntries(from: Month, to: Month): Promise<MonthlyEntry[]> {
  const { data } = await api.get<MonthlyEntry[]>('/budget/entries', { params: { from, to } })
  return data
}

/** Saves changed cells; `amountCents: 0` clears one. */
export async function saveEntries(entries: MonthlyEntry[]): Promise<void> {
  await api.put('/budget/entries', { entries })
}

export async function fetchSummary(month: Month): Promise<BudgetSummary> {
  const { data } = await api.get<BudgetSummary>('/budget/summary', { params: { month } })
  return data
}

export async function updateInitialBalance(amountCents: number): Promise<void> {
  await api.put('/budget/initial-balance', { amountCents })
}
