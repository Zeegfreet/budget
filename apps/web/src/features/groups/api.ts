import { api } from '@/lib/api/client'
import type { Month } from '@/features/budget/types'
import type {
  FinanceGroup,
  FinanceGroupSummary,
  GroupBalance,
  GroupCategory,
  GroupCategoryInput,
  GroupInput,
  GroupInvitation,
  GroupLink,
  GroupTransaction,
  GroupTransactionInput,
  GroupTransactionPatch,
  InvitationInput,
  ReceivedInvitation,
  RecurrenceScope,
  SettlementInput,
  SplitMethod,
  SplitMethodInput,
} from './types'

export async function fetchGroups(): Promise<FinanceGroupSummary[]> {
  const { data } = await api.get<FinanceGroupSummary[]>('/groups')
  return data
}

export async function fetchGroup(id: number): Promise<FinanceGroup> {
  const { data } = await api.get<FinanceGroup>(`/groups/${id}`)
  return data
}

export async function createGroup(input: GroupInput): Promise<FinanceGroup> {
  const { data } = await api.post<FinanceGroup>('/groups', input)
  return data
}

export async function updateGroup(id: number, input: Partial<GroupInput>): Promise<FinanceGroup> {
  const { data } = await api.patch<FinanceGroup>(`/groups/${id}`, input)
  return data
}

/** Sets the user's own categories for their shares of the group */
export async function setGroupLink(id: number, link: GroupLink): Promise<FinanceGroup> {
  const { data } = await api.put<FinanceGroup>(`/groups/${id}/link`, link)
  return data
}

export async function deleteGroup(id: number): Promise<void> {
  await api.delete(`/groups/${id}`)
}

export async function leaveGroup(id: number): Promise<void> {
  await api.post(`/groups/${id}/leave`)
}

export async function removeMember(groupId: number, memberId: number): Promise<void> {
  await api.delete(`/groups/${groupId}/members/${memberId}`)
}

export async function fetchGroupInvitations(groupId: number): Promise<GroupInvitation[]> {
  const { data } = await api.get<GroupInvitation[]>(`/groups/${groupId}/invitations`)
  return data
}

export async function inviteMember(groupId: number, input: InvitationInput): Promise<GroupInvitation> {
  const { data } = await api.post<GroupInvitation>(`/groups/${groupId}/invitations`, input)
  return data
}

export async function cancelInvitation(groupId: number, id: number): Promise<void> {
  await api.delete(`/groups/${groupId}/invitations/${id}`)
}

export async function fetchReceivedInvitations(): Promise<ReceivedInvitation[]> {
  const { data } = await api.get<ReceivedInvitation[]>('/invitations')
  return data
}

export async function acceptInvitation(id: number): Promise<void> {
  await api.post(`/invitations/${id}/accept`)
}

export async function declineInvitation(id: number): Promise<void> {
  await api.post(`/invitations/${id}/decline`)
}

export async function fetchSplitMethods(groupId: number): Promise<SplitMethod[]> {
  const { data } = await api.get<SplitMethod[]>(`/groups/${groupId}/split-methods`)
  return data
}

export async function createSplitMethod(groupId: number, input: SplitMethodInput): Promise<SplitMethod> {
  const { data } = await api.post<SplitMethod>(`/groups/${groupId}/split-methods`, input)
  return data
}

export async function updateSplitMethod(
  groupId: number,
  id: number,
  input: Partial<SplitMethodInput>,
): Promise<SplitMethod> {
  const { data } = await api.patch<SplitMethod>(`/groups/${groupId}/split-methods/${id}`, input)
  return data
}

export async function deleteSplitMethod(groupId: number, id: number): Promise<void> {
  await api.delete(`/groups/${groupId}/split-methods/${id}`)
}

export async function createGroupCategory(groupId: number, input: GroupCategoryInput): Promise<GroupCategory> {
  const { data } = await api.post<GroupCategory>(`/groups/${groupId}/categories`, input)
  return data
}

export async function updateGroupCategory(
  groupId: number,
  id: number,
  input: { name?: string; active?: boolean },
): Promise<GroupCategory> {
  const { data } = await api.patch<GroupCategory>(`/groups/${groupId}/categories/${id}`, input)
  return data
}

export async function deleteGroupCategory(groupId: number, id: number): Promise<void> {
  await api.delete(`/groups/${groupId}/categories/${id}`)
}

export async function fetchGroupTransactions(groupId: number, month: Month): Promise<GroupTransaction[]> {
  const { data } = await api.get<GroupTransaction[]>(`/groups/${groupId}/transactions`, { params: { month } })
  return data
}

/** Resolves with every occurrence created */
export async function createGroupTransaction(
  groupId: number,
  input: GroupTransactionInput,
): Promise<GroupTransaction[]> {
  const { data } = await api.post<GroupTransaction[]>(`/groups/${groupId}/transactions`, input)
  return data
}

export async function updateGroupTransaction(
  groupId: number,
  id: number,
  patch: GroupTransactionPatch,
  scope: RecurrenceScope = 'ONE',
): Promise<GroupTransaction> {
  const { data } = await api.patch<GroupTransaction>(`/groups/${groupId}/transactions/${id}`, { ...patch, scope })
  return data
}

export async function deleteGroupTransaction(groupId: number, id: number, scope: RecurrenceScope = 'ONE'): Promise<void> {
  await api.delete(`/groups/${groupId}/transactions/${id}`, { params: { scope } })
}

/** Moves the series' last month: extends it with unpaid copies of the last occurrence, or drops the unpaid ones after it */
export async function setGroupTransactionSeriesEnd(
  groupId: number,
  id: number,
  untilMonth: Month,
): Promise<GroupTransaction[]> {
  const { data } = await api.put<GroupTransaction[]>(`/groups/${groupId}/transactions/${id}/series`, { untilMonth })
  return data
}

export async function payGroupTransaction(groupId: number, id: number, memberId: number): Promise<GroupTransaction> {
  const { data } = await api.put<GroupTransaction>(`/groups/${groupId}/transactions/${id}/payment`, { memberId })
  return data
}

export async function unpayGroupTransaction(groupId: number, id: number): Promise<GroupTransaction> {
  const { data } = await api.delete<GroupTransaction>(`/groups/${groupId}/transactions/${id}/payment`)
  return data
}

/** Confirms (or undoes) that shares of paid items were paid back; only who receives the money may */
export async function setSettlement(groupId: number, input: SettlementInput): Promise<void> {
  await api.post(`/groups/${groupId}/settlements`, input)
}

export async function fetchGroupBalance(groupId: number, month: Month): Promise<GroupBalance> {
  const { data } = await api.get<GroupBalance>(`/groups/${groupId}/balance`, { params: { month } })
  return data
}
