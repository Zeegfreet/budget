import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { EyeIcon, PencilIcon } from 'lucide-react'
import { FormAlert, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import {
  getConsentErrorMessage,
  getRequestErrorMessage,
} from '@/features/agents/errors'
import { useDecideAuthorization } from '@/features/agents/hooks'
import { agentQueries } from '@/features/agents/queries'
import { scopeLabels } from '@/features/agents/scopes'
import type { AgentScope, AuthorizationRequest } from '@/features/agents/types'
import type { AuthUser } from '@/features/auth/types'
import { assignLocation } from '@/lib/browser'

const scopeIcons: Record<AgentScope, React.ComponentType<{ className?: string }>> = {
  'budget:read': EyeIcon,
  'budget:write': PencilIcon,
}

interface AgentConsentCardProps {
  user: AuthUser
  requestId?: string
  /** `?error=` from the API when it couldn't trust the agent */
  error?: string
}

/**
 * The consent screen of the OAuth flow: an AI agent (MCP client) asks for
 * access to the signed-in user's budget, who allows or denies it. Either way
 * the browser goes back to the agent.
 */
export function AgentConsentCard({ user, requestId, error }: AgentConsentCardProps) {
  const query = useQuery({ ...agentQueries.request(requestId ?? ''), enabled: Boolean(requestId) })

  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      {error || !requestId ? (
        <Problem message={getConsentErrorMessage(error ?? '')} />
      ) : query.isError ? (
        <Problem message={getRequestErrorMessage(query.error)} />
      ) : query.data ? (
        <Consent user={user} request={query.data} />
      ) : (
        <CardContent className="flex justify-center py-6">
          <Spinner aria-label="Carregando pedido de acesso" />
        </CardContent>
      )}
    </Card>
  )
}

function Consent({ user, request }: { user: AuthUser; request: AuthorizationRequest }) {
  const decision = useDecideAuthorization(request.id)
  const name = request.client.name

  function decide(approve: boolean) {
    decision.mutate(approve, { onSuccess: (redirectUrl) => assignLocation(redirectUrl) })
  }

  const done = decision.isSuccess

  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Conectar {name}</h1>
        <CardDescription>
          <strong className="text-foreground">{name}</strong> quer acessar sua conta do Budget (
          {user.email}). Depois da sua resposta, você volta para{' '}
          <strong className="text-foreground [overflow-wrap:anywhere]">{request.redirectHost}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="agent-scopes">
          <h2 id="agent-scopes" className="mb-3 text-sm font-medium">
            O agente poderá:
          </h2>
          <ul className="flex flex-col gap-3">
            {request.scopes.map((scope) => {
              const Icon = scopeIcons[scope]
              return (
                <li key={scope} className="flex gap-3 rounded-lg border p-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="text-sm">
                    <p className="font-medium">{scopeLabels[scope].title}</p>
                    <p className="text-muted-foreground">{scopeLabels[scope].description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        <p className="text-sm text-muted-foreground">
          Só permita agentes em que você confia. Você pode desconectá-lo quando quiser em{' '}
          <span className="font-medium text-foreground">Agentes de IA</span>, no menu da sua conta.
        </p>
        {decision.isError && <FormAlert>{getRequestErrorMessage(decision.error)}</FormAlert>}
        {done && (
          <p role="status" className="text-center text-sm text-muted-foreground">
            Redirecionando para o agente…
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button
            variant="outline"
            size="lg"
            className="h-10 flex-1"
            disabled={decision.isPending || done}
            onClick={() => decide(false)}
          >
            Negar
          </Button>
          <Button
            size="lg"
            className="h-10 flex-1"
            disabled={decision.isPending || done}
            onClick={() => decide(true)}
          >
            {decision.isPending && decision.variables && <Spinner aria-label="Conectando" />}
            Permitir
          </Button>
        </div>
      </CardContent>
    </>
  )
}

function Problem({ message }: { message: string }) {
  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Conectar agente de IA</h1>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormAlert>{message}</FormAlert>
        <Button asChild variant="outline" className="w-full">
          <Link to="/">Ir para o Budget</Link>
        </Button>
      </CardContent>
    </>
  )
}
