import type { EntryKind, Month } from '@/features/budget/types'
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
  role: GroupRole
  joinedAt: string
}

/** The personal categories that receive the user's shares; `null` keeps them out of the budget */
export interface GroupLink {
  expenseCategoryId: number | null
  incomeCategoryId: number | null
  /** The user's payment method for their expense shares (its invoice shows them) */
  paymentMethodId: number | null
}

export interface FinanceGroup extends FinanceGroupSummary {
  /** The current user's membership id */
  memberId: number
  /** Where the current user's shares land in their budget */
  link: GroupLink
  /** Active members, oldest first */
  members: GroupMember[]
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

/** A pending invitation, as the group's members see it */
export interface GroupInvitation {
  id: number
  invitee: InvitationUser
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
}

export interface GroupTransaction {
  id: number
  kind: EntryKind
  description: string
  month: Month
  amountCents: number
  /** `null` once the rule was deleted */
  splitMethod: { id: number; name: string; type: SplitType } | null
  /** Who paid (expense) or received (income); `null` while pending */
  paidBy: { memberId: number; name: string } | null
  series: { index: number; count: number } | null
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
}

export type GroupTransactionPatch = Partial<Pick<GroupTransactionInput, 'description' | 'amountCents' | 'splitMethodId'>>

export interface MemberBalance {
  memberId: number
  name: string
  /** false for former members */
  active: boolean
  /** Share of the expenses minus share of the incomes (pending ones included) */
  shareCents: number
  paidCents: number
  receivedCents: number
  /** > 0: to receive; < 0: owes. Paid items only. */
  netCents: number
}

export interface Transfer {
  fromMemberId: number
  toMemberId: number
  amountCents: number
}

export interface GroupBalance {
  month: Month
  incomeCents: number
  expenseCents: number
  /** Items nobody paid or received yet */
  pendingCents: number
  members: MemberBalance[]
  transfers: Transfer[]
}
