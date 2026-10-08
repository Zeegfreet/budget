import { vi } from 'vitest'
import * as budgetApi from '@/features/budget/api'
import type {
  BudgetLine,
  BudgetSummary,
  Category,
  CategoryGroup,
  GroupStatement,
  GroupStatementItem,
  Month,
  MonthlyEntry,
} from '@/features/budget/types'

// For specs that `vi.mock('@/features/budget/api')`: data matching a clock set to October 2026.

/** An active category */
export const makeCategory = (id: number, name: string, position = 0, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  position,
  active: true,
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

/**
 * A launch row of the grid: `cells` maps months to planned amounts; each
 * month's transaction id is `anchorId` plus its position.
 */
export const makeLine = (
  anchorId: number,
  categoryId: number,
  cells: [Month, number][],
  extra: Partial<Omit<BudgetLine, 'anchorId' | 'categoryId' | 'cells'>> = {},
): BudgetLine => ({
  anchorId,
  categoryId,
  description: null,
  dueDay: null,
  paymentMethod: null,
  cells: cells.map(([month, plannedCents], i) => ({
    month,
    transactionId: anchorId + i,
    plannedCents,
    realizedCents: null,
  })),
  ...extra,
})

/** Rent (Moradia, Oct–Nov), groceries (Alimentação), an unnamed leisure launch in December and the salary */
export const budgetLines: BudgetLine[] = [
  makeLine(
    101,
    1,
    [
      ['2026-10', 180000],
      ['2026-11', 180000],
    ],
    { description: 'Aluguel', dueDay: 10 },
  ),
  makeLine(201, 2, [['2026-10', 70000]], { description: 'Mercado' }),
  makeLine(301, 3, [['2026-12', 30000]]),
  makeLine(401, 4, [['2026-10', 500000]], { description: 'Salário', dueDay: 5 }),
]

/** The user's share of a linked group in a category and month */
export interface ShareCell {
  categoryId: number
  month: Month
  amountCents: number
}

/** What `GET /budget/entries` answers for these rows and group shares */
export function entriesOf(lines: BudgetLine[], shares: ShareCell[] = []): MonthlyEntry[] {
  const entries = new Map<string, MonthlyEntry>()
  const entry = (categoryId: number, month: Month) => {
    const key = `${categoryId}:${month}`
    if (!entries.has(key)) entries.set(key, { categoryId, month, amountCents: 0, count: 0, groupCents: 0 })
    return entries.get(key)!
  }
  for (const line of lines) {
    for (const cell of line.cells) {
      const e = entry(line.categoryId, cell.month)
      e.amountCents += cell.plannedCents
      e.count += 1
    }
  }
  for (const share of shares) entry(share.categoryId, share.month).groupCents += share.amountCents
  return [...entries.values()]
}

export const budgetSummary: BudgetSummary = {
  month: '2026-10',
  initialBalanceCents: 100000,
  openingBalanceCents: 250000,
  incomeCents: 500000,
  expenseCents: 250000,
  monthBalanceCents: 250000,
  closingBalanceCents: 500000,
}

const housing = {
  id: 1,
  name: 'Moradia',
  active: true,
  group: { id: 10, name: 'Despesas Básicas', kind: 'EXPENSE', active: true },
} as const

/** Ana's share of a pending group expense, counted in Moradia */
export const makeStatementItem = (
  transactionId: number,
  extra: Partial<GroupStatementItem> = {},
): GroupStatementItem => ({
  transactionId,
  kind: 'EXPENSE',
  description: 'Aluguel',
  month: '2026-10',
  dueDay: null,
  shareCents: 100000,
  totalCents: 200000,
  paid: false,
  groupPaid: false,
  paidByName: null,
  series: null,
  category: housing,
  ...extra,
})

/**
 * "República" (group 7) in October 2026 from Ana's side, linked to Moradia:
 * a rent Bruno paid (her share 1000,00) and a pending, unlinked income.
 */
export const makeGroupStatement = (extra: Partial<GroupStatement> = {}): GroupStatement => ({
  group: { id: 7, name: 'República' },
  active: true,
  memberId: 1,
  link: { expenseCategory: { id: 1, name: 'Moradia' }, incomeCategory: null, paymentMethod: null },
  expenseCents: 200000,
  incomeCents: 4000,
  pendingCents: 4000,
  expenseShareCents: 100000,
  incomeShareCents: 2000,
  paidCents: 0,
  receivedCents: 0,
  netCents: -100000,
  transfers: [{ fromMemberId: 1, fromName: 'Ana', toMemberId: 2, toName: 'Bruno', amountCents: 100000 }],
  items: [
    makeStatementItem(10, { paid: true, groupPaid: true, paidByName: 'Bruno' }),
    makeStatementItem(12, {
      kind: 'INCOME',
      description: 'Sublocação',
      shareCents: 2000,
      totalCents: 4000,
      category: null,
    }),
  ],
  ...extra,
})

export function stubBudgetApi({
  groups = budgetGroups,
  lines = budgetLines,
  shares = [],
  summary = budgetSummary,
  groupStatements = [],
}: {
  groups?: CategoryGroup[]
  lines?: BudgetLine[]
  /** The user's shares of linked groups, per category and month */
  shares?: ShareCell[]
  summary?: BudgetSummary
  groupStatements?: GroupStatement[]
} = {}) {
  vi.mocked(budgetApi.fetchCategories).mockResolvedValue(groups)
  vi.mocked(budgetApi.fetchGroupStatements).mockResolvedValue(groupStatements)
  vi.mocked(budgetApi.fetchEntries).mockResolvedValue(entriesOf(lines, shares))
  vi.mocked(budgetApi.fetchLines).mockResolvedValue(lines)
  vi.mocked(budgetApi.fetchSummary).mockResolvedValue(summary)
  vi.mocked(budgetApi.saveLines).mockResolvedValue()
  vi.mocked(budgetApi.updateInitialBalance).mockResolvedValue()
  // Tree changes resolve with whatever; the page refetches the tree afterwards
  vi.mocked(budgetApi.createGroup).mockResolvedValue(groups[0])
  vi.mocked(budgetApi.updateGroup).mockResolvedValue(groups[0])
  vi.mocked(budgetApi.deleteGroup).mockResolvedValue()
  vi.mocked(budgetApi.createCategory).mockResolvedValue(groups[0].categories[0])
  vi.mocked(budgetApi.updateCategory).mockResolvedValue(groups[0].categories[0])
  vi.mocked(budgetApi.deleteCategory).mockResolvedValue()
}
