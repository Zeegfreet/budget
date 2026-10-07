import { api } from '@/lib/api/client'
import type {
  BudgetSummary,
  Category,
  CategoryGroup,
  CategoryInput,
  CategoryPatch,
  GroupInput,
  GroupPatch,
  MonthlyEntry,
  Month,
} from './types'

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

export async function createGroup(input: GroupInput): Promise<CategoryGroup> {
  const { data } = await api.post<CategoryGroup>('/budget/groups', input)
  return data
}

export async function updateGroup(id: number, patch: GroupPatch): Promise<CategoryGroup> {
  const { data } = await api.patch<CategoryGroup>(`/budget/groups/${id}`, patch)
  return data
}

/** Also deletes its categories and their values */
export async function deleteGroup(id: number): Promise<void> {
  await api.delete(`/budget/groups/${id}`)
}

export async function createCategory(groupId: number, input: CategoryInput): Promise<Category> {
  const { data } = await api.post<Category>(`/budget/groups/${groupId}/categories`, input)
  return data
}

export async function updateCategory(id: number, patch: CategoryPatch): Promise<Category> {
  const { data } = await api.patch<Category>(`/budget/categories/${id}`, patch)
  return data
}

/** Also deletes its values */
export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/budget/categories/${id}`)
}
