import type { PaymentMethod, PaymentMethodType } from './types'

export const PAYMENT_METHOD_TYPES: { value: PaymentMethodType; label: string }[] = [
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'ACCOUNT', label: 'Conta / débito' },
  { value: 'OTHER', label: 'Outro (boleto, carnê…)' },
]

export const paymentMethodTypeLabel = (type: PaymentMethodType) =>
  PAYMENT_METHOD_TYPES.find((t) => t.value === type)!.label

/** "Vence dia 12", or a hint when it follows each category */
export const describeDueDay = ({ dueDay }: Pick<PaymentMethod, 'dueDay'>) =>
  dueDay === null ? 'Vencimento de cada categoria' : `Vence dia ${dueDay}`

/** "12/10" from `2026-10-12` */
export function formatDueDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

/** The methods a launch may pick: active ones plus the current one (even inactive) */
export function selectableMethods<T extends PaymentMethod>(methods: T[], currentId: number | null): T[] {
  return methods.filter((m) => m.active || m.id === currentId)
}
