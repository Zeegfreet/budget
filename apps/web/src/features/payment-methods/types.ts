import type { Month } from '@/features/budget/types'
import type { Transaction } from '@/features/transactions/types'

export type PaymentMethodType = 'CREDIT_CARD' | 'ACCOUNT' | 'OTHER'

/** Where the user pays expenses (a card, an account…); its due day overrides the category's */
export interface PaymentMethod {
  id: number
  name: string
  type: PaymentMethodType
  /** Day of the month the invoice is due (1–31) */
  dueDay: number | null
  /** Inactive methods can't be picked for new launches; their history stays */
  active: boolean
}

/** Integer cents; a paid group share counts as realized */
export interface InvoiceTotals {
  plannedCents: number
  realizedCents: number
  pendingCents: number
  /** Realized amounts, or planned while pending */
  effectiveCents: number
  /** Transactions and group shares in it */
  count: number
}

export interface PaymentMethodSummary extends PaymentMethod {
  /** The invoice of the month asked for */
  invoice: InvoiceTotals
}

/** The user's share of a group expense paid with the method (read-only: the group says if it's paid) */
export interface InvoiceShare {
  transactionId: number
  group: { id: number; name: string }
  description: string
  shareCents: number
  /** The user's share is paid: they paid the expense, or the payer confirmed being paid back */
  paid: boolean
  /** Someone in the group paid the expense (the user's share may still be open) */
  groupPaid: boolean
}

export interface Invoice extends InvoiceTotals {
  paymentMethod: PaymentMethod
  month: Month
  /** `YYYY-MM-DD`; the month's last day when the due day is past it */
  dueDate: string | null
  transactions: Transaction[]
  shares: InvoiceShare[]
}

export interface InvoiceMonth extends InvoiceTotals {
  month: Month
}

export interface PaymentMethodInput {
  name: string
  type: PaymentMethodType
  dueDay: number | null
}

export type PaymentMethodPatch = Partial<PaymentMethodInput & { active: boolean }>
