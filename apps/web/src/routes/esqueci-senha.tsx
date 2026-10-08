import { createFileRoute } from '@tanstack/react-router'
import { ForgotPasswordCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'

interface ForgotPasswordSearch {
  email?: string
}

/** "Esqueci minha senha": asks for the reset link (`?email=` comes from the login). */
export const Route = createFileRoute('/esqueci-senha')({
  validateSearch: (search: Record<string, unknown>): ForgotPasswordSearch =>
    typeof search.email === 'string' && search.email ? { email: search.email } : {},
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { email } = Route.useSearch()

  return (
    <AuthLayout>
      <ForgotPasswordCard email={email} />
    </AuthLayout>
  )
}
