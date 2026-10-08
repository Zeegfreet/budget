import {
  ConfirmDialog,
  GroupFormDialog,
  GroupLinkDialog,
  InviteMemberDialog,
  SplitMethodFormDialog,
} from '@/components/molecules'
import type { CategoryGroup } from '@/features/budget/types'
import { groupErrorMessage } from '@/features/groups/errors'
import type { useInvitationActions, useSplitMethodActions } from '@/features/groups/hooks'
import type {
  FinanceGroup,
  GroupInput,
  GroupInvitation,
  GroupLink,
  GroupMember,
  SplitMethod,
} from '@/features/groups/types'
import type { PaymentMethod } from '@/features/payment-methods/types'

/** The dialog open on a group's page for the group itself, its members or its rules */
export type GroupDialog =
  | { type: 'edit-group' | 'delete-group' | 'leave' | 'invite' | 'create-rule' | 'link' }
  | { type: 'remove-member'; member: GroupMember }
  | { type: 'cancel-invitation'; invitation: GroupInvitation }
  | { type: 'edit-rule' | 'delete-rule'; method: SplitMethod }
  | null

interface GroupDialogsProps {
  dialog: GroupDialog
  onDialogChange: (dialog: GroupDialog) => void
  group: FinanceGroup
  /** Each resolves once done (deleting and leaving also move away from the page) */
  onUpdateGroup: (input: GroupInput) => Promise<void>
  onDeleteGroup: () => Promise<void>
  onLeave: () => Promise<void>
  onRemoveMember: (member: GroupMember) => Promise<void>
  /** The user's category tree, for the link dialog (empty while loading) */
  categories: CategoryGroup[]
  /** Offered in the link dialog */
  paymentMethods?: PaymentMethod[]
  onSetLink: (link: GroupLink) => Promise<void>
  invitations: ReturnType<typeof useInvitationActions>
  rules: ReturnType<typeof useSplitMethodActions>
}

const message = (fallback: string) => (error: unknown) => groupErrorMessage(error, fallback)

/**
 * Rename, delete and leave the group; link it to the user's budget; invite and
 * remove members; create, edit and delete rules.
 */
export function GroupDialogs({
  dialog,
  onDialogChange,
  group,
  onUpdateGroup,
  onDeleteGroup,
  onLeave,
  onRemoveMember,
  categories,
  paymentMethods,
  onSetLink,
  invitations,
  rules,
}: GroupDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onDialogChange(null)
  }
  const member = dialog?.type === 'remove-member' ? dialog.member : null
  const invitation = dialog?.type === 'cancel-invitation' ? dialog.invitation : null
  const method = dialog?.type === 'edit-rule' || dialog?.type === 'delete-rule' ? dialog.method : null
  const lastMember = group.memberCount === 1

  return (
    <>
      <GroupFormDialog
        open={dialog?.type === 'edit-group'}
        onOpenChange={close}
        initial={{ name: group.name, description: group.description }}
        onSubmit={onUpdateGroup}
        errorMessage={message('Não foi possível salvar.')}
      />
      <GroupLinkDialog
        open={dialog?.type === 'link'}
        onOpenChange={close}
        groupName={group.name}
        categories={categories}
        paymentMethods={paymentMethods}
        initial={group.link}
        onSubmit={onSetLink}
        errorMessage={message('Não foi possível salvar o vínculo.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-group'}
        onOpenChange={close}
        title="Excluir grupo"
        description={
          <>
            Excluir <strong>{group.name}</strong> com todos os lançamentos, regras e convites? Essa ação não pode ser
            desfeita.
          </>
        }
        confirmLabel="Excluir grupo"
        onConfirm={onDeleteGroup}
        errorMessage={message('Não foi possível excluir o grupo.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'leave'}
        onOpenChange={close}
        title="Sair do grupo"
        description={
          lastMember ? (
            <>
              Você é o último membro: sair exclui <strong>{group.name}</strong> com todos os lançamentos.
            </>
          ) : (
            <>
              Você deixa de ver <strong>{group.name}</strong>. O histórico dos lançamentos é mantido para os outros
              membros, e só um novo convite traz você de volta.
            </>
          )
        }
        confirmLabel="Sair do grupo"
        onConfirm={onLeave}
        errorMessage={message('Não foi possível sair do grupo.')}
      />
      <InviteMemberDialog
        open={dialog?.type === 'invite'}
        onOpenChange={close}
        groupName={group.name}
        onSubmit={(input) => invitations.invite(group.id, input)}
        errorMessage={message('Não foi possível enviar o convite.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'remove-member'}
        onOpenChange={close}
        title="Remover membro"
        description={
          <>
            Remover <strong>{member?.name}</strong> do grupo? A pessoa perde o acesso, e as regras de percentual ou
            valores fixos que a incluem ficam inativas até serem ajustadas.
          </>
        }
        confirmLabel="Remover"
        onConfirm={() => onRemoveMember(member!)}
        errorMessage={message('Não foi possível remover o membro.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'cancel-invitation'}
        onOpenChange={close}
        title="Cancelar convite"
        description={
          <>
            Cancelar o convite de <strong>{invitation?.invitee.name}</strong>?
          </>
        }
        confirmLabel="Cancelar convite"
        onConfirm={() => invitations.cancel(group.id, invitation!.id)}
        errorMessage={message('Não foi possível cancelar o convite.')}
      />
      <SplitMethodFormDialog
        open={dialog?.type === 'create-rule'}
        onOpenChange={close}
        members={group.members}
        onSubmit={rules.create}
        errorMessage={message('Não foi possível criar a regra.')}
      />
      <SplitMethodFormDialog
        open={dialog?.type === 'edit-rule'}
        onOpenChange={close}
        members={group.members}
        initial={method ?? undefined}
        onSubmit={(values) => rules.update(method!.id, values)}
        errorMessage={message('Não foi possível salvar a regra.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-rule'}
        onOpenChange={close}
        title="Excluir regra"
        description={
          <>
            Excluir <strong>{method?.name}</strong>? Os lançamentos que a usam mantêm a divisão já feita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => rules.remove(method!.id)}
        errorMessage={message('Não foi possível excluir a regra.')}
      />
    </>
  )
}
