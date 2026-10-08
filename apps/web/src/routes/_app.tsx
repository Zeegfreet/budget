import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppLayout } from '@/components/templates'
import { authQueries } from '@/features/auth/queries'

/**
 * Pathless layout for the authenticated area. Nothing under it renders until
 * the session is confirmed. Any failure to confirm it (401, API offline, auth
 * routes missing) counts as signed out: visitors go to /login and come back
 * here afterwards. A GitHub/Google account still without birth date and
 * address finishes the sign-up first.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    let user
    try {
      user = await context.queryClient.ensureQueryData(authQueries.me())
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    if (user.needsProfile) {
      throw redirect({ to: '/completar-cadastro', search: { redirect: location.href } })
    }
    return { user }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})
