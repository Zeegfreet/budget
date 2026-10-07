import { describe, expect, it } from 'vitest'
import { describeDueDay, formatDueDate, paymentMethodTypeLabel, selectableMethods } from './labels'
import type { PaymentMethod } from './types'

const method = (id: number, active = true): PaymentMethod => ({
  id,
  name: `M${id}`,
  type: 'CREDIT_CARD',
  dueDay: 12,
  active,
})

describe('payment method labels', () => {
  it('names the types and the due day', () => {
    expect(paymentMethodTypeLabel('CREDIT_CARD')).toBe('Cartão de crédito')
    expect(describeDueDay({ dueDay: 12 })).toBe('Vence dia 12')
    expect(describeDueDay({ dueDay: null })).toBe('Vencimento de cada categoria')
    expect(formatDueDate('2026-10-05')).toBe('05/10')
  })

  it('offers active methods plus the current one', () => {
    const methods = [method(1), method(2, false), method(3, false)]
    expect(selectableMethods(methods, null).map((m) => m.id)).toEqual([1])
    expect(selectableMethods(methods, 2).map((m) => m.id)).toEqual([1, 2])
  })
})
