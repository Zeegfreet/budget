import { ApiError } from '@/lib/api/client'

/** Message for a failed change of a transaction */
export function transactionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Lançamento não encontrado. Atualize a página.'
    return error.messages.join(' ')
  }
  return fallback
}
