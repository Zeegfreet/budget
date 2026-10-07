import { queryOptions } from '@tanstack/react-query'
import { fetchCategories, fetchEntries, fetchSummary } from './api'
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
  summary: (month: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'summary', month],
      queryFn: () => fetchSummary(month),
    }),
}
