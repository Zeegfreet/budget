import { api } from '@/lib/api/client'
import type { Month } from '@/features/budget/types'
import type {
  Invoice,
  InvoiceMonth,
  PaymentMethod,
  PaymentMethodInput,
  PaymentMethodPatch,
  PaymentMethodSummary,
} from './types'

/** Every method (inactive ones too) with its invoice of `month` */
export async function fetchPaymentMethods(month: Month): Promise<PaymentMethodSummary[]> {
  const { data } = await api.get<PaymentMethodSummary[]>('/payment-methods', { params: { month } })
  return data
}

export async function createPaymentMethod(input: PaymentMethodInput): Promise<PaymentMethod> {
  const { data } = await api.post<PaymentMethod>('/payment-methods', input)
  return data
}

export async function updatePaymentMethod(id: number, patch: PaymentMethodPatch): Promise<PaymentMethod> {
  const { data } = await api.patch<PaymentMethod>(`/payment-methods/${id}`, patch)
  return data
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await api.delete(`/payment-methods/${id}`)
}

export async function fetchInvoice(id: number, month: Month): Promise<Invoice> {
  const { data } = await api.get<Invoice>(`/payment-methods/${id}/invoice`, { params: { month } })
  return data
}

/** Totals of every month from `from` to `to` (at most 24) */
export async function fetchInvoiceHistory(id: number, from: Month, to: Month): Promise<InvoiceMonth[]> {
  const { data } = await api.get<InvoiceMonth[]>(`/payment-methods/${id}/invoices`, { params: { from, to } })
  return data
}

/** Realizes the month's pending transactions of the method with their planned amount */
export async function payInvoice(id: number, month: Month): Promise<Invoice> {
  const { data } = await api.put<Invoice>(`/payment-methods/${id}/invoice/payment`, undefined, { params: { month } })
  return data
}

/** The month's transactions of the method go back to pending */
export async function unpayInvoice(id: number, month: Month): Promise<Invoice> {
  const { data } = await api.delete<Invoice>(`/payment-methods/${id}/invoice/payment`, { params: { month } })
  return data
}
