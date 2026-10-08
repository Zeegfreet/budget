import { queryOptions } from '@tanstack/react-query'
import { fetchActivation, fetchMe, fetchPasswordReset } from './api'

export const authQueries = {
  /** Current session. Rejects with `ApiError` 401 when signed out. */
  me: () =>
    queryOptions({
      queryKey: ['auth', 'me'],
      queryFn: fetchMe,
      retry: false,
      staleTime: 60_000,
    }),
}

export const activationQueries = {
  /** The account behind an activation link (no side effects; the link stays valid). */
  byToken: (token: string) =>
    queryOptions({
      queryKey: ['activation', token],
      queryFn: () => fetchActivation(token),
      retry: false,
      staleTime: Infinity,
    }),
}

export const passwordResetQueries = {
  /** The account behind a password reset link (no side effects; the link stays valid). */
  byToken: (token: string) =>
    queryOptions({
      queryKey: ['password-reset', token],
      queryFn: () => fetchPasswordReset(token),
      retry: false,
      staleTime: Infinity,
    }),
}
