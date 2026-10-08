import { createFileRoute, redirect } from '@tanstack/react-router'
import { CompleteProfileCard } from '@/components/organisms'
import { AuthLayout } from '@/components/templates'
import { authQueries } from '@/features/auth/queries'
import { safeRedirect } from '@/features/auth/redirect'

interface CompleteProfileSearch {
  redirect?: string
}

/** Last sign-up step of a GitHub/Google account (see the `_app` guard). */
export const Route = createFileRoute('/completar-cadastro')({
  validateSearch: (search: Record<string, unknown>): CompleteProfileSearch =>
    typeof search.redirect === 'string' && search.redirect ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, location, search }) => {
    let user
    try {
      user = await context.queryClient.fetchQuery(authQueries.me())
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    if (!user.needsProfile) {
      throw redirect({ href: safeRedirect(search.redirect), replace: true })
    }
    return { user }
  },
  component: CompleteProfilePage,
})

function CompleteProfilePage() {
  const { user } = Route.useRouteContext()
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <AuthLayout>
      <CompleteProfileCard user={user} redirect={redirectTo} />
    </AuthLayout>
  )
}
