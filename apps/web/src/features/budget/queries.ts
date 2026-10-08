import { queryOptions } from '@tanstack/react-query'
import { fetchCategories, fetchEntries, fetchGroupStatements, fetchLines, fetchSummary } from './api'
import type { Month } from './types'

export const budgetQueries = {
  /** Prefix shared by every budget query, for invalidation after saving */
  all: () => ['budget'] as const,
  categories: () =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'categories'],
      queryFn: fetchCategories,
    }),
  entries: (from: Month, to: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'entries', { from, to }],
      queryFn: () => fetchEntries(from, to),
    }),
  lines: (from: Month, to: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'lines', { from, to }],
      queryFn: () => fetchLines(from, to),
    }),
  summary: (month: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'summary', month],
      queryFn: () => fetchSummary(month),
    }),
  /** The user's groups in the month (their shares count in the summary, hence under `all()`) */
  groupStatements: (month: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'group-statements', month],
      queryFn: () => fetchGroupStatements(month),
    }),
}
