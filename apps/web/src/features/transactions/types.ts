import type { EntryKind, Month } from '@/features/budget/types'

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
  series: { index: number; count: number } | null
  category: {
    id: number
    name: string
    dueDay: number | null
    active: boolean
    group: { id: number; name: string; kind: EntryKind; active: boolean }
  }
}

export interface TransactionInput {
  categoryId: number
  /** First (or only) month */
  month: Month
  description?: string | null
  plannedCents: number
  /** Creates one occurrence per month, starting at `month` (1–60) */
  repeatMonths?: number
}

/** Fields to change; `null` clears the description */
export type TransactionPatch = Partial<Pick<TransactionInput, 'categoryId' | 'description' | 'plannedCents'>>
