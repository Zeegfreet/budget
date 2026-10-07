import { createFileRoute } from '@tanstack/react-router'
import { LoginCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'
import { getLoginErrorMessage } from '@/features/auth/errors'
import { redirectIfSignedIn } from '@/features/auth/session'

interface LoginSearch {
  redirect?: string
  error?: string
}

const nonEmptyString = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const result: LoginSearch = {}
    const redirectTo = nonEmptyString(search.redirect)
    const error = nonEmptyString(search.error)
    if (redirectTo) result.redirect = redirectTo
    if (error) result.error = error
    return result
  },
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search.redirect),
  component: LoginPage,
})

function LoginPage() {
  const { error, redirect: redirectTo } = Route.useSearch()

  return (
    <AuthLayout>
      <LoginCard
        error={error ? getLoginErrorMessage(error) : undefined}
        redirect={redirectTo}
      />
    </AuthLayout>
  )
}
