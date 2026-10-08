import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'

interface VerifyEmailSearch {
  email?: string
}

/** Where the sign-up lands: the account waits for the e-mailed activation link. */
export const Route = createFileRoute('/verificar-email')({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch =>
    typeof search.email === 'string' && search.email ? { email: search.email } : {},
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { email } = Route.useSearch()

  return (
    <AuthLayout>
      <VerifyEmailCard email={email} />
    </AuthLayout>
  )
}
