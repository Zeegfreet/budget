import { CheckIcon, MailIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReceivedInvitation } from '@/features/groups/types'

interface InvitationListProps {
  invitations: ReceivedInvitation[]
  /** Each settles once the lists are fresh; errors are the page's to show */
  onAccept: (invitation: ReceivedInvitation) => Promise<void>
  onDecline: (invitation: ReceivedInvitation) => Promise<void>
}

/** Pending invitations to join groups, to accept or decline. */
export function InvitationList({ invitations, onAccept, onDecline }: InvitationListProps) {
  const [pending, setPending] = useState<{ id: number; action: 'accept' | 'decline' } | null>(null)

  async function answer(invitation: ReceivedInvitation, action: 'accept' | 'decline') {
    setPending({ id: invitation.id, action })
    try {
      await (action === 'accept' ? onAccept : onDecline)(invitation)
    } finally {
      setPending(null)
    }
  }

  return (
    <Card role="region" aria-label="Convites recebidos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" aria-hidden />
          Convites recebidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              aria-label={inv.group.name}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{inv.group.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  Convite de {inv.inviter.name} ({inv.inviter.email})
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button variant="outline" size="sm" disabled={!!pending} onClick={() => answer(inv, 'decline')}>
                  {pending?.id === inv.id && pending.action === 'decline' ? <Spinner /> : <XIcon />}
                  Recusar
                </Button>
                <Button size="sm" disabled={!!pending} onClick={() => answer(inv, 'accept')}>
                  {pending?.id === inv.id && pending.action === 'accept' ? <Spinner /> : <CheckIcon />}
                  Aceitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
