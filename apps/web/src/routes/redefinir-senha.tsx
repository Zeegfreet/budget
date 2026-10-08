import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'

interface ResetPasswordSearch {
  token?: string
}

/** The page the password reset e-mails link to (`?token=`). */
export const Route = createFileRoute('/redefinir-senha')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch =>
    typeof search.token === 'string' && search.token ? { token: search.token } : {},
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()

  return (
    <AuthLayout>
      <ResetPasswordCard token={token} />
    </AuthLayout>
  )
}
