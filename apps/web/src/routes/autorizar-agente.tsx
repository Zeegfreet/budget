import { createFileRoute, redirect } from '@tanstack/react-router'
import { AgentConsentCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'
import { authQueries } from '@/features/auth/queries'

interface ConsentSearch {
  request?: string
  error?: string
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/**
 * Consent screen of the MCP OAuth flow (`/oauth/authorize` sends the browser
 * here). Outside `_app`: no side menu, and a profile still to complete doesn't
 * stand in the way. Signing in comes back here.
 */
export const Route = createFileRoute('/autorizar-agente')({
  validateSearch: (search: Record<string, unknown>): ConsentSearch => {
    const request = text(search.request)
    const error = text(search.error)
    return { ...(request && { request }), ...(error && { error }) }
  },
  beforeLoad: async ({ context, location }) => {
    try {
      return { user: await context.queryClient.fetchQuery(authQueries.me()) }
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AgentConsentPage,
})

function AgentConsentPage() {
  const { user } = Route.useRouteContext()
  const { request, error } = Route.useSearch()

  return (
    <AuthLayout>
      <AgentConsentCard user={user} requestId={request} error={error} />
    </AuthLayout>
  )
}
