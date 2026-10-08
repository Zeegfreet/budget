import type { EntryKind, Month, SeriesPosition } from '@/features/budget/types'
import type { PaymentMethod } from '@/features/payment-methods/types'

/** Which occurrences of a recurring transaction a change applies to */
export type RecurrenceScope = 'ONE' | 'FOLLOWING'

/** A planned income or expense of a category in a month (a "lançamento") */
export interface Transaction {
  id: number
  month: Month
  description: string | null
  /** Integer cents, never negative; the sign comes from the kind */
  plannedCents: number
  /** `null` while pending; once realized, the amount actually paid or received */
  realizedCents: number | null
  /** Position in its recurring series (e.g. 3 of 12), or `null` when single */
  series: SeriesPosition | null
  category: {
    id: number
    name: string
    active: boolean
    group: { id: number; name: string; kind: EntryKind; active: boolean }
  }
  /** The card or account it is paid with (expenses only) */
  paymentMethod: Pick<PaymentMethod, 'id' | 'name' | 'type' | 'dueDay' | 'active'> | null
  /** Effective due day: the payment method's, or else the launch's own */
  dueDay: number | null
  /** The launch's own due day (what the form edits) */
  ownDueDay: number | null
  /** Link to the bill (boleto) or the portal where it is paid (http/https) */
  paymentUrl: string | null
}

export interface TransactionInput {
  categoryId: number
  /** First (or only) month */
  month: Month
  description?: string | null
  plannedCents: number
  /** Creates one occurrence per month, starting at `month` (1–60) */
  repeatMonths?: number
  /** Day of the month it is due (1–31), in every occurrence */
  dueDay?: number | null
  /** Link to the bill (boleto) or the portal where it is paid (http/https) */
  paymentUrl?: string | null
  /** Expenses only; its due day overrides the launch's */
  paymentMethodId?: number | null
}

/** Fields to change; `null` clears the description, the due day, the link or the payment method */
export type TransactionPatch = Partial<
  Pick<
    TransactionInput,
    'categoryId' | 'description' | 'plannedCents' | 'dueDay' | 'paymentUrl' | 'paymentMethodId'
  >
>
