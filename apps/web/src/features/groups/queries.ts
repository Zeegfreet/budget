import { queryOptions } from '@tanstack/react-query'
import type { Month } from '@/features/budget/types'
import {
  fetchGroup,
  fetchGroupBalance,
  fetchGroupInvitations,
  fetchGroups,
  fetchGroupTransactions,
  fetchReceivedInvitations,
  fetchSplitMethods,
} from './api'

/** Everything of one group sits under `detail(id)`, so invalidating it refreshes the whole page */
export const groupQueries = {
  all: () => ['groups'] as const,
  list: () => queryOptions({ queryKey: [...groupQueries.all(), 'list'], queryFn: fetchGroups }),
  detail: (id: number) => queryOptions({ queryKey: [...groupQueries.all(), id], queryFn: () => fetchGroup(id) }),
  invitations: (id: number) =>
    queryOptions({
      queryKey: [...groupQueries.detail(id).queryKey, 'invitations'],
      queryFn: () => fetchGroupInvitations(id),
    }),
  splitMethods: (id: number) =>
    queryOptions({
      queryKey: [...groupQueries.detail(id).queryKey, 'split-methods'],
      queryFn: () => fetchSplitMethods(id),
    }),
  transactions: (id: number, month: Month) =>
    queryOptions({
      queryKey: [...groupQueries.detail(id).queryKey, 'transactions', month],
      queryFn: () => fetchGroupTransactions(id, month),
    }),
  balance: (id: number, month: Month) =>
    queryOptions({
      queryKey: [...groupQueries.detail(id).queryKey, 'balance', month],
      queryFn: () => fetchGroupBalance(id, month),
    }),
}

export const invitationQueries = {
  received: () => queryOptions({ queryKey: ['invitations'], queryFn: fetchReceivedInvitations }),
}
