import { createFileRoute } from '@tanstack/react-router'
import { ActivationCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'

interface ActivateSearch {
  token?: string
}

/** The page the activation e-mails link to (`?token=`). */
export const Route = createFileRoute('/ativar-conta')({
  validateSearch: (search: Record<string, unknown>): ActivateSearch =>
    typeof search.token === 'string' && search.token ? { token: search.token } : {},
  component: ActivatePage,
})

function ActivatePage() {
  const { token } = Route.useSearch()

  return (
    <AuthLayout>
      <ActivationCard token={token} />
    </AuthLayout>
  )
}
