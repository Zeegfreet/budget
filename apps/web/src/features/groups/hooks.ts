import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  acceptInvitation,
  cancelInvitation,
  createGroup,
  createGroupTransaction,
  createSplitMethod,
  declineInvitation,
  deleteGroup,
  deleteGroupTransaction,
  deleteSplitMethod,
  inviteMember,
  leaveGroup,
  payGroupTransaction,
  removeMember,
  unpayGroupTransaction,
  updateGroup,
  updateGroupTransaction,
  updateSplitMethod,
} from './api'
import { groupQueries, invitationQueries } from './queries'
import type {
  GroupInput,
  GroupTransactionInput,
  GroupTransactionPatch,
  RecurrenceScope,
  SplitMethodInput,
} from './types'

/**
 * Changes to groups and memberships. Each resolves once the data is fresh
 * again and rejects with the API error.
 */
export function useGroupActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: groupQueries.all() })
  return {
    /**
     * Drops a group the user no longer sees (deleted or left). Call it after
     * leaving its page, or the page would refetch it and get a 404.
     */
    forget(id: number) {
      queryClient.removeQueries({ queryKey: groupQueries.detail(id).queryKey })
      return queryClient.invalidateQueries({ queryKey: groupQueries.list().queryKey })
    },
    async create(input: GroupInput) {
      const group = await createGroup(input)
      await refresh()
      toast.success('Grupo criado')
      return group
    },
    async update(id: number, input: GroupInput) {
      await updateGroup(id, input)
      await refresh()
      toast.success('Grupo alterado')
    },
    async remove(id: number) {
      await deleteGroup(id)
      toast.success('Grupo excluído')
    },
    async leave(id: number) {
      await leaveGroup(id)
      toast.success('Você saiu do grupo')
    },
    async removeMember(groupId: number, memberId: number) {
      await removeMember(groupId, memberId)
      await queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey })
      toast.success('Membro removido')
    },
  }
}

/** Invitations: sending and canceling (a group's) and answering (the user's). */
export function useInvitationActions() {
  const queryClient = useQueryClient()
  const refreshGroup = (groupId: number) =>
    queryClient.invalidateQueries({ queryKey: groupQueries.invitations(groupId).queryKey })

  return {
    async invite(groupId: number, email: string) {
      await inviteMember(groupId, email)
      await refreshGroup(groupId)
      toast.success('Convite enviado')
    },
    async cancel(groupId: number, id: number) {
      await cancelInvitation(groupId, id)
      await refreshGroup(groupId)
      toast.success('Convite cancelado')
    },
    async accept(id: number) {
      await acceptInvitation(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invitationQueries.received().queryKey }),
        queryClient.invalidateQueries({ queryKey: groupQueries.all() }),
      ])
      toast.success('Você entrou no grupo')
    },
    async decline(id: number) {
      await declineInvitation(id)
      await queryClient.invalidateQueries({ queryKey: invitationQueries.received().queryKey })
      toast.success('Convite recusado')
    },
  }
}

/** The group's split rules; changes refresh the whole group (rules show up in its transactions). */
export function useSplitMethodActions(groupId: number) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey })

  return {
    async create(input: SplitMethodInput) {
      await createSplitMethod(groupId, input)
      await refresh()
      toast.success('Regra criada')
    },
    async update(id: number, input: Partial<SplitMethodInput>) {
      await updateSplitMethod(groupId, id, input)
      await refresh()
      toast.success('Regra alterada')
    },
    async remove(id: number) {
      await deleteSplitMethod(groupId, id)
      await refresh()
      toast.success('Regra excluída')
    },
  }
}

/** The group's transactions; changes refresh the list and the balance. */
export function useGroupTransactionActions(groupId: number) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey })

  return {
    async create(input: GroupTransactionInput) {
      const created = await createGroupTransaction(groupId, input)
      await refresh()
      toast.success(created.length > 1 ? `${created.length} lançamentos criados` : 'Lançamento criado')
    },
    async update(id: number, patch: GroupTransactionPatch, scope: RecurrenceScope) {
      await updateGroupTransaction(groupId, id, patch, scope)
      await refresh()
      toast.success('Lançamento alterado')
    },
    async remove(id: number, scope: RecurrenceScope) {
      await deleteGroupTransaction(groupId, id, scope)
      await refresh()
      toast.success(scope === 'FOLLOWING' ? 'Lançamentos excluídos' : 'Lançamento excluído')
    },
    async pay(id: number, memberId: number) {
      await payGroupTransaction(groupId, id, memberId)
      await refresh()
    },
    async unpay(id: number) {
      await unpayGroupTransaction(groupId, id)
      await refresh()
    },
  }
}
