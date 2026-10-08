import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { paymentMethodQueries } from './queries'
import { createPaymentMethod, deletePaymentMethod, payInvoice, unpayInvoice, updatePaymentMethod } from './api'
import type { PaymentMethod, PaymentMethodInput, PaymentMethodPatch } from './types'

/**
 * Changes to payment methods and their invoices. Each resolves once the data
 * is fresh again (invoices, statement, grid and balances, since a method moves
 * due days and paying realizes transactions) and rejects with the API error.
 */
export function usePaymentMethodActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: budgetQueries.all() })

  return {
    async create(input: PaymentMethodInput): Promise<PaymentMethod> {
      const created = await createPaymentMethod(input)
      await refresh()
      toast.success('Meio de pagamento criado')
      return created
    },
    async update(id: number, patch: PaymentMethodPatch) {
      await updatePaymentMethod(id, patch)
      await refresh()
      if (patch.active !== undefined && Object.keys(patch).length === 1) {
        toast.success(patch.active ? 'Meio de pagamento reativado' : 'Meio de pagamento inativado')
      } else {
        toast.success('Meio de pagamento salvo')
      }
    },
    async remove(id: number) {
      await deletePaymentMethod(id)
      await refresh()
      toast.success('Meio de pagamento excluído')
    },
    async pay(id: number, month: Month) {
      await payInvoice(id, month)
      await refresh()
      toast.success('Fatura paga')
    },
    async unpay(id: number, month: Month) {
      await unpayInvoice(id, month)
      await refresh()
      toast.success('Pagamento da fatura desfeito')
    },
  }
}

/**
 * The user's payment methods for a form's select, fetched only while `enabled`
 * (e.g. a dialog is open); empty until they arrive.
 */
export function usePaymentMethodOptions(month: Month, enabled: boolean): PaymentMethod[] {
  const { data } = useQuery({ ...paymentMethodQueries.list(month), enabled })
  return data ?? []
}
