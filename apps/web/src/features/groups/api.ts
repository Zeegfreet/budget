import { api } from '@/lib/api/client'
import type { Month } from '@/features/budget/types'
import type {
  FinanceGroup,
  FinanceGroupSummary,
  GroupBalance,
  GroupInput,
  GroupInvitation,
  GroupLink,
  GroupTransaction,
  GroupTransactionInput,
  GroupTransactionPatch,
  ReceivedInvitation,
  RecurrenceScope,
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

export async function inviteMember(groupId: number, email: string): Promise<GroupInvitation> {
  const { data } = await api.post<GroupInvitation>(`/groups/${groupId}/invitations`, { email })
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

export async function payGroupTransaction(groupId: number, id: number, memberId: number): Promise<GroupTransaction> {
  const { data } = await api.put<GroupTransaction>(`/groups/${groupId}/transactions/${id}/payment`, { memberId })
  return data
}

export async function unpayGroupTransaction(groupId: number, id: number): Promise<GroupTransaction> {
  const { data } = await api.delete<GroupTransaction>(`/groups/${groupId}/transactions/${id}/payment`)
  return data
}

export async function fetchGroupBalance(groupId: number, month: Month): Promise<GroupBalance> {
  const { data } = await api.get<GroupBalance>(`/groups/${groupId}/balance`, { params: { month } })
  return data
}
