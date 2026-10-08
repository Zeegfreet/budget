import { knownPaymentMethodMessage } from '@/features/payment-methods/errors'
import { ApiError } from '@/lib/api/client'

/** Message for a failed change of a transaction */
export function transactionErrorMessage(error: unknown, fallback: string): string {
  const known = knownPaymentMethodMessage(error)
  if (known) return known
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Lançamento não encontrado. Atualize a página.'
    return error.messages.join(' ')
  }
  return fallback
}

/** Message for a failed change of a series' range */
export function seriesErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Há lançamentos já realizados depois desse mês. Desfaça a realização ou escolha um mês posterior.'
  }
  return transactionErrorMessage(error, 'Não foi possível ajustar a recorrência.')
}
