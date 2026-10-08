import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { PlusIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, GroupFormDialog } from '@/components/molecules'
import { GroupList, InvitationList } from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { groupErrorMessage } from '@/features/groups/errors'
import { useGroupActions, useInvitationActions } from '@/features/groups/hooks'
import { groupQueries, invitationQueries } from '@/features/groups/queries'
import type { GroupInput, ReceivedInvitation } from '@/features/groups/types'

export const Route = createFileRoute('/_app/grupos/')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(groupQueries.list()),
      queryClient.ensureQueryData(invitationQueries.received()),
    ]),
  component: GroupsPage,
  errorComponent: GroupsError,
})

function GroupsPage() {
  const navigate = useNavigate()
  const { data: groups } = useSuspenseQuery(groupQueries.list())
  const { data: invitations } = useSuspenseQuery(invitationQueries.received())
  const groupActions = useGroupActions()
  const invitationActions = useInvitationActions()
  const [creating, setCreating] = useState(false)

  async function create(input: GroupInput) {
    const group = await groupActions.create(input)
    await navigate({ to: '/grupos/$groupId', params: { groupId: String(group.id) } })
  }

  async function answer(invitation: ReceivedInvitation, accept: boolean) {
    try {
      if (accept) await invitationActions.accept(invitation.id)
      else await invitationActions.decline(invitation.id)
    } catch (error) {
      toast.error(groupErrorMessage(error, 'Não foi possível responder ao convite.'))
    }
  }

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon />
      Novo grupo
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Grupos</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Finanças compartilhadas, como as contas de uma república, divididas entre os membros.
          </p>
        </div>
        {newButton}
      </div>

      {invitations.length > 0 && (
        <InvitationList
          invitations={invitations}
          onAccept={(inv) => answer(inv, true)}
          onDecline={(inv) => answer(inv, false)}
        />
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Você ainda não participa de nenhum grupo"
          description="Crie um grupo e convide as pessoas com quem divide despesas, ou aceite um convite."
          action={newButton}
        />
      ) : (
        <GroupList groups={groups} />
      )}

      <GroupFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={create}
        errorMessage={(error) => groupErrorMessage(error, 'Não foi possível criar o grupo.')}
      />
    </div>
  )
}

function GroupsError() {
  const router = useRouter()
  return (
    <EmptyState
      title="Não foi possível carregar os grupos"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}
