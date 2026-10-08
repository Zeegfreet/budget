import { queryOptions } from '@tanstack/react-query'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { fetchInvoice, fetchInvoiceHistory, fetchPaymentMethods } from './api'

/**
 * Under the budget prefix: invoices are made of transactions and group shares,
 * so whatever invalidates `budgetQueries.all()` refreshes them too.
 */
export const paymentMethodQueries = {
  all: () => [...budgetQueries.all(), 'payment-methods'] as const,
  list: (month: Month) =>
    queryOptions({
      queryKey: [...paymentMethodQueries.all(), 'list', month],
      queryFn: () => fetchPaymentMethods(month),
    }),
  invoice: (id: number, month: Month) =>
    queryOptions({
      queryKey: [...paymentMethodQueries.all(), id, 'invoice', month],
      queryFn: () => fetchInvoice(id, month),
    }),
  history: (id: number, from: Month, to: Month) =>
    queryOptions({
      queryKey: [...paymentMethodQueries.all(), id, 'history', { from, to }],
      queryFn: () => fetchInvoiceHistory(id, from, to),
    }),
}
