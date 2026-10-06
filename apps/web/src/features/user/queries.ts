import { queryOptions } from '@tanstack/react-query'
import { fetchUsers } from './api'

/**
 * Query key factory + options for the user feature. Reuse these in components
 * (`useQuery(userQueries.all())`) and route loaders
 * (`context.queryClient.ensureQueryData(userQueries.all())`) so keys stay in sync.
 */
export const userQueries = {
  all: () =>
    queryOptions({
      queryKey: ['users'],
      queryFn: fetchUsers,
    }),
}
