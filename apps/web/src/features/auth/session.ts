import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { authQueries } from './queries'
import { safeRedirect } from './redirect'

/** For guest-only routes (login, sign-up): a signed-in user skips the form. */
export async function redirectIfSignedIn(queryClient: QueryClient, redirectTo?: string) {
  const user = await queryClient.fetchQuery(authQueries.me()).catch(() => null)
  if (user) throw redirect({ href: safeRedirect(redirectTo), replace: true })
}
