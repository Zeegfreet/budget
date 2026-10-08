import { queryOptions } from '@tanstack/react-query'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { fetchTransactions } from './api'

export const transactionQueries = {
  /** Under the budget prefix: invalidating `budgetQueries.all()` refreshes the statement too */
  month: (month: Month) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'transactions', month],
      queryFn: () => fetchTransactions(month),
    }),
}
