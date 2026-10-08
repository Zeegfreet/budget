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
  setGroupLink,
  setGroupTransactionSeriesEnd,
  setSettlement,
  unpayGroupTransaction,
  updateGroup,
  updateGroupTransaction,
  updateSplitMethod,
} from './api'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { groupQueries, invitationQueries } from './queries'
import type {
  GroupInput,
  GroupLink,
  GroupTransactionInput,
  GroupTransactionPatch,
  InvitationInput,
  RecurrenceScope,
  SettlementInput,
  SplitMethodInput,
} from './types'

/**
 * Changes to groups and memberships. Each resolves once the data is fresh
 * again and rejects with the API error.
 */
export function useGroupActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: groupQueries.all() })
  // The user's shares show up in the personal budget (statement, grid, summary)
  const refreshBudget = () => queryClient.invalidateQueries({ queryKey: budgetQueries.all() })
  return {
    /**
     * Drops a group the user no longer sees (deleted or left). Call it after
     * leaving its page, or the page would refetch it and get a 404.
     */
    forget(id: number) {
      queryClient.removeQueries({ queryKey: groupQueries.detail(id).queryKey })
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: groupQueries.list().queryKey }),
        refreshBudget(),
      ])
    },
    /** Chooses where the user's shares of the group count in their budget */
    async setLink(id: number, link: GroupLink) {
      await setGroupLink(id, link)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupQueries.detail(id).queryKey }),
        refreshBudget(),
      ])
      toast.success('Vínculo com o orçamento salvo')
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey }),
        refreshBudget(),
      ])
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
    async invite(groupId: number, input: InvitationInput) {
      const invitation = await inviteMember(groupId, input)
      if (invitation.status === 'PENDING') {
        await refreshGroup(groupId)
        toast.success('Convite enviado', {
          description: `Avisamos ${invitation.invitee.email} por e-mail.`,
        })
        return
      }
      // A pre-registration joins right away: members, rules and shares change
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey }),
        queryClient.invalidateQueries({ queryKey: budgetQueries.all() }),
      ])
      toast.success(`${invitation.invitee.name} entrou no grupo (pré-cadastro)`, {
        description: `Enviamos um link de ativação para ${invitation.invitee.email}.`,
      })
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
        queryClient.invalidateQueries({ queryKey: budgetQueries.all() }),
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

/**
 * The group's split rules; changes refresh the whole group (rules show up in
 * its transactions) and the personal budget, since editing a rule divides the
 * pending transactions again.
 */
export function useSplitMethodActions(groupId: number) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey }),
      queryClient.invalidateQueries({ queryKey: budgetQueries.all() }),
    ])

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

/**
 * The group's transactions; changes refresh the list and the balance, and the
 * personal budget, where the user's shares count.
 */
export function useGroupTransactionActions(groupId: number) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupQueries.detail(groupId).queryKey }),
      queryClient.invalidateQueries({ queryKey: budgetQueries.all() }),
    ])

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
    async setSeriesEnd(id: number, untilMonth: Month) {
      const series = await setGroupTransactionSeriesEnd(groupId, id, untilMonth)
      await refresh()
      toast.success(`Recorrência ajustada: ${series.length} ${series.length === 1 ? 'lançamento' : 'lançamentos'}`)
    },
    async pay(id: number, memberId: number) {
      await payGroupTransaction(groupId, id, memberId)
      await refresh()
    },
    async unpay(id: number) {
      await unpayGroupTransaction(groupId, id)
      await refresh()
    },
    /** Confirms (or undoes) that members paid their shares back */
    async setSettlement(input: SettlementInput) {
      await setSettlement(groupId, input)
      await refresh()
    },
  }
}
