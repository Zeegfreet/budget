import { knownPaymentMethodMessage } from '@/features/payment-methods/errors'
import { ApiError } from '@/lib/api/client'

/** The API's recurrence messages, in Portuguese (shared with the group helpers) */
const RECURRENCE_MESSAGES: Record<string, string> = {
  'openEnded and repeatMonths cannot be used together':
    'Escolha repetir por alguns meses ou sem data de término, não os dois.',
  'An adjustment needs a recurring launch': 'O reajuste automático só vale para lançamentos que se repetem.',
  'A fixed split cannot have a scheduled adjustment': 'Uma regra de valores fixos não tem reajuste automático.',
  'untilMonth must not be before the first occurrence': 'O último mês não pode ser antes do primeiro lançamento.',
}

/** The recurrence message of the error, translated, or `null` */
export function knownRecurrenceMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const known = error.messages.map((m) => RECURRENCE_MESSAGES[m]).filter(Boolean)
  return known.length > 0 ? known.join(' ') : null
}

/** Message for a failed change of a transaction */
export function transactionErrorMessage(error: unknown, fallback: string): string {
  const known = knownPaymentMethodMessage(error) ?? knownRecurrenceMessage(error)
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
