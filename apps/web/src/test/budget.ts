import { vi } from 'vitest'
import * as budgetApi from '@/features/budget/api'
import type { BudgetSummary, Category, CategoryGroup, MonthlyEntry } from '@/features/budget/types'

// For specs that `vi.mock('@/features/budget/api')`: data matching a clock set to October 2026.

/** An active category without description or due day */
export const makeCategory = (id: number, name: string, position = 0, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  position,
  active: true,
  description: null,
  dueDay: null,
  ...extra,
})

/** An active type without goal */
export const makeGroup = (
  group: Pick<CategoryGroup, 'id' | 'kind' | 'name' | 'position' | 'categories'> & Partial<CategoryGroup>,
): CategoryGroup => ({ active: true, goalPercent: null, ...group })

export const budgetGroups: CategoryGroup[] = [
  makeGroup({
    id: 10,
    kind: 'EXPENSE',
    name: 'Despesas Básicas',
    position: 0,
    categories: [makeCategory(1, 'Moradia', 0), makeCategory(2, 'Alimentação', 1)],
  }),
  makeGroup({ id: 20, kind: 'EXPENSE', name: 'Custos de Vida', position: 1, categories: [makeCategory(3, 'Lazer')] }),
  makeGroup({ id: 30, kind: 'INCOME', name: 'Salário', position: 2, categories: [makeCategory(4, 'Salário')] }),
  makeGroup({ id: 40, kind: 'INCOME', name: 'Renda Extra', position: 3, categories: [makeCategory(5, 'Renda extra')] }),
]

export const budgetEntries: MonthlyEntry[] = [
  { categoryId: 1, month: '2026-10', amountCents: 180000 },
  { categoryId: 1, month: '2026-11', amountCents: 180000 },
  { categoryId: 2, month: '2026-10', amountCents: 70000 },
  { categoryId: 3, month: '2026-12', amountCents: 30000 },
  { categoryId: 4, month: '2026-10', amountCents: 500000 },
]

export const budgetSummary: BudgetSummary = {
  month: '2026-10',
  initialBalanceCents: 100000,
  openingBalanceCents: 250000,
  incomeCents: 500000,
  expenseCents: 250000,
  monthBalanceCents: 250000,
  closingBalanceCents: 500000,
}

export function stubBudgetApi({
  groups = budgetGroups,
  entries = budgetEntries,
  summary = budgetSummary,
}: { groups?: CategoryGroup[]; entries?: MonthlyEntry[]; summary?: BudgetSummary } = {}) {
  vi.mocked(budgetApi.fetchCategories).mockResolvedValue(groups)
  vi.mocked(budgetApi.fetchEntries).mockResolvedValue(entries)
  vi.mocked(budgetApi.fetchSummary).mockResolvedValue(summary)
  vi.mocked(budgetApi.saveEntries).mockResolvedValue()
  vi.mocked(budgetApi.updateInitialBalance).mockResolvedValue()
  // Tree changes resolve with whatever; the page refetches the tree afterwards
  vi.mocked(budgetApi.createGroup).mockResolvedValue(groups[0])
  vi.mocked(budgetApi.updateGroup).mockResolvedValue(groups[0])
  vi.mocked(budgetApi.deleteGroup).mockResolvedValue()
  vi.mocked(budgetApi.createCategory).mockResolvedValue(groups[0].categories[0])
  vi.mocked(budgetApi.updateCategory).mockResolvedValue(groups[0].categories[0])
  vi.mocked(budgetApi.deleteCategory).mockResolvedValue()
}
