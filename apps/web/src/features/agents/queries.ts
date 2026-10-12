import { queryOptions } from '@tanstack/react-query'
import { fetchAuthorizationRequest, fetchGrants, fetchMcpInfo } from './api'

export const agentQueries = {
  all: () => ['agents'] as const,
  /** Read once: a decided request is gone, so never refetch it */
  request: (id: string) =>
    queryOptions({
      queryKey: [...agentQueries.all(), 'request', id],
      queryFn: () => fetchAuthorizationRequest(id),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }),
  grants: () => queryOptions({ queryKey: [...agentQueries.all(), 'grants'], queryFn: fetchGrants }),
  info: () =>
    queryOptions({ queryKey: [...agentQueries.all(), 'info'], queryFn: fetchMcpInfo, staleTime: Infinity }),
}
