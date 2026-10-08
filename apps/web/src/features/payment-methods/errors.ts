import { ApiError } from '@/lib/api/client'
import { INVALID_PAYMENT_URL } from '@/lib/payment-url'

/** The API's messages about payment methods, in Portuguese */
const MESSAGES: Record<string, string> = {
  'A payment method with this name already exists': 'Já existe um meio de pagamento com esse nome.',
  'Payment method is inactive': 'Este meio de pagamento está inativo. Escolha outro ou reative-o.',
  'Payment method not found': 'Meio de pagamento não encontrado. Atualize a página.',
  'Only expenses have a payment method': 'Só despesas têm meio de pagamento.',
  // The link to the bill of a launch (personal or group)
  'paymentUrl must be an http(s) URL': INVALID_PAYMENT_URL,
}

/** The known messages among the API's, translated, or `null` */
export function knownPaymentMethodMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const known = error.messages.map((m) => MESSAGES[m]).filter(Boolean)
  return known.length > 0 ? known.join(' ') : null
}

/** Message for a failed change of a payment method or invoice */
export function paymentMethodErrorMessage(error: unknown, fallback: string): string {
  const known = knownPaymentMethodMessage(error)
  if (known) return known
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 404) return 'Meio de pagamento não encontrado. Atualize a página.'
  return error.messages.join(' ') || fallback
}
