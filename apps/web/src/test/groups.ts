import { vi } from 'vitest'
import * as groupsApi from '@/features/groups/api'
import type {
  FinanceGroup,
  GroupBalance,
  GroupCategory,
  GroupInvitation,
  GroupMember,
  GroupTransaction,
  ReceivedInvitation,
  SplitMethod,
} from '@/features/groups/types'

// For specs that `vi.mock('@/features/groups/api')`: "República" (id 7) of Ana
// (membership 1, owner, the signed-in user of the specs) and Bruno (membership 2),
// with October 2026 transactions.

export const makeMember = (id: number, name: string, extra: Partial<GroupMember> = {}): GroupMember => ({
  id,
  userId: id * 100,
  name,
  email: `${name.toLowerCase()}@example.com`,
  pending: false,
  role: 'MEMBER',
  joinedAt: '2026-10-01T12:00:00.000Z',
  ...extra,
})

export const ana = makeMember(1, 'Ana', { role: 'OWNER', userId: 1, email: 'ana@example.com' })
export const bruno = makeMember(2, 'Bruno')

export const makeGroup = (extra: Partial<FinanceGroup> = {}): FinanceGroup => {
  const members = extra.members ?? [ana, bruno]
  return {
    id: 7,
    name: 'República',
    description: 'Rua A, 10',
    role: 'OWNER',
    memberId: ana.id,
    memberCount: members.length,
    members,
    link: { expenseCategoryId: null, incomeCategoryId: null, paymentMethodId: null, categoryLinks: [] },
    categories: [],
    ...extra,
  }
}

export const makeGroupCategory = (id: number, name: string, extra: Partial<GroupCategory> = {}): GroupCategory => ({
  id,
  kind: 'EXPENSE',
  name,
  active: true,
  ...extra,
})

export const makeSplitMethod = (id: number, extra: Partial<SplitMethod> = {}): SplitMethod => ({
  id,
  name: 'Igualitário',
  type: 'EQUAL',
  active: true,
  shares: [],
  ...extra,
})

export const equalRule = makeSplitMethod(1)
/** Ana 30%, Bruno 70% */
export const percentRule = makeSplitMethod(2, {
  name: 'Aluguel 30/70',
  type: 'PERCENT',
  shares: [
    { memberId: 1, value: 3000 },
    { memberId: 2, value: 7000 },
  ],
})

export const makeGroupTransaction = (id: number, extra: Partial<GroupTransaction> = {}): GroupTransaction => ({
  id,
  kind: 'EXPENSE',
  description: 'Água',
  month: '2026-10',
  amountCents: 10000,
  dueDay: null,
  paymentUrl: null,
  category: null,
  splitMethod: { id: equalRule.id, name: equalRule.name, type: 'EQUAL' },
  paidBy: null,
  series: null,
  shares: [
    { memberId: 1, name: 'Ana', amountCents: 5000, settled: false },
    { memberId: 2, name: 'Bruno', amountCents: 5000, settled: false },
  ],
  ...extra,
})

/** First of a 12-month series, paid by Ana */
export const rentTransaction = makeGroupTransaction(10, {
  description: 'Aluguel',
  amountCents: 200000,
  splitMethod: { id: percentRule.id, name: percentRule.name, type: 'PERCENT' },
  paidBy: { memberId: 1, name: 'Ana' },
  series: { index: 1, count: 12, firstMonth: '2026-10', lastMonth: '2027-09' },
  shares: [
    { memberId: 1, name: 'Ana', amountCents: 60000, settled: false },
    { memberId: 2, name: 'Bruno', amountCents: 140000, settled: false },
  ],
})
export const waterTransaction = makeGroupTransaction(11)
export const subletTransaction = makeGroupTransaction(12, {
  kind: 'INCOME',
  description: 'Sublocação',
  amountCents: 4000,
  shares: [
    { memberId: 1, name: 'Ana', amountCents: 2000, settled: false },
    { memberId: 2, name: 'Bruno', amountCents: 2000, settled: false },
  ],
})

export const octoberGroupTransactions = [rentTransaction, waterTransaction, subletTransaction]

