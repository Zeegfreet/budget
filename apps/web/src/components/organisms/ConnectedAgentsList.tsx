import { useQuery } from '@tanstack/react-query'
import { BotIcon } from 'lucide-react'
import { useState } from 'react'
import { FormAlert, Spinner } from '@/components/atoms'
import { ConfirmDialog, EmptyState } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/features/agents/dates'
import { getRevokeErrorMessage } from '@/features/agents/errors'
import { useRevokeGrant } from '@/features/agents/hooks'
import { agentQueries } from '@/features/agents/queries'
import { accessLabel } from '@/features/agents/scopes'
import type { AgentGrant } from '@/features/agents/types'

/** The user's connected AI agents, each with a "Desconectar" action. */
export function ConnectedAgentsList() {
  const query = useQuery(agentQueries.grants())
  const revoke = useRevokeGrant()
  const [target, setTarget] = useState<AgentGrant | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Agentes conectados</h2>
        </CardTitle>
        <CardDescription>Agentes que podem acessar suas finanças agora.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="flex justify-center py-4">
            <Spinner aria-label="Carregando agentes" />
          </div>
        ) : query.isError ? (
          <FormAlert>Não foi possível carregar os agentes conectados.</FormAlert>
        ) : query.data.length === 0 ? (
          <EmptyState
            icon={BotIcon}
            title="Nenhum agente conectado"
            description="Quando você permitir o acesso de um agente, ele aparece aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Agentes conectados">
            {query.data.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium [overflow-wrap:anywhere]">{grant.client.name}</span>
                    <Badge variant="secondary">{accessLabel(grant.scopes)}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Conectado em {formatDate(grant.createdAt)} · Último uso em {formatDate(grant.lastUsedAt)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Desconectar ${grant.client.name}`}
                  onClick={() => setTarget(grant)}
                >
                  Desconectar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Desconectar ${target?.client.name ?? 'agente'}?`}
        description="O agente perde o acesso às suas finanças na hora. Para usá-lo de novo, conecte outra vez."
        confirmLabel="Desconectar"
        onConfirm={async () => {
          if (target) await revoke.mutateAsync(target.id)
        }}
        errorMessage={getRevokeErrorMessage}
      />
    </Card>
  )
}
