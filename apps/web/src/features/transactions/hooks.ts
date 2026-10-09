import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { budgetQueries } from '@/features/budget/queries'
import {
  createTransaction,
  deleteTransaction,
  realizeTransaction,
  setTransactionSeriesEnd,
  unrealizeTransaction,
  updateTransaction,
} from './api'
import { seriesToast } from './recurrence'
import type { RecurrenceScope, SeriesChange, TransactionInput, TransactionPatch } from './types'

/**
 * Changes to transactions. Each resolves once the data is fresh again (the
 * statement, the grid and the balances) and rejects with the API error.
 */
export function useTransactionActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: budgetQueries.all() })

  return {
    async create(input: TransactionInput) {
      const created = await createTransaction(input)
      await refresh()
      toast.success(created.length > 1 ? `${created.length} lançamentos criados` : 'Lançamento criado')
    },
    async update(id: number, patch: TransactionPatch, scope: RecurrenceScope) {
      await updateTransaction(id, patch, scope)
      await refresh()
      toast.success('Lançamento alterado')
    },
    async remove(id: number, scope: RecurrenceScope) {
      await deleteTransaction(id, scope)
      await refresh()
      toast.success(scope === 'FOLLOWING' ? 'Lançamentos excluídos' : 'Lançamento excluído')
    },
    async setSeriesEnd(id: number, change: SeriesChange) {
      const series = await setTransactionSeriesEnd(id, change)
      await refresh()
      toast.success(seriesToast(change, series.length))
    },
    async realize(id: number, amountCents: number) {
      await realizeTransaction(id, amountCents)
      await refresh()
    },
    async unrealize(id: number) {
      await unrealizeTransaction(id)
      await refresh()
    },
  }
}
