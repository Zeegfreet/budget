import { queryOptions } from '@tanstack/react-query'
import { fetchMe } from './api'

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
