import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppLayout } from '@/components/templates'
import { authQueries } from '@/features/auth/queries'

/**
 * Pathless layout for the authenticated area. Nothing under it renders until
 * the session is confirmed. Any failure to confirm it (401, API offline, auth
 * routes missing) counts as signed out: visitors go to /login and come back
 * here afterwards.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      const user = await context.queryClient.ensureQueryData(authQueries.me())
      return { user }
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})
