import { vi } from 'vitest'
import * as paymentMethodsApi from '@/features/payment-methods/api'
import type {
  Invoice,
  InvoiceMonth,
  InvoiceTotals,
  PaymentMethod,
  PaymentMethodSummary,
} from '@/features/payment-methods/types'
import { categories, makeTransaction } from './transactions'

// For specs that `vi.mock('@/features/payment-methods/api')`: October 2026.

/** An active credit card due on the 12th */
export const makePaymentMethod = (id: number, extra: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id,
  name: 'Cartão Americanas',
  type: 'CREDIT_CARD',
  dueDay: 12,
  active: true,
  ...extra,
})

export const emptyTotals: InvoiceTotals = {
  plannedCents: 0,
  realizedCents: 0,
  pendingCents: 0,
  effectiveCents: 0,
  count: 0,
}

export const makeSummary = (
  method: PaymentMethod,
  invoice: Partial<InvoiceTotals> = {},
): PaymentMethodSummary => ({ ...method, invoice: { ...emptyTotals, ...invoice } })

export const card = makePaymentMethod(1)
export const account = makePaymentMethod(2, { name: 'Conta Corrente', type: 'ACCOUNT', dueDay: null })

export const paymentMethodSummaries: PaymentMethodSummary[] = [
  makeSummary(card, {
    plannedCents: 25000,
    realizedCents: 5000,
    pendingCents: 20000,
    effectiveCents: 25000,
    count: 3,
  }),
  makeSummary(account),
]

/**
 * October's invoice of the card: Lazer (pending), Alimentação (realized) and
 * Ana's share of the República rent (pending in the group).
 */
export const makeInvoice = (extra: Partial<Invoice> = {}): Invoice => ({
  paymentMethod: card,
  month: '2026-10',
  dueDate: '2026-10-12',
  plannedCents: 25000,
  realizedCents: 5000,
  pendingCents: 20000,
  effectiveCents: 25000,
  count: 3,
  transactions: [
    makeTransaction(21, { category: categories.leisure, description: 'Cinema', plannedCents: 10000, paymentMethod: card }),
    makeTransaction(22, {
      category: categories.food,
      description: 'Mercado',
      plannedCents: 5000,
      realizedCents: 5000,
      paymentMethod: card,
    }),
  ],
  shares: [{ transactionId: 30, group: { id: 7, name: 'República' }, description: 'Aluguel', shareCents: 10000, paid: false }],
  ...extra,
})

export const invoiceHistory = (month = '2026-10'): InvoiceMonth[] =>
  ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map(
    (m) => ({ month: m, ...emptyTotals, ...(m === month ? { effectiveCents: 25000, count: 3 } : {}) }),
  )

export function stubPaymentMethodsApi({
  summaries = paymentMethodSummaries,
  invoice = makeInvoice(),
}: { summaries?: PaymentMethodSummary[]; invoice?: Invoice } = {}) {
  vi.mocked(paymentMethodsApi.fetchPaymentMethods).mockResolvedValue(summaries)
  vi.mocked(paymentMethodsApi.createPaymentMethod).mockResolvedValue(card)
  vi.mocked(paymentMethodsApi.updatePaymentMethod).mockResolvedValue(card)
  vi.mocked(paymentMethodsApi.deletePaymentMethod).mockResolvedValue()
  vi.mocked(paymentMethodsApi.fetchInvoice).mockResolvedValue(invoice)
  vi.mocked(paymentMethodsApi.fetchInvoiceHistory).mockResolvedValue(invoiceHistory())
  vi.mocked(paymentMethodsApi.payInvoice).mockResolvedValue(invoice)
  vi.mocked(paymentMethodsApi.unpayInvoice).mockResolvedValue(invoice)
}
