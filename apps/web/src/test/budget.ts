import { vi } from 'vitest'
import * as budgetApi from '@/features/budget/api'
import type { BudgetSummary, CategoryGroup, MonthlyEntry } from '@/features/budget/types'

// For specs that `vi.mock('@/features/budget/api')`: data matching a clock set to October 2026.

export const budgetGroups: CategoryGroup[] = [
  {
    id: 10,
    kind: 'EXPENSE',
    name: 'Despesas Básicas',
    position: 0,
    categories: [
      { id: 1, name: 'Moradia', position: 0 },
      { id: 2, name: 'Alimentação', position: 1 },
    ],
  },
  { id: 20, kind: 'EXPENSE', name: 'Custos de Vida', position: 1, categories: [{ id: 3, name: 'Lazer', position: 0 }] },
  { id: 30, kind: 'INCOME', name: 'Salário', position: 2, categories: [{ id: 4, name: 'Salário', position: 0 }] },
  { id: 40, kind: 'INCOME', name: 'Renda Extra', position: 3, categories: [{ id: 5, name: 'Renda extra', position: 0 }] },
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
}
