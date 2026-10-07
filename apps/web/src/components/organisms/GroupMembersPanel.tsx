import { MailIcon, UserMinusIcon, UserPlusIcon, XIcon } from 'lucide-react'
import { UserAvatar } from '@/components/atoms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinanceGroup, GroupInvitation, GroupMember } from '@/features/groups/types'

export type MembersAction =
  | { type: 'invite' }
  | { type: 'remove-member'; member: GroupMember }
  | { type: 'cancel-invitation'; invitation: GroupInvitation }

interface GroupMembersPanelProps {
  group: FinanceGroup
  invitations: GroupInvitation[]
  onAction: (action: MembersAction) => void
}

/** Who is in the group and who was invited; the owner may remove members. */
export function GroupMembersPanel({ group, invitations, onAction }: GroupMembersPanelProps) {
  const owner = group.role === 'OWNER'
  return (
    <div className="flex flex-col gap-6">
      <Card role="region" aria-label="Membros">
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Todos os membros veem e lançam as receitas e despesas do grupo.</CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => onAction({ type: 'invite' })}>
              <UserPlusIcon />
              Convidar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {group.members.map((m) => (
              <li key={m.id} aria-label={m.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <UserAvatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {m.name}
                    {m.id === group.memberId && <Badge variant="secondary">Você</Badge>}
                    {m.role === 'OWNER' && <Badge variant="outline">Dono</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                </div>
                {owner && m.id !== group.memberId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover ${m.name}`}
                    onClick={() => onAction({ type: 'remove-member', member: m })}
                  >
                    <UserMinusIcon />
                    <span className="hidden sm:inline">Remover</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card role="region" aria-label="Convites pendentes">
        <CardHeader>
          <CardTitle>Convites pendentes</CardTitle>
          <CardDescription>A pessoa entra no grupo quando aceitar o convite.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
          ) : (
            <ul className="divide-y">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  aria-label={inv.invitee.email}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <MailIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.invitee.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {inv.invitee.email} · convidado por {inv.inviter.name}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Cancelar convite de ${inv.invitee.name}`}
                    onClick={() => onAction({ type: 'cancel-invitation', invitation: inv })}
                  >
                    <XIcon />
                    <span className="hidden sm:inline">Cancelar</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