export const groupBalance: GroupBalance = {
  month: '2026-10',
  incomeCents: 4000,
  expenseCents: 210000,
  pendingCents: 14000,
  members: [
    { memberId: 1, name: 'Ana', active: true, shareCents: 63000, paidCents: 200000, receivedCents: 0, netCents: 140000 },
    { memberId: 2, name: 'Bruno', active: true, shareCents: 143000, paidCents: 0, receivedCents: 0, netCents: -140000 },
  ],
  transfers: [{ fromMemberId: 2, toMemberId: 1, amountCents: 140000 }],
  settlements: [
    {
      transactionId: 10,
      kind: 'EXPENSE',
      description: 'Aluguel',
      memberId: 2,
      payerMemberId: 1,
      amountCents: 140000,
      settled: false,
      canSettle: true,
    },
  ],
}

export const pendingInvitation: GroupInvitation = {
  id: 30,
  status: 'PENDING',
  invitee: { id: 300, name: 'Carla', email: 'carla@example.com', pending: false },
  inviter: { id: 1, name: 'Ana', email: 'ana@example.com' },
  createdAt: '2026-10-02T12:00:00.000Z',
}

export const receivedInvitation: ReceivedInvitation = {
  id: 40,
  group: { id: 8, name: 'Casa da praia' },
  inviter: { id: 400, name: 'Diego', email: 'diego@example.com' },
  createdAt: '2026-10-03T12:00:00.000Z',
}

interface GroupsStub {
  group?: FinanceGroup
  splitMethods?: SplitMethod[]
  invitations?: GroupInvitation[]
  transactions?: GroupTransaction[]
  balance?: GroupBalance
  received?: ReceivedInvitation[]
}

export function stubGroupsApi({
  group = makeGroup(),
  splitMethods = [equalRule, percentRule],
  invitations = [pendingInvitation],
  transactions = octoberGroupTransactions,
  balance = groupBalance,
  received = [],
}: GroupsStub = {}) {
  const { id, name, description, role, memberCount } = group
  vi.mocked(groupsApi.fetchGroups).mockResolvedValue([{ id, name, description, role, memberCount }])
  vi.mocked(groupsApi.fetchGroup).mockResolvedValue(group)
  vi.mocked(groupsApi.createGroup).mockResolvedValue(group)
  vi.mocked(groupsApi.updateGroup).mockResolvedValue(group)
  vi.mocked(groupsApi.deleteGroup).mockResolvedValue()
  vi.mocked(groupsApi.leaveGroup).mockResolvedValue()
  vi.mocked(groupsApi.removeMember).mockResolvedValue()
  vi.mocked(groupsApi.setGroupLink).mockResolvedValue(group)
  vi.mocked(groupsApi.fetchGroupInvitations).mockResolvedValue(invitations)
  vi.mocked(groupsApi.inviteMember).mockResolvedValue(pendingInvitation)
  vi.mocked(groupsApi.cancelInvitation).mockResolvedValue()
  vi.mocked(groupsApi.fetchReceivedInvitations).mockResolvedValue(received)
  vi.mocked(groupsApi.acceptInvitation).mockResolvedValue()
  vi.mocked(groupsApi.declineInvitation).mockResolvedValue()
  vi.mocked(groupsApi.fetchSplitMethods).mockResolvedValue(splitMethods)
  vi.mocked(groupsApi.createSplitMethod).mockResolvedValue(splitMethods[0])
  vi.mocked(groupsApi.updateSplitMethod).mockResolvedValue(splitMethods[0])
  vi.mocked(groupsApi.deleteSplitMethod).mockResolvedValue()
  vi.mocked(groupsApi.createGroupCategory).mockResolvedValue(makeGroupCategory(90, 'Nova'))
  vi.mocked(groupsApi.updateGroupCategory).mockResolvedValue(makeGroupCategory(90, 'Nova'))
  vi.mocked(groupsApi.deleteGroupCategory).mockResolvedValue()
  vi.mocked(groupsApi.fetchGroupTransactions).mockResolvedValue(transactions)
  vi.mocked(groupsApi.createGroupTransaction).mockResolvedValue(transactions.slice(0, 1))
  vi.mocked(groupsApi.updateGroupTransaction).mockResolvedValue(transactions[0])
  vi.mocked(groupsApi.deleteGroupTransaction).mockResolvedValue()
  vi.mocked(groupsApi.payGroupTransaction).mockResolvedValue(transactions[0])
  vi.mocked(groupsApi.unpayGroupTransaction).mockResolvedValue(transactions[0])
  vi.mocked(groupsApi.setGroupTransactionSeriesEnd).mockResolvedValue([transactions[0]])
  vi.mocked(groupsApi.fetchGroupBalance).mockResolvedValue(balance)
  vi.mocked(groupsApi.setSettlement).mockResolvedValue()
}
