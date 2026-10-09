import type { EntryKind, Month, SeriesPosition } from '@/features/budget/types'
import type { AdjustmentInput } from '@/features/transactions/recurrence'
import type { RecurrenceScope } from '@/features/transactions/types'

export type { RecurrenceScope }

export type GroupRole = 'OWNER' | 'MEMBER'

/**
 * How a split rule divides an amount. `value` of each share means:
 * PERCENT basis points (30% = 3000), WEIGHT a weight, FIXED cents; EQUAL
 * ignores it, and an EQUAL rule without shares splits among every member.
 */
export type SplitType = 'EQUAL' | 'PERCENT' | 'WEIGHT' | 'FIXED'

export interface FinanceGroupSummary {
  id: number
  name: string
  description: string | null
  /** The current user's role */
  role: GroupRole
  memberCount: number
}

export interface GroupMember {
  /** Membership id (what shares and payers refer to) */
  id: number
  userId: number
  name: string
  email: string
  /** Pre-registered by an invitation (no account yet); `name` is the nickname */
  pending: boolean
  role: GroupRole
  joinedAt: string
}

/** A group's own category (one level, by kind) */
export interface GroupCategory {
  id: number
  kind: EntryKind
  name: string
  /** Off: can't be picked for new launches; history stays */
  active: boolean
}

export interface GroupCategoryInput {
  kind: EntryKind
  name: string
}

/** One group category mapped to one of the user's categories */
export interface GroupCategoryLink {
  groupCategoryId: number
  categoryId: number
}

/**
 * The personal categories that receive the user's shares; `null` keeps them
 * out of the budget. `categoryLinks` override them per group category (none =
 * one category for everything); the other items use the default of their kind.
 */
export interface GroupLink {
  expenseCategoryId: number | null
  incomeCategoryId: number | null
  /** The user's payment method for their expense shares (its invoice shows them) */
  paymentMethodId: number | null
  categoryLinks: GroupCategoryLink[]
}

export interface FinanceGroup extends FinanceGroupSummary {
  /** The current user's membership id */
  memberId: number
  /** Where the current user's shares land in their budget */
  link: GroupLink
  /** The group's categories, expenses first, by name */
  categories: GroupCategory[]
  /** Active members, oldest first */
  members: GroupMember[]
}

/** Without an account, `nickname` pre-registers the person, who joins right away */
export interface InvitationInput {
  email: string
  nickname?: string
}

export interface GroupInput {
  name: string
  description: string | null
}

export interface InvitationUser {
  id: number
  name: string
  email: string
}

/**
 * An invitation, as the group's members see it: `PENDING` until the invitee
 * answers, or `ACCEPTED` right away for a pre-registered person
 */
export interface GroupInvitation {
  id: number
  status: 'PENDING' | 'ACCEPTED'
  invitee: InvitationUser & { pending: boolean }
  inviter: InvitationUser
  createdAt: string
}

/** A pending invitation, as the invitee sees it */
export interface ReceivedInvitation {
  id: number
  group: { id: number; name: string }
  inviter: InvitationUser
  createdAt: string
}

export interface SplitShare {
  memberId: number
  value: number
}

export interface SplitMethod {
  id: number
  name: string
  type: SplitType
  /** Off when a member it names left; can't be used until edited */
  active: boolean
  shares: SplitShare[]
}

export interface SplitMethodInput {
  name: string
  type: SplitType
  shares: { memberId: number; value?: number }[]
}

export interface MemberShare {
  memberId: number
  name: string
  amountCents: number
  /** Whoever receives the money confirmed this share was paid back */
  settled: boolean
}

export interface GroupTransaction {
  id: number
  kind: EntryKind
  description: string
  month: Month
  amountCents: number
  /** Day of the month it is due (1–31) */
  dueDay: number | null
  /** Link to the bill (boleto) or the portal where it is paid (http/https) */
  paymentUrl: string | null
  /** The group's own category */
  category: { id: number; name: string } | null
  /** `null` once the rule was deleted */
  splitMethod: { id: number; name: string; type: SplitType } | null
  /** Who paid (expense) or received (income); `null` while pending */
  paidBy: { memberId: number; name: string } | null
  series: SeriesPosition | null
  /** Add up to the amount */
  shares: MemberShare[]
}

export interface GroupTransactionInput {
  kind: EntryKind
  description: string
  month: Month
  amountCents: number
  splitMethodId: number
  paidByMemberId?: number | null
  repeatMonths?: number
  /** Repeats every month with no end */
  openEnded?: boolean
  /** Scheduled adjustment (not with a FIXED rule) */
  adjustment?: AdjustmentInput
  dueDay?: number | null
  paymentUrl?: string | null
  /** A category of the group with the same kind */
  categoryId?: number | null
}

export type GroupTransactionPatch = Partial<
  Pick<
    GroupTransactionInput,
    'kind' | 'description' | 'amountCents' | 'splitMethodId' | 'dueDay' | 'paymentUrl' | 'categoryId'
  >
>

export interface MemberBalance {
  memberId: number
  name: string
  /** false for former members */
  active: boolean
  /** Share of the expenses minus share of the incomes (pending ones included) */
  shareCents: number
  paidCents: number
  receivedCents: number
  /** > 0: to receive; < 0: owes. Paid items only, without the shares already paid back. */
  netCents: number
}

export interface Transfer {
  fromMemberId: number
  toMemberId: number
  amountCents: number
}

/** A share of a paid item that one member owes another */
export interface SettlementItem {
  transactionId: number
  kind: EntryKind
  description: string
  /** The member whose share it is */
  memberId: number
  /** Who paid the expense or received the income */
  payerMemberId: number
  amountCents: number
  /** Confirmed as paid back */
  settled: boolean
  /** The user receives the money (payer of an expense, share member of an income), so they confirm it */
  canSettle: boolean
}

/** Shares to confirm (or undo) as paid back */
export interface SettlementInput {
  items: { transactionId: number; memberId: number }[]
  settled: boolean
}

export interface GroupBalance {
  month: Month
  incomeCents: number
  expenseCents: number
  /** Items nobody paid or received yet */
  pendingCents: number
  members: MemberBalance[]
  transfers: Transfer[]
  /** Shares of the paid items owed to whoever paid or received them */
  settlements: SettlementItem[]
}
