import { createFileRoute } from '@tanstack/react-router'
import { SignupCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'
import { redirectIfSignedIn } from '@/features/auth/session'

interface SignupSearch {
  redirect?: string
}

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): SignupSearch =>
    typeof search.redirect === 'string' && search.redirect ? { redirect: search.redirect } : {},
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search.redirect),
  component: SignupPage,
})

function SignupPage() {
  const { redirect } = Route.useSearch()

  return (
    <AuthLayout>
      <SignupCard redirect={redirect} />
    </AuthLayout>
  )
}
